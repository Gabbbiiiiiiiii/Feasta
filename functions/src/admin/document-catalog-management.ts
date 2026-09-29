import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

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

function requireCode(value: unknown): string {
  const code = requireString(value, "code", {minLength: 2, maxLength: 100});
  if (!isDocumentCode(code)) {
    throw new HttpsError(
      "invalid-argument",
      "code must contain only lowercase letters, numbers, and underscores.",
    );
  }
  return code;
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
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    throw new HttpsError(
      "invalid-argument",
      "An agreement needs between 1 and 40 sections.",
    );
  }

  return value.map((section, index) => {
    const record = requireObject(section, `sections.${index}`);
    const title = requireString(record.title, `sections.${index}.title`, {
      minLength: 2,
      maxLength: 160,
    }).trim();
    if (!Array.isArray(record.paragraphs) || record.paragraphs.length < 1) {
      throw new HttpsError(
        "invalid-argument",
        `sections.${index} needs at least one paragraph.`,
      );
    }
    if (record.paragraphs.length > 12) {
      throw new HttpsError(
        "invalid-argument",
        `sections.${index} has too many paragraphs.`,
      );
    }
    const paragraphs = record.paragraphs.map((paragraph, paragraphIndex) =>
      requireString(
        paragraph,
        `sections.${index}.paragraphs.${paragraphIndex}`,
        {minLength: 1, maxLength: 2000},
      ).trim(),
    );
    return {title, paragraphs};
  });
}

function requireVersion(value: unknown): string {
  return normalizeAgreementVersionLabel(
    requireString(value, "version", {minLength: 1, maxLength: 40}),
  );
}

function requireEffectiveDate(value: unknown): string {
  const effectiveDate = requireString(value, "effectiveDate", {
    minLength: 10,
    maxLength: 10,
  });
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(effectiveDate)) {
    throw new HttpsError(
      "invalid-argument",
      "effectiveDate must use YYYY-MM-DD.",
    );
  }
  return effectiveDate;
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
    const code = requireCode(input.code);
    const categoryCode = "agreements";
    const record = agreementRecord(input, code, categoryCode);
    const reference = db.collection(AGREEMENT_TEMPLATES).doc(code);
    const publishedAt = new Date().toISOString();
    const versions = [publishedVersion(record, publishedAt)];

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        throw new HttpsError(
          "already-exists",
          "An agreement with this code already exists.",
        );
      }
      await requireActiveCategory(transaction, categoryCode);
      if (record.useForProviderOnboarding) {
        await clearOnboardingFlag(transaction, code);
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
    const code = requireCode(input.code);
    const categoryCode = "agreements";
    const next = agreementRecord(input, code, categoryCode);
    const reference = db.collection(AGREEMENT_TEMPLATES).doc(code);

    const updated = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "The agreement was not found.");
      }
      await requireActiveCategory(transaction, categoryCode);
      const before = snapshot.data() ?? {};
      if (before.status === "discontinued") {
        throw new HttpsError(
          "failed-precondition",
          "Reactivate the agreement before editing it.",
        );
      }
      const stored = agreementVersionsFromDocument(before);
      assertPublishedLegalContentUnchanged(stored.versions, next);
      const current = currentAgreementVersion(stored.versions);
      if (!current) {
        throw new HttpsError(
          "failed-precondition",
          "This agreement does not have one current version.",
        );
      }
      if (next.useForProviderOnboarding) {
        await clearOnboardingFlag(transaction, code);
      } else if (before.useForProviderOnboarding === true) {
        throw new HttpsError(
          "failed-precondition",
          "Assign provider onboarding to another active agreement first.",
        );
      }

      const record = {
        ...next,
        version: current.version,
        effectiveDate: current.effectiveDate,
        sections: current.sections,
        status: "active" as const,
        versions: stored.versions,
        priorVersions: mergePriorVersions(before.priorVersions, stored.versions),
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

export const discontinueAgreementTemplate = onCall(
  appCheckCallableOptions,
  async (request) => lifecycleAgreement(request, "discontinued"),
);

export const reactivateAgreementTemplate = onCall(
  appCheckCallableOptions,
  async (request) => lifecycleAgreement(request, "active"),
);

async function lifecycleAgreement(
  request: Parameters<typeof requireAuth>[0],
  status: CatalogStatus,
) {
  const scope = status === "active" ?
    "reactivateAgreementTemplate" :
    "discontinueAgreementTemplate";
  const actor = await authorizeAdmin(request, scope);
  const code = requireCode(requireObject(request.data).code);
  const reference = db.collection(AGREEMENT_TEMPLATES).doc(code);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "The agreement was not found.");
    }
    const before = snapshot.data() ?? {};
    if (before.useForProviderOnboarding === true && status === "discontinued") {
      throw new HttpsError(
        "failed-precondition",
        "Assign provider onboarding to another active agreement first.",
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
        "agreement_template_reactivated" :
        "agreement_template_discontinued",
      targetCollection: AGREEMENT_TEMPLATES,
      targetId: code,
      before: agreementAudit(before),
      after: {...agreementAudit(before), status},
    });
  });

  return {success: true};
}

