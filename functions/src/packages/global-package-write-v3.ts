/**
 * Explicit V3 request discriminator.
 *
 * The existing V2 parser remains the canonical source for its
 * package fields. This helper does not authorize any Firestore write.
 */

export interface GlobalPackageWriteVersion {
  sharedContractVersion: 3;
  occasionSchemaVersion: 2;
  occasionScope: "specific" | "all";
  occasionIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const ID = /^[a-z][a-z0-9_]{1,63}$/u;

export function isGlobalPackageWriteVersion(
  value: unknown,
): value is GlobalPackageWriteVersion {
  if (!isRecord(value)) return false;

  if (
    value.sharedContractVersion !== 3 ||
    value.occasionSchemaVersion !== 2 ||
    (value.occasionScope !== "specific" && value.occasionScope !== "all") ||
    !Array.isArray(value.occasionIds) ||
    value.occasionIds.some(
      (id: unknown) => typeof id !== "string" || !ID.test(id),
    ) ||
    new Set(value.occasionIds).size !== value.occasionIds.length ||
    (value.occasionScope === "all" && value.occasionIds.length !== 0) ||
    (value.occasionScope === "specific" && value.occasionIds.length === 0)
  ) {
    return false;
  }

  // Clients cannot supply server-derived eligibility fields.
  for (const field of [
    "occasionEligibilityModel",
    "globalEligibilityContractVersion",
    "occasionMatchIds",
    "occasionCatalogRevision",
    "occasionEligibilityState",
    "providerEligibilityRevision",
    "approvedOccasionIds",
    "approvedCategoryCodes",
  ]) {
    if (Object.hasOwn(value, field)) return false;
  }

  return true;
}