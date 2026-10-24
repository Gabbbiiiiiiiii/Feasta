import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {AgreementTextValidationError, validateAgreementSections} from "../shared/agreement-text.js";

import {
  agreementVersionsFromDocument,
  appendDraftVersion,
  assertPublishedLegalContentUnchanged,
  currentAgreementVersion,
  deleteDraftVersion,
  mergePriorVersions,
  normalizeAgreementVersionLabel,
  publishDraftVersion,
  replaceDraftVersion,
  versionAudit,
  type AgreementVersionRecord,
} from "../shared/agreement-versions.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {
  AGREEMENT_TYPES,
  isTrustedAgreementType,
  parseAgreementType,
} from "../shared/agreement-types.js";
import {isRealCalendarDate} from "../shared/agreement-version-order.js";
import {
  AGREEMENT_TEMPLATES,
  BUSINESS_DOCUMENT_TYPES,
  DOCUMENT_CATEGORIES,
  isDocumentCode,
  type BusinessDocumentRule,
  type DocumentServiceType,
} from "../shared/document-catalog.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {
  requireBoolean,
  requireObject,
  requireString,
} from "../shared/validation.js";

type CatalogStatus = "active" | "discontinued";

type AgreementSection = {
  title: string;
  paragraphs: string[];
};

async function authorizeAdmin(
  request: Parameters<typeof requireAuth>[0],
  scope: string,
) {
  const actor = requireAuth(request);
  await enforceCallableRateLimit(request, {
    scope,
    limit: 60,
    windowSeconds: 60 * 60,
  });
  await requireRole(actor.uid, [USER_ROLES.admin]);
  return actor;
}

