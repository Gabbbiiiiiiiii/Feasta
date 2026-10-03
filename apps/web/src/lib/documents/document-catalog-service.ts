import "server-only";

import {FieldValue, type DocumentData} from "firebase-admin/firestore";
import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";

import type {
  AdminAgreementTemplate,
  AdminBusinessDocumentRule,
  AdminBusinessDocumentType,
  AgreementSection,
  AgreementTypeRecord,
  AgreementVersionRecord,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";
import {
  AGREEMENT_TYPES,
  initialAgreementTypes,
  isTrustedAgreementType,
  parseAgreementType,
  providerOnboardingType,
} from "../../../../../functions/src/shared/agreement-types";
import {
  agreementVersionsFromRecord,
  normalizeAgreementVersionLabel,
} from "@/lib/documents/agreement-version-history";
import {adminDb} from "@/lib/firebase/admin";
import {
  PROVIDER_AGREEMENT_FINAL_SECTION,
  PROVIDER_AGREEMENT_SECTIONS,
} from "@/lib/provider/provider-agreement";

const DOCUMENT_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const SETTINGS_ID = "fileMaintenance";



function isDocumentCode(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 100 &&
    DOCUMENT_CODE_PATTERN.test(value);
}

function isStatus(value: unknown): value is "active" | "discontinued" {
  return value === "active" || value === "discontinued";
}

export async function ensureDocumentCatalog(): Promise<void> {
  const settings = adminDb
    .collection(FIRESTORE_COLLECTIONS.appSettings)
    .doc(SETTINGS_ID);
  const existing = await settings.get();
  const data = existing.data() ?? {};
  if (
    data.businessDocumentsSeeded === true &&
    data.agreementsSeeded === true &&
    data.agreementTypesSeeded === true
  ) {
    return;
  }

  await adminDb.runTransaction(async (transaction) => {
    const settingsSnapshot = await transaction.get(settings);
    const current = settingsSnapshot.data() ?? {};
    const businessDocuments = current.businessDocumentsSeeded === true
      ? []
      : initialBusinessDocumentTypes();
    const categoryReferences = ["agreements", "business_documents"].map(
      (code) => adminDb
        .collection(FIRESTORE_COLLECTIONS.documentCategories)
        .doc(code),
    );
    const documentReferences = businessDocuments.map((documentType) =>
      adminDb
        .collection(FIRESTORE_COLLECTIONS.businessDocumentTypes)
        .doc(documentType.code),
    );
    const agreementReference = adminDb
      .collection(FIRESTORE_COLLECTIONS.agreementTemplates)
      .doc("feasta_provider_agreement");
    const agreementTypeRecords = current.agreementTypesSeeded === true
      ? []
      : initialAgreementTypes();
    const agreementTypeReferences = agreementTypeRecords.map((agreementType) =>
      adminDb.collection(AGREEMENT_TYPES).doc(agreementType.code),
    );
    const [categorySnapshots, documentSnapshots, agreementSnapshot, agreementTypeSnapshots] =
      await Promise.all([
        Promise.all(categoryReferences.map((reference) =>
          transaction.get(reference),
        )),
        Promise.all(documentReferences.map((reference) =>
          transaction.get(reference),
        )),
        current.agreementsSeeded === true
          ? Promise.resolve(null)
          : transaction.get(agreementReference),
        Promise.all(agreementTypeReferences.map((reference) =>
          transaction.get(reference),
        )),
      ]);

    categorySnapshots.forEach((snapshot, index) => {
      if (snapshot.exists) return;
      const code = index === 0 ? "agreements" : "business_documents";
      const name = index === 0 ? "Agreements" : "Business Documents";
      transaction.create(categoryReferences[index], {
        code,
        name,
        description: index === 0
          ? "Contracts and agreements providers review and accept."
          : "Permits, registrations, and other files providers upload for verification.",
        status: "active",
        sortName: name.toLowerCase(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: "system",
        updatedBy: "system",
      });
    });

    documentSnapshots.forEach((snapshot, index) => {
      if (snapshot.exists) return;
      transaction.create(documentReferences[index], {
        ...businessDocuments[index],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: "system",
        updatedBy: "system",
      });
    });

    if (agreementSnapshot && !agreementSnapshot.exists) {
      transaction.create(agreementReference, {
        ...initialProviderAgreement(),
        priorVersions: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: "system",
        updatedBy: "system",
      });
    }

    agreementTypeSnapshots.forEach((snapshot, index) => {
      if (snapshot.exists) return;
      transaction.create(agreementTypeReferences[index], {
        ...agreementTypeRecords[index],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: "system",
        updatedBy: "system",
      });
    });

    transaction.set(settings, {
      businessDocumentsSeeded: true,
      agreementsSeeded: true,
      agreementTypesSeeded: true,
      isPublic: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
}

function initialProviderAgreement() {
  const sections = [
    ...PROVIDER_AGREEMENT_SECTIONS,
    PROVIDER_AGREEMENT_FINAL_SECTION,
  ].map((section) => ({
    title: section.title,
    paragraphs: [...section.paragraphs],
  }));

  const agreement = {
    code: "feasta_provider_agreement",
    categoryCode: "agreements",
    name: "FEASTA Provider Agreement",
    summary:
      "These rules explain the responsibilities that apply when a business offers catering or event services through FEASTA.",
    version: "2026-09-27",
    effectiveDate: "2026-09-27",
    sections,
    agreementTypeCode: "provider_agreement",
    status: "active" as const,
    sortName: "feasta provider agreement",
  };
  const versions: AgreementVersionRecord[] = [{
    version: agreement.version,
    name: agreement.name,
    summary: agreement.summary,
    effectiveDate: agreement.effectiveDate,
    sections,
    status: "current",
    createdAt: null,
    publishedAt: null,
    archivedAt: null,
  }];
  return {...agreement, versions};
}

function initialBusinessDocumentTypes(): AdminBusinessDocumentType[] {

  return [
    businessDocument("valid_id", "Valid government ID", [
      rule({effect: "required"}),
    ]),
    businessDocument("business_permit", "Business permit", [
      rule({effect: "required", registrationScope: "registered_business"}),
    ]),
    businessDocument("dti_registration", "DTI or SEC registration", [
      rule({effect: "required", registrationScope: "registered_business"}),
    ]),
    businessDocument("bir_registration", "BIR documentation", [
      rule({effect: "required", registrationScope: "registered_business"}),
    ]),
    businessDocument("sanitary_permit", "Sanitary permit", [
      rule({
        effect: "required",
        serviceTypes: ["catering", "both"],
      }),
    ]),
    businessDocument("mayors_permit", "Mayor's permit", [
      rule({
        effect: "required",
        serviceCategoryCodes: ["venue_provider"],
      }),
    ]),
    businessDocument("other", "Other supporting document", []),
  ];
}

function businessDocument(
  code: string,
  name: string,
  rules: AdminBusinessDocumentRule[],
): AdminBusinessDocumentType {
  return {
    code,
    categoryCode: "business_documents",
    name,
    description: "",
    status: "active",
    sortName: name.toLowerCase(),
    rules,
  };
}

function rule(
  input: Partial<AdminBusinessDocumentRule> &
    Pick<AdminBusinessDocumentRule, "effect">,
): AdminBusinessDocumentRule {
  return {
    effect: input.effect,
    oneOfGroup: input.oneOfGroup ?? "",
    registrationScope: input.registrationScope ?? "any",
    serviceTypes: input.serviceTypes ?? [],
    serviceCategoryCodes: input.serviceCategoryCodes ?? [],
    excludeServiceCategoryCodes: input.excludeServiceCategoryCodes ?? [],
  };
}

export async function getAdminAgreementTemplates():
  Promise<AdminAgreementTemplate[]> {
  const snapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.agreementTemplates)
    .get();
  return snapshot.docs.flatMap((document) => {
    const parsed = parseAgreement(document.id, document.data());
    return parsed ? [parsed] : [];
  }).sort(byName);
}

export async function getAdminBusinessDocumentTypes():
  Promise<AdminBusinessDocumentType[]> {
  const snapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.businessDocumentTypes)
    .get();
  return snapshot.docs.flatMap((document) => {
    const parsed = parseBusinessDocument(document.id, document.data());
    return parsed ? [parsed] : [];
  }).sort(byName);
}

export async function getAdminAgreementTypes():
  Promise<AgreementTypeRecord[]> {
  const snapshot = await adminDb.collection(AGREEMENT_TYPES).get();
  return snapshot.docs.flatMap((document) => {
    const parsed = parseAgreementType(document.id, document.data());
    return parsed && isTrustedAgreementType(parsed) ? [parsed] : [];
  }).sort((left, right) =>
    left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
}

export async function getProviderOnboardingAgreement():
  Promise<AdminAgreementTemplate | null> {
  await ensureDocumentCatalog();
  const [agreements, agreementTypes] = await Promise.all([
    getAdminAgreementTemplates(),
    getAdminAgreementTypes(),
  ]);
  const providerType = providerOnboardingType(agreementTypes);
  if (!providerType) return null;
  const matches = agreements.filter((agreement) =>
    agreement.status === "active" &&
    agreement.agreementTypeCode === providerType.code,
  );
  if (matches.length !== 1) return null;
  const agreement = matches[0];
  const current = (agreement.versions ?? []).filter((entry) => entry.status === "current");
  if (current.length !== 1) return null;
  return {
    ...agreement,
    version: current[0].version,
    effectiveDate: current[0].effectiveDate,
    sections: current[0].sections,
  };
}

export async function getStoredAgreementVersion(
  code: string,
  version: string,
): Promise<AgreementVersionRecord | null> {
  if (!isDocumentCode(code)) return null;
  const label = normalizeAgreementVersionLabel(version);
  if (!label) return null;
  const snapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.agreementTemplates)
    .doc(code)
    .get();
  if (!snapshot.exists) return null;
  const agreement = parseAgreement(snapshot.id, snapshot.data() ?? {});
  const match = agreement?.versions?.find((entry) => entry.version === label);
  if (!match || match.status === "draft") return null;
  return match;
}

function parseAgreement(
  id: string,
  data: DocumentData,
): AdminAgreementTemplate | null {
  if (
    !isDocumentCode(data.categoryCode) ||
    typeof data.name !== "string" ||
    typeof data.version !== "string" ||
    typeof data.effectiveDate !== "string" ||
    !isStatus(data.status) ||
    !Array.isArray(data.sections)
  ) {
    return null;
  }
  const sections = data.sections.flatMap((section) => {
    const parsed = parseSection(section);
    return parsed ? [parsed] : [];
  });
  if (sections.length !== data.sections.length || sections.length === 0) {
    return null;
  }
  const name = data.name.trim();
  const stored = agreementVersionsFromRecord(data);
  const current = stored.versions.filter((entry) => entry.status === "current");
  const legal = current.length === 1 ? current[0] : null;
  return {
    code: id,
    categoryCode: data.categoryCode,
    name,
    summary: legal?.summary ?? (typeof data.summary === "string" ? data.summary.trim() : ""),
    version: legal?.version ?? data.version.trim(),
    effectiveDate: legal?.effectiveDate ?? data.effectiveDate,
    sections: legal?.sections ?? sections,
    agreementTypeCode: typeof data.agreementTypeCode === "string" &&
      isDocumentCode(data.agreementTypeCode)
      ? data.agreementTypeCode
      : null,
    status: data.status,
    sortName: typeof data.sortName === "string" && data.sortName.trim()
      ? data.sortName.trim()
      : name.toLowerCase(),
    versions: stored.versions,
  };
}

function parseSection(value: unknown): AgreementSection | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || !Array.isArray(record.paragraphs)) {
    return null;
  }
  const paragraphs = record.paragraphs.filter(
    (paragraph): paragraph is string =>
      typeof paragraph === "string" && paragraph.trim().length > 0,
  );
  if (!record.title.trim() || paragraphs.length !== record.paragraphs.length) {
    return null;
  }
  return {title: record.title.trim(), paragraphs: paragraphs.map((paragraph) => paragraph.trim())};
}

function parseBusinessDocument(
  id: string,
  data: DocumentData,
): AdminBusinessDocumentType | null {
  if (
    !isDocumentCode(data.categoryCode) ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    !isStatus(data.status) ||
    !Array.isArray(data.rules)
  ) {
    return null;
  }
  const rules = data.rules.flatMap((entry) => {
    const parsed = parseRule(entry);
    return parsed ? [parsed] : [];
  });
  if (rules.length !== data.rules.length) return null;
  const name = data.name.trim();
  return {
    code: id,
    categoryCode: data.categoryCode,
    name,
    description: typeof data.description === "string" ? data.description.trim() : "",
    status: data.status,
    sortName: typeof data.sortName === "string" && data.sortName.trim()
      ? data.sortName.trim()
      : name.toLowerCase(),
    rules,
  };
}

function parseRule(value: unknown): AdminBusinessDocumentRule | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.effect !== "required" && record.effect !== "one_of") return null;
  if (
    record.registrationScope !== "any" &&
    record.registrationScope !== "registered_business" &&
    record.registrationScope !== "individual"
  ) {
    return null;
  }
  if (typeof record.oneOfGroup !== "string") return null;
  const serviceTypes = codeList(record.serviceTypes);
  const serviceCategoryCodes = codeList(record.serviceCategoryCodes);
  const excludeServiceCategoryCodes = codeList(
    record.excludeServiceCategoryCodes,
  );
  if (!serviceTypes || !serviceCategoryCodes || !excludeServiceCategoryCodes) {
    return null;
  }
  if (serviceTypes.some((type) =>
    type !== "catering" && type !== "addon" && type !== "both",
  )) {
    return null;
  }
  return {
    effect: record.effect,
    oneOfGroup: record.oneOfGroup,
    registrationScope: record.registrationScope,
    serviceTypes: serviceTypes as AdminBusinessDocumentRule["serviceTypes"],
    serviceCategoryCodes,
    excludeServiceCategoryCodes,
  };
}

function codeList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((item) => typeof item !== "string")) return null;
  return value as string[];
}

function byName<T extends {name: string}>(left: T, right: T): number {
  return left.name.localeCompare(right.name, undefined, {sensitivity: "base"});
}
