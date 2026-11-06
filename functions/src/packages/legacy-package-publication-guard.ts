import {HttpsError} from "firebase-functions/v2/https";

/** Persisted evidence only: legacy publication cannot interpret selection contracts. */
export function assertLegacyPackagePublication(
  record: Readonly<Record<string, unknown>>,
): void {
  const has = (field: string) => Object.hasOwn(record, field);
  const versions = ["sharedContractVersion", "offerSchemaVersion", "occasionSchemaVersion"];
  const unsupported = [
    "foodChoiceGroups", "individualFoodItems", "individualFoodDraft", "individualPricing",
    "pricingModel", "equipmentInclusions", "occasionScope", "occasionIds",
    "occasionMatchIds", "occasionCatalogRevision", "providerEligibilityRevision",
    "occasionEligibilityState", "editorSchemaVersion", "progress",
  ];
  // Absence is the historical legacy contract. Present markers must be exactly
  // understood, including null/empty/malformed values; never infer from defaults.
  if ((has("offerStructure") && record.offerStructure !== "fixed") ||
      versions.some((field) => has(field) && record[field] !== 1) ||
      unsupported.some(has)) {
    throw new HttpsError("failed-precondition",
      "This package requires an unsupported publication contract.",
      {reason: "UNSUPPORTED_PACKAGE_PUBLICATION_CONTRACT"});
  }
}