export const deleteAgreementTemplate = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "deleteAgreementTemplate");
    const code = requireCode(requireObject(request.data).code);
    const reference = db.collection(AGREEMENT_TEMPLATES).doc(code);

    await db.runTransaction(async (transaction) => {
      const [snapshot, providerUse] = await Promise.all([
        transaction.get(reference),
        transaction.get(
          db.collection("providerVerifications")
            .where("providerAgreementTemplateCode", "==", code)
            .limit(1),
        ),
      ]);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "The agreement was not found.");
      }
      const before = snapshot.data() ?? {};
      if (before.status !== "discontinued") {
        throw new HttpsError(
          "failed-precondition",
          "Discontinue the agreement before deleting it.",
        );
      }
      if (!providerUse.empty) {
        throw new HttpsError(
          "failed-precondition",
          "This agreement is currently in use and cannot be deleted.",
        );
      }
      transaction.delete(reference);
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: USER_ROLES.admin,
        action: "agreement_template_deleted",
        targetCollection: AGREEMENT_TEMPLATES,
        targetId: code,
        before: agreementAudit(before),
        after: null,
      });
    });

    return {success: true};
  },
);

export const createAgreementVersion = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "createAgreementVersion");
    const input = requireObject(request.data);
    const publish = input.publish === undefined ?
      false :
      requireBoolean(input.publish, "publish");
    const version = requireVersion(input.version);
    const sourceVersion = requireVersion(input.sourceVersion);
    const effectiveDate = requireEffectiveDate(input.effectiveDate);
    const sections = requireSections(input.sections);
    return saveAgreementVersions(
      actor.uid,
      requireCode(input.code),
      publish ? "agreement_version_published" : "agreement_version_draft_created",
      (before, versions) => {
        const drafted = appendDraftVersion({
          versions,
          sourceVersion,
          version,
          effectiveDate,
          sections,
          now: new Date().toISOString(),
        });
        return publish ? publishVersions(before, drafted, version) : {
          versions: drafted,
          published: false,
        };
      },
    );
  },
);

export const updateAgreementVersion = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "updateAgreementVersion");
    const input = requireObject(request.data);
    const publish = input.publish === undefined ?
      false :
      requireBoolean(input.publish, "publish");
    const version = requireVersion(input.version);
    const draftVersion = requireVersion(input.draftVersion);
    const effectiveDate = requireEffectiveDate(input.effectiveDate);
    const sections = requireSections(input.sections);
    return saveAgreementVersions(
      actor.uid,
      requireCode(input.code),
      publish ? "agreement_version_published" : "agreement_version_draft_updated",
      (before, versions) => {
        const drafted = replaceDraftVersion({
          versions,
          draftVersion,
          version,
          effectiveDate,
          sections,
        });
        return publish ? publishVersions(before, drafted, version) : {
          versions: drafted,
          published: false,
        };
      },
    );
  },
);

export const publishAgreementVersion = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(request, "publishAgreementVersion");
    const input = requireObject(request.data);
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

function publishVersions(
  before: Record<string, unknown>,
  versions: readonly AgreementVersionRecord[],
  version: string,
) {
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
    if (before.status === "discontinued") {
      throw new HttpsError(
        "failed-precondition",
        "Reactivate the agreement before editing it.",
      );
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
    }
    transaction.update(reference, patch);
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
    return agreementView(before, next.versions, patch);
  });
  return {success: true, agreement};
}

function agreementView(
  before: Record<string, unknown>,
  versions: AgreementVersionRecord[],
  patch: Record<string, unknown>,
) {
  const current = currentAgreementVersion(versions);
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
    summary: typeof before.summary === "string" ? before.summary.trim() : "",
    version,
    effectiveDate,
    sections,
    useForProviderOnboarding: before.useForProviderOnboarding === true,
    status: "active" as const,
    sortName: typeof before.sortName === "string" && before.sortName.trim() ?
      before.sortName.trim() :
      name.toLowerCase(),
    versions,
  };
}

function publishedVersion(
  record: {
    version: string;
    name: string;
    effectiveDate: string;
    sections: AgreementSection[];
  },
  publishedAt: string,
): AgreementVersionRecord {
  return {
    version: record.version,
    name: record.name,
    effectiveDate: record.effectiveDate,
    sections: record.sections,
    status: "current",
    createdAt: publishedAt,
    publishedAt,
    archivedAt: null,
  };
}

function agreementRecord(
  input: Record<string, unknown>,
  code: string,
  categoryCode: string,
) {
  const name = requireName(input.name);
  return {
    code,
    categoryCode,
    name,
    summary: requireString(input.summary ?? "", "summary", {
      minLength: 0,
      maxLength: 500,
    }).trim(),
    version: requireVersion(input.version),
    effectiveDate: requireEffectiveDate(input.effectiveDate),
    sections: requireSections(input.sections),
    useForProviderOnboarding: requireBoolean(
      input.useForProviderOnboarding,
      "useForProviderOnboarding",
    ),
    status: "active" as const,
    sortName: name.toLowerCase(),
  };
}

async function clearOnboardingFlag(
  transaction: FirebaseFirestore.Transaction,
  exceptCode: string,
) {
  const snapshot = await transaction.get(db.collection(AGREEMENT_TEMPLATES));
  snapshot.docs.forEach((document) => {
    if (
      document.id !== exceptCode &&
      document.data().useForProviderOnboarding === true
    ) {
      transaction.update(document.ref, {
        useForProviderOnboarding: false,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

function publicAgreement(record: {
  code: string;
  categoryCode: string;
  name: string;
  summary: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
  useForProviderOnboarding: boolean;
  status: CatalogStatus;
  sortName: string;
  versions?: AgreementVersionRecord[];
}) {
  return record;
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

function agreementAudit(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return {
    code: record.code ?? null,
    categoryCode: record.categoryCode ?? null,
    name: record.name ?? null,
    version: record.version ?? null,
    status: record.status ?? null,
    useForProviderOnboarding: record.useForProviderOnboarding === true,
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
