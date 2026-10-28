/**
 * Temporary V1/V2 boundary while the coordinated occasion withdrawal,
 * customer discovery gateway, and release approval are not yet verified.
 *
 * Only complete absence of V2 fields permits the legacy scalar reader.
 * A V1 marker is accepted solely when none of the V2 tuple is present.
 * Do not remove this fence until all Web, Flutter, rules and booking readers
 * can enforce authoritative current catalog/provider eligibility revisions.
 */
const V2_OCCASION_FIELDS = [
  "occasionScope", "occasionIds", "occasionMatchIds", "occasionCatalogRevision",
  "providerEligibilityRevision", "occasionEligibilityState",
] as const;

export function isLegacyOccasionPackage(
  record: Readonly<Record<string, unknown>>,
): boolean {
  // V2 pricing cannot be interpreted by legacy booking or publication.
  if (Object.prototype.hasOwnProperty.call(record, "pricingModel")) return false;
  return isLegacyPackageDraft(record);
}

/** Draft edits support current pricing models, but never rewrite V2 envelopes. */
export function isLegacyPackageDraft(
  record: Readonly<Record<string, unknown>>,
): boolean {
  // An unknown offer envelope must not be interpreted as a legacy scalar offer.
  for (const field of ["occasionSchemaVersion", "offerSchemaVersion"]) {
    if (Object.prototype.hasOwnProperty.call(record, field) && record[field] !== 1) return false;
  }
  return V2_OCCASION_FIELDS.every((key) =>
    !Object.prototype.hasOwnProperty.call(record, key));
}