function requireCode(value: unknown, fieldName = "code"): string {
  const code = requireString(value, fieldName, {minLength: 2, maxLength: 100});
  if (!isDocumentCode(code)) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must contain only lowercase letters, numbers, and underscores.`,
    );
  }
  return code;
}

function rejectClientPurposeOverrides(input: Record<string, unknown>): void {
  if (
    "useForProviderOnboarding" in input ||
    "purpose" in input ||
    "status" in input ||
    "requiresAcceptance" in input ||
    "targetAudience" in input ||
    "singleton" in input
  ) {
    const message = "Agreement purpose comes from the agreement type.";
    throw new HttpsError("invalid-argument", message, {userMessage: message});
  }
}

function invalidAgreement(message: string): HttpsError {
  return new HttpsError("invalid-argument", message, {userMessage: message});
}

function agreementPrecondition(message: string): HttpsError {
  return new HttpsError("failed-precondition", message, {userMessage: message});
}

function rejectDraftPublish(input: Record<string, unknown>): void {
  if (input.publish !== undefined && input.publish !== false) {
    const message = "Saving a draft cannot publish it. Publish the version after it is saved.";
    throw new HttpsError("failed-precondition", message, {userMessage: message});
  }
}

function requireName(value: unknown, fieldName = "name"): string {
  return requireString(value, fieldName, {minLength: 2, maxLength: 120}).trim();
}

function requireDescription(value: unknown): string {
  if (value === undefined || value === null) return "";
  return requireString(value, "description", {minLength: 0, maxLength: 500})
    .trim();
}

async function requireActiveCategory(
  transaction: FirebaseFirestore.Transaction,
  categoryCode: string,
): Promise<void> {
  const snapshot = await transaction.get(
    db.collection(DOCUMENT_CATEGORIES).doc(categoryCode),
  );
  if (!snapshot.exists || snapshot.data()?.status !== "active") {
    throw new HttpsError(
      "failed-precondition",
      "The internal document classification is missing or inactive.",
    );
  }
}

function requireSections(value: unknown): AgreementSection[] {
  try {
    return validateAgreementSections(value);
  } catch (error: unknown) {
    if (!(error instanceof AgreementTextValidationError)) throw error;
    const message = error.message;
    throw new HttpsError(
      "invalid-argument",
      message,
      {userMessage: message},
    );
  }
}

function requireAgreementName(value: unknown): string {
  if (typeof value !== "string") {
    throw invalidAgreement("Agreement name is required.");
  }
  const name = value.trim().replace(/\s+/gu, " ");
  if (!name) throw invalidAgreement("Agreement name is required.");
  if (name.length < 2 || name.length > 120) {
    throw invalidAgreement("Enter an agreement name between 2 and 120 characters.");
  }
  return name;
}

function requireAgreementSummary(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw invalidAgreement("Summary must be 500 characters or fewer.");
  }
  const summary = value.trim();
  if (summary.length > 500) {
    throw invalidAgreement("Summary must be 500 characters or fewer.");
  }
  return summary;
}

function requireVersion(value: unknown): string {
  if (typeof value !== "string") throw invalidAgreement("Enter a valid version.");
  const version = normalizeAgreementVersionLabel(value);
  if (!version || version.length > 40) throw invalidAgreement("Enter a valid version.");
  return version;
}

function requireEffectiveDate(value: unknown): string {
  if (typeof value !== "string" || !isRealCalendarDate(value.trim())) {
    throw invalidAgreement("Enter a valid effective date.");
  }
  return value.trim();
}

function requireRules(value: unknown): BusinessDocumentRule[] {
  if (!Array.isArray(value) || value.length > 12) {
    throw new HttpsError(
      "invalid-argument",
      "rules must be a list of at most 12 requirement rules.",
    );
  }

  return value.map((entry, index) => {
    const record = requireObject(entry, `rules.${index}`);
    if (record.effect !== "required" && record.effect !== "one_of") {
      throw new HttpsError(
        "invalid-argument",
        `rules.${index}.effect must be required or one_of.`,
      );
    }
    if (
      record.registrationScope !== "any" &&
      record.registrationScope !== "registered_business" &&
      record.registrationScope !== "individual"
    ) {
      throw new HttpsError(
        "invalid-argument",
        `rules.${index}.registrationScope is invalid.`,
      );
    }
    const oneOfGroup = record.effect === "one_of" ?
      requireCode(record.oneOfGroup) :
      "";
    return {
      effect: record.effect,
      oneOfGroup,
      registrationScope: record.registrationScope,
      serviceTypes: requireServiceTypes(record.serviceTypes, index),
      serviceCategoryCodes: requireCodeList(
        record.serviceCategoryCodes,
        `rules.${index}.serviceCategoryCodes`,
      ),
      excludeServiceCategoryCodes: requireCodeList(
        record.excludeServiceCategoryCodes,
        `rules.${index}.excludeServiceCategoryCodes`,
      ),
    };
  });
}

function requireServiceTypes(
  value: unknown,
  index: number,
): DocumentServiceType[] {
  if (!Array.isArray(value) || value.length > 3) {
    throw new HttpsError(
      "invalid-argument",
      `rules.${index}.serviceTypes is invalid.`,
    );
  }
  const types = [...new Set(value)];
  if (types.some((type) =>
    type !== "catering" && type !== "addon" && type !== "both",
  )) {
    throw new HttpsError(
      "invalid-argument",
      `rules.${index}.serviceTypes is invalid.`,
    );
  }
  return types as DocumentServiceType[];
}

function requireCodeList(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length > 40) {
    throw new HttpsError("invalid-argument", `${fieldName} is invalid.`);
  }
  const codes = [...new Set(value.map((code) => requireCode(code)))];
  return codes;
}

export const createAgreementTemplate = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "createAgreementTemplate");
    const input = requireObject(request.data);
    rejectClientPurposeOverrides(input);
    rejectDraftPublish(input);
    const code = requireCode(input.code);
    const categoryCode = "agreements";
    const record = agreementRecord(input, code, categoryCode);
    const reference = db.collection(AGREEMENT_TEMPLATES).doc(code);
    const createdAt = new Date().toISOString();
    const versions = [draftVersion(record, createdAt)];

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        const message = "An agreement with this code already exists.";
        throw new HttpsError("already-exists", message, {userMessage: message});
      }
      await requireActiveCategory(transaction, categoryCode);
      const agreementType = await requireActiveAgreementType(
        transaction,
        record.agreementTypeCode,
      );
      const existing = await transaction.get(db.collection(AGREEMENT_TEMPLATES));
      if (
        agreementType.singleton &&
        existing.docs.some((document) =>
          document.id !== code &&
          document.data().agreementTypeCode === agreementType.code,
        )
      ) {
        throw agreementPrecondition(
          `${agreementType.name} already exists. Create a new version instead.`,
        );
      }
      if (agreementType.singleton && record.name !== agreementType.name) {
        throw invalidAgreement(
          `Use the ${agreementType.name} name defined for this agreement type.`,
        );
      }
      transaction.create(reference, {
        ...record,
        versions,
        priorVersions: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor.uid,
        updatedBy: actor.uid,
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: USER_ROLES.admin,
        action: "agreement_template_created",
        targetCollection: AGREEMENT_TEMPLATES,
        targetId: code,
        before: null,
        after: agreementAudit(record),
      });
    });

    return {success: true, agreement: publicAgreement({...record, versions})};
  },
);

export const updateAgreementTemplate = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "updateAgreementTemplate");
    const input = requireObject(request.data);
    rejectClientPurposeOverrides(input);
    rejectDraftPublish(input);
    const code = requireCode(input.code);
    const categoryCode = "agreements";
    const next = agreementContent(input, code, categoryCode);
    const reference = db.collection(AGREEMENT_TEMPLATES).doc(code);

    const updated = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "The agreement was not found.");
      }
      await requireActiveCategory(transaction, categoryCode);
      const before = snapshot.data() ?? {};
      const storedType = typeof before.agreementTypeCode === "string" ?
        before.agreementTypeCode :
        null;
      if (
        "agreementTypeCode" in input &&
        input.agreementTypeCode !== storedType
      ) {
        throw new HttpsError(
          "failed-precondition",
          "An agreement's type cannot be changed.",
        );
      }
      const stored = agreementVersionsFromDocument(before);
      const current = currentAgreementVersion(stored.versions);
      let versions = stored.versions;
      let version = current?.version ?? next.version;
      let effectiveDate = current?.effectiveDate ?? next.effectiveDate;
      let sections = current?.sections ?? next.sections;
      if (current) {
        assertPublishedLegalContentUnchanged(stored.versions, next);
      } else {
        const drafts = stored.versions.filter((entry) => entry.status === "draft");
        if (drafts.length !== 1) {
          throw new HttpsError(
            "failed-precondition",
            "This agreement does not have one editable draft.",
          );
        }
        versions = replaceDraftVersion({
          versions: stored.versions,
          draftVersion: drafts[0].version,
          version: next.version,
          summary: next.summary,
          effectiveDate: next.effectiveDate,
          sections: next.sections,
        }).map((entry) => entry.status === "draft" ? {
          ...entry,
          name: next.name,
        } : entry);
        version = next.version;
        effectiveDate = next.effectiveDate;
        sections = next.sections;
      }

      const record = {
        ...next,
        ...(storedType ? {agreementTypeCode: storedType} : {}),
        version,
        effectiveDate,
        sections,
        status: before.status === "discontinued" ? "discontinued" as const : "active" as const,
        versions,
        priorVersions: mergePriorVersions(before.priorVersions, versions),
      };
      transaction.update(reference, {
        ...record,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: USER_ROLES.admin,
        action: "agreement_template_updated",
        targetCollection: AGREEMENT_TEMPLATES,
        targetId: code,
        before: agreementAudit(before),
        after: agreementAudit(record),
      });
      return record;
    });

    return {success: true, agreement: publicAgreement(updated)};
  },
);

// Retain deployed endpoint names as rejecting compatibility shims. Removing an
// export alone would leave older deployed functions callable until deletion.
export const discontinueAgreementTemplate = onCall(
  appCheckCallableOptions,
  async (request) => rejectAgreementLifecycle(request, "discontinueAgreementTemplate"),
);

export const reactivateAgreementTemplate = onCall(
  appCheckCallableOptions,
  async (request) => rejectAgreementLifecycle(request, "reactivateAgreementTemplate"),
);

export const deleteAgreementTemplate = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "deleteAgreementTemplate");
    const input = requireObject(request.data);
    const code = requireCode(input.code);
    const reference = db.collection(AGREEMENT_TEMPLATES).doc(code);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);

      if (!snapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The agreement was not found.",
        );
      }

      const before = snapshot.data() ?? {};

      if (before.agreementTypeCode !== "custom_agreement") {
        throw agreementPrecondition(
          "Published Provider Agreement, Terms of Service, and Privacy Policy records cannot be permanently deleted.",
        );
      }

      if (before.everUsed === true) {
        throw agreementPrecondition(
          "This Custom Agreement cannot be deleted because it has already been used. Its published history must be preserved.",
        );
      }

      transaction.delete(reference);

      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: USER_ROLES.admin,
        action: "agreement_template_deleted",
        targetCollection: AGREEMENT_TEMPLATES,
        targetId: code,
        before: {
          ...agreementAudit(before),
          versions: versionAudit(
            agreementVersionsFromDocument(before).versions,
          ),
        },
        after: {
          deleted: true,
        },
      });
    });

    return {
      success: true,
      deletedCode: code,
    };
  },
);

async function rejectAgreementLifecycle(
  request: Parameters<typeof requireAuth>[0],
  scope: string,
) {
  await authorizeAdmin(request, scope);
  throw agreementPrecondition("Agreement lifecycle changes are no longer supported.");
}

export const createAgreementVersion = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "createAgreementVersion");
    const input = requireObject(request.data);
    rejectDraftPublish(input);
    const version = requireVersion(input.version);
    const sourceVersion = requireVersion(input.sourceVersion);
    const effectiveDate = requireEffectiveDate(input.effectiveDate);
    const sections = requireSections(input.sections);
    const summary = input.summary === undefined ? undefined : requireAgreementSummary(input.summary);
    return saveAgreementVersions(
      actor.uid,
      requireCode(input.code),
      "agreement_version_draft_created",
      (_before, versions) => ({
        versions: appendDraftVersion({
          versions,
          sourceVersion,
          version,
          effectiveDate,
          sections,
          summary,
          now: new Date().toISOString(),
        }),
        published: false,
      }),
    );
  },
);

export const updateAgreementVersion = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "updateAgreementVersion");
    const input = requireObject(request.data);
    rejectDraftPublish(input);
    const version = requireVersion(input.version);
    const draftVersion = requireVersion(input.draftVersion);
    const effectiveDate = requireEffectiveDate(input.effectiveDate);
    const sections = requireSections(input.sections);
    const summary = input.summary === undefined ? undefined : requireAgreementSummary(input.summary);
    return saveAgreementVersions(
      actor.uid,
      requireCode(input.code),
      "agreement_version_draft_updated",
      (_before, versions) => ({
        versions: replaceDraftVersion({
          versions,
          draftVersion,
          version,
          effectiveDate,
          sections,
          summary,
        }),
        published: false,
      }),
    );
  },
);

export const publishAgreementVersion = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "publishAgreementVersion");
    const input = requireObject(request.data);
    rejectForgedPublication(input);
    const version = requireVersion(input.version);
    return saveAgreementVersions(
      actor.uid,
      requireCode(input.code),
      "agreement_version_published",
      (before, versions) => publishVersions(before, versions, version),
    );
  },
);

export const deleteAgreementVersion = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "deleteAgreementVersion");
    const input = requireObject(request.data);
    const version = requireVersion(input.version);
    return saveAgreementVersions(
      actor.uid,
      requireCode(input.code),
      "agreement_version_draft_deleted",
      (_before, versions) => ({
        versions: deleteDraftVersion(versions, version),
        published: false,
      }),
    );
  },
);

function rejectForgedPublication(input: Record<string, unknown>): void {
  for (const field of [
    "purpose",
    "useForProviderOnboarding",
    "status",
    "sections",
    "summary",
    "effectiveDate",
    "name",
    "publish",
    "singleton",
    "requiresAcceptance",
    "targetAudience",
  ]) {
    if (field in input) {
      throw invalidAgreement("Publishing only accepts the agreement and version.");
    }
  }
}

function publishVersions(
  before: Record<string, unknown>,
  versions: readonly AgreementVersionRecord[],
  version: string,
) {
  const selected = versions.find((entry) =>
    entry.version === normalizeAgreementVersionLabel(version),
  );
  if (selected?.status === "draft") {
    requireEffectiveDate(selected.effectiveDate);
    requireSections(selected.sections);
    requireAgreementSummary(selected.summary);
  }
  const name = typeof before.name === "string" ? before.name.trim() : "";
  return {
    versions: publishDraftVersion({
      versions,
      version,
      name,
      now: new Date().toISOString(),
    }),
    published: true,
  };
}

async function saveAgreementVersions(
  actorUid: string,
  code: string,
  action: string,
  mutate: (
    before: Record<string, unknown>,
    versions: AgreementVersionRecord[],
  ) => {versions: AgreementVersionRecord[]; published: boolean},
) {
  const reference = db.collection(AGREEMENT_TEMPLATES).doc(code);
  const agreement = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "The agreement was not found.");
    }
    const before = snapshot.data() ?? {};
    if (action === "agreement_version_published") {
      await assertPublishableAgreementType(transaction, code, before);
    }
    const stored = agreementVersionsFromDocument(before);
    const next = mutate(before, stored.versions);
    const current = currentAgreementVersion(next.versions);
    if (next.published && !current) {
      throw new HttpsError(
        "failed-precondition",
        "Publishing must leave exactly one current agreement version.",
      );
    }
    const patch: Record<string, unknown> = {
      versions: next.versions,
      priorVersions: mergePriorVersions(before.priorVersions, next.versions),
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };
    if (next.published && current) {
      patch.version = current.version;
      patch.effectiveDate = current.effectiveDate;
      patch.sections = current.sections;
      patch.summary = current.summary ?? "";
    }
    const deleted = action === "agreement_version_draft_deleted" &&
      next.versions.length === 0 &&
      (!Array.isArray(before.priorVersions) || before.priorVersions.length === 0);
    if (deleted) transaction.delete(reference);
    else transaction.update(reference, patch);
    writeAuditLogInTransaction(transaction, {
      actorId: actorUid,
      actorRole: USER_ROLES.admin,
      action,
      targetCollection: AGREEMENT_TEMPLATES,
      targetId: code,
      before: {
        ...agreementAudit(before),
        versions: versionAudit(stored.versions),
      },
      after: {
        ...agreementAudit({...before, ...patch}),
        versions: versionAudit(next.versions),
      },
    });
    return deleted ? null : agreementView(before, next.versions, patch);
  });
  return agreement ? {success: true, agreement} : {success: true, deletedCode: code};
}

function agreementView(
  before: Record<string, unknown>,
  versions: AgreementVersionRecord[],
  patch: Record<string, unknown>,
) {
  const current = currentAgreementVersion(versions) ?? versions.find((entry) => entry.status === "draft");
  const name = typeof before.name === "string" ? before.name.trim() : "";
  const version = typeof patch.version === "string" ?
    patch.version :
    current?.version ?? "";
  const effectiveDate = typeof patch.effectiveDate === "string" ?
    patch.effectiveDate :
    current?.effectiveDate ?? "";
  const sections = Array.isArray(patch.sections) ?
    patch.sections as AgreementSection[] :
    current?.sections ?? [];
  return {
    code: typeof before.code === "string" ? before.code : "",
    categoryCode: "agreements",
    name,
    summary: current?.summary ?? (typeof before.summary === "string" ? before.summary.trim() : ""),
    version,
    effectiveDate,
    sections,
    agreementTypeCode: typeof before.agreementTypeCode === "string" ?
      before.agreementTypeCode :
      null,
    status: before.status === "discontinued" ? "discontinued" as const : "active" as const,
    sortName: typeof before.sortName === "string" && before.sortName.trim() ?
      before.sortName.trim() :
      name.toLowerCase(),
    versions,
  };
}

function draftVersion(
  record: {
    version: string;
    name: string;
    summary: string;
    effectiveDate: string;
    sections: AgreementSection[];
  },
  createdAt: string,
): AgreementVersionRecord {
  return {
    version: record.version,
    name: record.name,
    summary: record.summary,
    effectiveDate: record.effectiveDate,
    sections: record.sections,
    status: "draft",
    createdAt,
    publishedAt: null,
    archivedAt: null,
  };
}

function agreementContent(
  input: Record<string, unknown>,
  code: string,
  categoryCode: string,
) {
  const name = requireAgreementName(input.name);
  return {
    code,
    categoryCode,
    name,
    summary: requireAgreementSummary(input.summary),
    version: requireVersion(input.version),
    effectiveDate: requireEffectiveDate(input.effectiveDate),
    sections: requireSections(input.sections),
    status: "active" as const,
    sortName: name.toLowerCase(),
  };
}

function agreementRecord(
  input: Record<string, unknown>,
  code: string,
  categoryCode: string,
) {
  return {
    ...agreementContent(input, code, categoryCode),
    agreementTypeCode: requireCode(input.agreementTypeCode, "agreementTypeCode"),
  };
}

async function requireActiveAgreementType(
  transaction: FirebaseFirestore.Transaction,
  code: string,
) {
  const snapshot = await transaction.get(db.collection(AGREEMENT_TYPES).doc(code));
  const parsed = snapshot.exists ?
    parseAgreementType(snapshot.id, snapshot.data() ?? {}) :
    null;
  if (
    !parsed ||
    parsed.code === "custom_agreement" ||
    !isTrustedAgreementType(parsed)
  ) {
    const message = "The agreement type is not available.";
    throw new HttpsError("failed-precondition", message, {userMessage: message});
  }
  if (!parsed.isActive) {
    const message = "This agreement type is inactive.";
    throw new HttpsError("failed-precondition", message, {userMessage: message});
  }
  return parsed;
}

function publicAgreement(record: {
  code: string;
  categoryCode: string;
  name: string;
  summary: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
  agreementTypeCode?: string;
  status: CatalogStatus;
  sortName: string;
  versions?: AgreementVersionRecord[];
}) {
  return {
    ...record,
    agreementTypeCode: record.agreementTypeCode ?? null,
  };
}

export const updateAgreementType = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "updateAgreementType");
    const input = requireObject(request.data);
    const code = requireCode(input.code);
    const name = requireName(input.name);
    const description = requireDescription(input.description);
    const isActive = requireBoolean(input.isActive, "isActive");
    const sortOrder = requireSortOrder(input.sortOrder);
    const reference = db.collection(AGREEMENT_TYPES).doc(code);
    const agreementType = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "The agreement type was not found.");
      }
      const before = snapshot.data() ?? {};
      const parsed = parseAgreementType(snapshot.id, before);
      if (!parsed || !isTrustedAgreementType(parsed)) {
        throw new HttpsError(
          "failed-precondition",
          "This agreement type no longer matches its system contract.",
        );
      }
      for (const field of [
        "purpose",
        "singleton",
        "requiresAcceptance",
        "targetAudience",
        "system",
      ] as const) {
        if (field in input && input[field] !== before[field]) {
          throw new HttpsError(
            "failed-precondition",
            "Purpose, singleton behavior, and system identity cannot be changed.",
          );
        }
      }
      const next = {...parsed, name, description, isActive, sortOrder};
      transaction.update(reference, {
        name,
        description,
        isActive,
        sortOrder,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: USER_ROLES.admin,
        action: "agreement_type_updated",
        targetCollection: AGREEMENT_TYPES,
        targetId: code,
        before: auditSnapshot(before),
        after: next,
      });
      return next;
    });
    return {success: true, agreementType};
  },
);

function requireSortOrder(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 1000
  ) {
    throw new HttpsError(
      "invalid-argument",
      "sortOrder must be a whole number from 0 to 1000.",
    );
  }
  return value;
}

export const createBusinessDocumentType = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "createBusinessDocumentType");
    const input = requireObject(request.data);
    const code = requireCode(input.code);
    const categoryCode = "business_documents";
    const record = businessDocumentRecord(input, code, categoryCode);
    const reference = db.collection(BUSINESS_DOCUMENT_TYPES).doc(code);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        throw new HttpsError(
          "already-exists",
          "A business document with this code already exists.",
        );
      }
      await requireActiveCategory(transaction, categoryCode);
      transaction.create(reference, {
        ...record,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor.uid,
        updatedBy: actor.uid,
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: USER_ROLES.admin,
        action: "business_document_type_created",
        targetCollection: BUSINESS_DOCUMENT_TYPES,
        targetId: code,
        before: null,
        after: record,
      });
    });

    return {success: true, documentType: record};
  },
);

export const updateBusinessDocumentType = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "updateBusinessDocumentType");
    const input = requireObject(request.data);
    const code = requireCode(input.code);
    const categoryCode = "business_documents";
    const record = businessDocumentRecord(input, code, categoryCode);
    const reference = db.collection(BUSINESS_DOCUMENT_TYPES).doc(code);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The business document was not found.",
        );
      }
      if (snapshot.data()?.status === "discontinued") {
        throw new HttpsError(
          "failed-precondition",
          "Reactivate the business document before editing it.",
        );
      }
      await requireActiveCategory(transaction, categoryCode);
      transaction.update(reference, {
        ...record,
        status: "active",
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: USER_ROLES.admin,
        action: "business_document_type_updated",
        targetCollection: BUSINESS_DOCUMENT_TYPES,
        targetId: code,
        before: auditSnapshot(snapshot.data() ?? {}),
        after: record,
      });
    });

    return {success: true, documentType: record};
  },
);

export const discontinueBusinessDocumentType = onCall(
  appCheckCallableOptions,
  async (request) => lifecycleBusinessDocument(request, "discontinued"),
);

export const reactivateBusinessDocumentType = onCall(
  appCheckCallableOptions,
  async (request) => lifecycleBusinessDocument(request, "active"),
);

async function lifecycleBusinessDocument(
  request: Parameters<typeof requireAuth>[0],
  status: CatalogStatus,
) {
  const scope = status === "active" ?
    "reactivateBusinessDocumentType" :
    "discontinueBusinessDocumentType";
  const actor = await authorizeAdmin(request, scope);
  const code = requireCode(requireObject(request.data).code);
  const reference = db.collection(BUSINESS_DOCUMENT_TYPES).doc(code);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new HttpsError(
        "not-found",
        "The business document was not found.",
      );
    }
    transaction.update(reference, {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
    writeAuditLogInTransaction(transaction, {
      actorId: actor.uid,
      actorRole: USER_ROLES.admin,
      action: status === "active" ?
        "business_document_type_reactivated" :
        "business_document_type_discontinued",
      targetCollection: BUSINESS_DOCUMENT_TYPES,
      targetId: code,
      before: auditSnapshot(snapshot.data() ?? {}),
      after: {...auditSnapshot(snapshot.data() ?? {}), status},
    });
  });

  return {success: true};
}

export const deleteBusinessDocumentType = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "deleteBusinessDocumentType");
    const code = requireCode(requireObject(request.data).code);
    const reference = db.collection(BUSINESS_DOCUMENT_TYPES).doc(code);

    await db.runTransaction(async (transaction) => {
      const [snapshot, used] = await Promise.all([
        transaction.get(reference),
        transaction.get(
          db.collectionGroup("documents")
            .where("documentType", "==", code)
            .limit(1),
        ),
      ]);
      if (!snapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The business document was not found.",
        );
      }
      if (snapshot.data()?.status !== "discontinued") {
        throw new HttpsError(
          "failed-precondition",
          "Discontinue the business document before deleting it.",
        );
      }
      if (!used.empty) {
        throw new HttpsError(
          "failed-precondition",
          "This business document is currently in use and cannot be deleted.",
        );
      }
      transaction.delete(reference);
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: USER_ROLES.admin,
        action: "business_document_type_deleted",
        targetCollection: BUSINESS_DOCUMENT_TYPES,
        targetId: code,
        before: auditSnapshot(snapshot.data() ?? {}),
        after: null,
      });
    });

    return {success: true};
  },
);

function businessDocumentRecord(
  input: Record<string, unknown>,
  code: string,
  categoryCode: string,
) {
  const name = requireName(input.name);
  return {
    code,
    categoryCode,
    name,
    description: requireDescription(input.description),
    status: "active" as const,
    sortName: name.toLowerCase(),
    rules: requireRules(input.rules),
  };
}

async function assertPublishableAgreementType(
  transaction: FirebaseFirestore.Transaction,
  code: string,
  before: Record<string, unknown>,
) {
  const typeCode = typeof before.agreementTypeCode === "string" ?
    before.agreementTypeCode :
    "";
  if (!typeCode) {
    throw agreementPrecondition("This agreement type is not available.");
  }
  const snapshot = await transaction.get(db.collection(AGREEMENT_TYPES).doc(typeCode));
  const parsed = snapshot.exists ?
    parseAgreementType(snapshot.id, snapshot.data() ?? {}) :
    null;
  if (!parsed || !isTrustedAgreementType(parsed)) {
    throw agreementPrecondition("This agreement type no longer matches its system contract.");
  }
  if (!parsed.singleton) return;
  const existing = await transaction.get(db.collection(AGREEMENT_TEMPLATES));
  const duplicate = existing.docs.some((document) =>
    document.id !== code && document.data().agreementTypeCode === parsed.code,
  );
  if (duplicate) {
    throw agreementPrecondition(
      `${parsed.name} already exists. Create a new version instead.`,
    );
  }
}

function agreementAudit(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return {
    code: record.code ?? null,
    categoryCode: record.categoryCode ?? null,
    name: record.name ?? null,
    version: record.version ?? null,
    status: record.status ?? null,
    agreementTypeCode: record.agreementTypeCode ?? null,
  };
}

function auditSnapshot(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const {createdAt, updatedAt, ...rest} = record;
  void createdAt;
  void updatedAt;
  return rest;
}
