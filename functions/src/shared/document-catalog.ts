import {
  FieldValue,
  type Transaction,
} from "firebase-admin/firestore";

import {db} from "./firestore.js";
import {
  parseActiveOnboardingAgreement,
  type ProviderAgreementSource,
} from "./provider-agreement-acceptance.js";
import {serverTimestamp} from "./timestamps.js";
import {
  AGREEMENT_TEMPLATES,
  BUSINESS_DOCUMENT_TYPES,
  DOCUMENT_CATEGORIES,
  initialBusinessDocumentTypes,
  parseBusinessDocumentType,
  type BusinessDocumentCatalogRecord,
} from "./document-catalog-policy.js";

export {
  AGREEMENT_TEMPLATES,
  BUSINESS_DOCUMENT_TYPES,
  DOCUMENT_CATEGORIES,
  initialBusinessDocumentTypes,
  isDocumentCode,
  parseBusinessDocumentType,
  providerDocumentContext,
  resolveVerificationDocumentPolicy,
} from "./document-catalog-policy.js";
export type {
  BusinessDocumentCatalogRecord,
  BusinessDocumentRule,
  DocumentServiceType,
  VerificationDocumentPolicy,
} from "./document-catalog-policy.js";

const FILE_MAINTENANCE_SETTINGS = "fileMaintenance";

export async function ensureBusinessDocumentCatalog(): Promise<void> {
  const settings = db.collection("appSettings").doc(
    FILE_MAINTENANCE_SETTINGS,
  );
  const existingSettings = await settings.get();
  if (existingSettings.data()?.businessDocumentsSeeded === true) return;

  const types = initialBusinessDocumentTypes();
  await db.runTransaction(async (transaction) => {
    const settingsSnapshot = await transaction.get(settings);
    if (settingsSnapshot.data()?.businessDocumentsSeeded === true) return;

    const categoryReference = db.collection(DOCUMENT_CATEGORIES).doc(
      "business_documents",
    );
    const agreementCategoryReference = db
      .collection(DOCUMENT_CATEGORIES)
      .doc("agreements");
    const typeReferences = types.map((type) =>
      db.collection(BUSINESS_DOCUMENT_TYPES).doc(type.code),
    );
    const [categorySnapshot, agreementCategorySnapshot, ...typeSnapshots] =
      await transaction.getAll(
        categoryReference,
        agreementCategoryReference,
        ...typeReferences,
      );

    if (!categorySnapshot.exists) {
      transaction.create(categoryReference, {
        code: "business_documents",
        name: "Business Documents",
        description:
          "Permits, registrations, and other files providers upload for verification.",
        status: "active",
        sortName: "business documents",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "system",
        updatedBy: "system",
      });
    }

    if (!agreementCategorySnapshot.exists) {
      transaction.create(agreementCategoryReference, {
        code: "agreements",
        name: "Agreements",
        description: "Contracts and agreements providers review and accept.",
        status: "active",
        sortName: "agreements",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "system",
        updatedBy: "system",
      });
    }

    typeSnapshots.forEach((snapshot, index) => {
      if (snapshot.exists) return;
      const type = types[index];
      transaction.create(typeReferences[index], {
        ...type,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "system",
        updatedBy: "system",
      });
    });

    transaction.set(settings, {
      businessDocumentsSeeded: true,
      isPublic: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
}

export async function loadBusinessDocumentCatalog():
  Promise<BusinessDocumentCatalogRecord[]> {
  await ensureBusinessDocumentCatalog();
  const snapshot = await db.collection(BUSINESS_DOCUMENT_TYPES).get();
  return snapshot.docs.flatMap((document) => {
    const parsed = parseBusinessDocumentType(
      document.id,
      document.data(),
    );
    return parsed ? [parsed] : [];
  });
}

export async function loadCurrentProviderOnboardingAgreement():
  Promise<ProviderAgreementSource | null> {
  const snapshot = await db.collection(AGREEMENT_TEMPLATES).get();
  const matches = snapshot.docs.flatMap((document) => {
    const parsed = parseActiveOnboardingAgreement(
      document.id,
      document.data(),
    );
    return parsed ? [parsed] : [];
  });
  return matches.length === 1 ? matches[0] : null;
}

export async function readProviderOnboardingAgreementInTransaction(
  transaction: Transaction,
  code: string,
): Promise<ProviderAgreementSource | null> {
  const snapshot = await transaction.get(
    db.collection(AGREEMENT_TEMPLATES).doc(code),
  );
  if (!snapshot.exists) return null;
  return parseActiveOnboardingAgreement(snapshot.id, snapshot.data() ?? {});
}
