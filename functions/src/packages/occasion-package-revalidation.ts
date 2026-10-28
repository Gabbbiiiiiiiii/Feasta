import {isDeepStrictEqual} from "node:util";
import {resolveOccasionV2, type OccasionAuthority} from "./occasion-v2-validation.js";

export function planOccasionPackageRevalidation(
  packageData: Readonly<Record<string, unknown>>, authority: OccasionAuthority,
) {
  const base = {publicationAllowed: false as const, bookingAllowed: false as const,
    withdrawalVerified: false as const, publicMembership: [] as string[],
    requiresWithdrawal: packageData.isPublished !== false || packageData.status === "published",
    historicalEventType: packageData.eventType,
    selectedOccasionIds: Array.isArray(packageData.occasionIds) ?
      [...packageData.occasionIds] : null};
  if (packageData.occasionSchemaVersion !== 2) {
    const hasV2Fields = ["occasionScope", "occasionIds", "occasionMatchIds",
      "occasionCatalogRevision", "providerEligibilityRevision", "occasionEligibilityState"]
      .some((key) => packageData[key] !== undefined);
    return {...base, state: "review_required" as const, proposedMembership: [] as string[],
      reason: !hasV2Fields && (packageData.occasionSchemaVersion === undefined ||
        packageData.occasionSchemaVersion === 1) ?
        "LEGACY_COMPATIBILITY_UNVERIFIED" : "INVALID_OCCASION_SCHEMA"};
  }
  try {
    const resolved = resolveOccasionV2({occasionSchemaVersion: 2,
      occasionScope: packageData.occasionScope, occasionIds: packageData.occasionIds}, authority,
    typeof packageData.eventType === "string" ? packageData.eventType : undefined);
    const current = packageData.occasionCatalogRevision === authority.catalogRevision &&
      packageData.providerEligibilityRevision === authority.providerEligibilityRevision &&
      packageData.occasionEligibilityState === "valid" &&
      isDeepStrictEqual(packageData.occasionMatchIds, resolved.occasionMatchIds) &&
      packageData.eventType === resolved.eventType;
    return {...base, state: "revalidation_required" as const,
      proposedMembership: resolved.occasionMatchIds,
      reason: current ? "PUBLICATION_WITHDRAWAL_UNVERIFIED" : "STALE_DISCOVERY_MEMBERSHIP"};
  } catch {
    return {...base, state: "review_required" as const, proposedMembership: [] as string[],
      reason: packageData.occasionScope === "all" ?
        "UNIVERSAL_REVALIDATION_REQUIRED" : "OCCASION_SELECTION_REQUIRES_REVIEW"};
  }
}
