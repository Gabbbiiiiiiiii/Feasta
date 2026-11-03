/**
 * FEASTA global occasion contract.
 *
 * Separate from the frozen provider-package V2 contract.
 * This is a server-side structural check, not an authorization check.
 */

export const GLOBAL_OCCASION_MODEL = "global_v1" as const;

export interface GlobalOccasionProjectionV1 {
  occasionEligibilityModel: typeof GLOBAL_OCCASION_MODEL;
  globalEligibilityContractVersion: 1;
  occasionCatalogRevision: number;
  occasionEligibilityState: "valid";
  eventType: string;
  occasionMatchIds: string[];
}

const ID = /^[a-z][a-z0-9_]{1,63}$/u;

const positive = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0;

export function isGlobalOccasionProjectionV1(
  value: unknown,
): value is GlobalOccasionProjectionV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;

  if (
    row.occasionEligibilityModel !== GLOBAL_OCCASION_MODEL ||
    row.globalEligibilityContractVersion !== 1 ||
    !positive(row.occasionCatalogRevision) ||
    row.occasionEligibilityState !== "valid" ||
    typeof row.eventType !== "string" ||
    !ID.test(row.eventType) ||
    !Array.isArray(row.occasionMatchIds) ||
    row.occasionMatchIds.length < 1 ||
    row.occasionMatchIds.length > 200 ||
    row.occasionMatchIds.some(
      (id: unknown) => typeof id !== "string" || !ID.test(id),
    ) ||
    new Set(row.occasionMatchIds).size !== row.occasionMatchIds.length ||
    !row.occasionMatchIds.includes(row.eventType)
  ) {
    return false;
  }

  // A global projection cannot claim a legacy provider grant revision.
  if (
    Object.hasOwn(row, "providerEligibilityRevision") ||
    Object.hasOwn(row, "approvedOccasionIds") ||
    Object.hasOwn(row, "approvedCategoryCodes")
  ) {
    return false;
  }

  return true;
}