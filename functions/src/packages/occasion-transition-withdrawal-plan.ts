/**
 * Phase 2B: offline, fail-closed transition planning only.
 *
 * This module deliberately contains no Firestore writes, no ability to
 * activate/deactivate an occasion, no provider-grant mutation and no restore
 * operation. Actual transitions require independent verified writer coverage,
 * live query inventory, old Flutter reader withdrawal, release attestations,
 * fencing and revalidation before this plan can be used by a future worker.
 */
export type OccasionTransitionAction = "activate" | "deactivate";
export type WithdrawalReason =
  | "UNIVERSAL_SCOPE" | "SPECIFIC_REFERENCE" | "LEGACY_REFERENCE"
  | "UNKNOWN_OCCASION_CONTRACT" | "NOT_APPLICABLE";

export interface TransitionPackageSnapshot {
  id: string;
  providerId: unknown;
  serviceCategoryCode?: unknown;
  eventType?: unknown;
  occasionSchemaVersion?: unknown;
  occasionScope?: unknown;
  occasionIds?: unknown;
  occasionMatchIds?: unknown;
  occasionCatalogRevision?: unknown;
  providerEligibilityRevision?: unknown;
  occasionEligibilityState?: unknown;
  isPublished?: unknown;
  isActive?: unknown;
  providerPubliclyVisible?: unknown;
  status?: unknown;
  isDeleted?: unknown;
  publishedAt?: unknown;
}

export interface TransitionProviderAuthoritySnapshot {
  providerId: string;
  providerEligibilityRevision: unknown;
  approvedOccasionIds: unknown;
  approvedCategoryCodes: unknown;
  operationallyApproved: unknown;
}

export interface WithdrawalCandidate {
  packageId: string;
  providerId: string;
  reason: Exclude<WithdrawalReason, "NOT_APPLICABLE">;
  /** Projection proposal only; not a live Firestore update. */
  requiredPrivateProjection: {
    status: "draft";
    isActive: false;
    isPublished: false;
    providerPubliclyVisible: false;
    publishedAt: null;
  };
}

export interface WithdrawalPlan {
  action: OccasionTransitionAction;
  occasionId: string;
  /** Never claim readiness on the basis of this bounded offline inventory. */
  state: "blocked";
  lifecycleAvailable: false;
  canCommitCatalog: false;
  canRestorePackages: false;
  candidateWithdrawals: WithdrawalCandidate[];
  unverifiedPackageIds: string[];
  providerReviewIds: string[];
  blockers: string[];
}

const privateProjection = Object.freeze({
  status: "draft" as const,
  isActive: false as const,
  isPublished: false as const,
  providerPubliclyVisible: false as const,
  publishedAt: null,
});

const legacyEventIds = new Set(["birthday", "wedding", "debut", "anniversary",
  "reunion", "corporate", "baptism", "graduation", "other"]);

const v2Fields = ["occasionScope", "occasionIds", "occasionMatchIds",
  "occasionCatalogRevision", "providerEligibilityRevision", "occasionEligibilityState"] as const;

function canonicalId(id: string): boolean {
  return /^[a-z][a-z0-9_]{1,63}$/u.test(id);
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) =>
    typeof v === "string" && canonicalId(v)) && new Set(value).size === value.length;
}

function looksPublic(record: TransitionPackageSnapshot): boolean {
  // Any malformed/missing public flag is uncertain and must be inventoried,
  // not optimistically interpreted as private.
  return record.isPublished !== false || record.isActive !== false ||
    record.providerPubliclyVisible !== false || record.status === "published";
}

function affectsPackage(record: TransitionPackageSnapshot, occasionId: string,
  applicableCategories: ReadonlySet<string>): WithdrawalReason {
  const category = record.serviceCategoryCode;
  // Missing/invalid category is never proof of inapplicability.
  const matchingCategory = typeof category !== "string" || !canonicalId(category) ||
    applicableCategories.has(category);
  const isV2 = record.occasionSchemaVersion === 2;
  const hasV2Fields = v2Fields.some((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (isV2) {
    if ((record.occasionScope !== "all" && record.occasionScope !== "specific") ||
      !stringList(record.occasionIds) || !stringList(record.occasionMatchIds) ||
      (record.occasionScope === "all" && record.occasionIds.length !== 0) ||
      (record.occasionScope === "specific" && record.occasionIds.length === 0)) {
      return "UNKNOWN_OCCASION_CONTRACT";
    }
    if (record.occasionScope === "all" && matchingCategory) return "UNIVERSAL_SCOPE";
    if (record.occasionIds.includes(occasionId) ||
        record.occasionMatchIds.includes(occasionId)) return "SPECIFIC_REFERENCE";
    return "NOT_APPLICABLE";
  }
  if ((record.occasionSchemaVersion !== undefined && record.occasionSchemaVersion !== 1) ||
    hasV2Fields) return "UNKNOWN_OCCASION_CONTRACT";
  if (record.eventType === occasionId) return "LEGACY_REFERENCE";
  // An unrecognized V1 event type (including a legacy "all" string) is not
  // proof the package is independent of this catalog transition.
  if (typeof record.eventType !== "string" ||
      !legacyEventIds.has(record.eventType)) return "UNKNOWN_OCCASION_CONTRACT";
  return "NOT_APPLICABLE";
}

/** Offline bounded plan. `fullyEnumerated` is informational, NOT trusted proof. */
export function planOccasionTransitionWithdrawals(input: {
  action: OccasionTransitionAction;
  occasionId: string;
  applicableCategoryCodes: readonly string[];
  packages: readonly TransitionPackageSnapshot[];
  authorities: readonly TransitionProviderAuthoritySnapshot[];
  fullyEnumerated: boolean;
}): WithdrawalPlan {
  if (!canonicalId(input.occasionId) ||
      (input.action !== "activate" && input.action !== "deactivate") ||
      !Array.isArray(input.applicableCategoryCodes) ||
      !stringList([...input.applicableCategoryCodes]) ||
      input.applicableCategoryCodes.length === 0 ||
      !Array.isArray(input.packages) || input.packages.length > 500 ||
      !Array.isArray(input.authorities) || input.authorities.length > 500) {
    throw new Error("INVALID_TRANSITION_INVENTORY");
  }
  const seen = new Set<string>();
  const categories = new Set(input.applicableCategoryCodes);
  const candidateWithdrawals: WithdrawalCandidate[] = [];
  const unverifiedPackageIds: string[] = [];
  const providerReviewIds = new Set<string>();
  const authorities = new Map<string, TransitionProviderAuthoritySnapshot>();
  for (const authority of input.authorities) {
    if (!authority || typeof authority.providerId !== "string" ||
      authorities.has(authority.providerId)) throw new Error("INVALID_AUTHORITY_INVENTORY");
    authorities.set(authority.providerId, authority);
  }
  for (const pkg of input.packages) {
    if (!pkg || typeof pkg.id !== "string" || pkg.id.trim() === "" ||
      pkg.id.includes("/") || seen.has(pkg.id)) throw new Error("INVALID_PACKAGE_INVENTORY");
    seen.add(pkg.id);
    const providerId = typeof pkg.providerId === "string" && pkg.providerId.length > 0 &&
      !pkg.providerId.includes("/") ? pkg.providerId : "";
    const reason = affectsPackage(pkg, input.occasionId, categories);
    const authority = authorities.get(providerId);
    const authorityValid = authority?.operationallyApproved === true &&
      Number.isSafeInteger(authority.providerEligibilityRevision) &&
      (authority.providerEligibilityRevision as number) > 0 &&
      stringList(authority.approvedOccasionIds) &&
      stringList(authority.approvedCategoryCodes);
    if (!providerId || !authorityValid ||
      !(authority?.approvedOccasionIds as string[]).includes(input.occasionId) ||
      !(authority?.approvedCategoryCodes as string[]).some((code) => categories.has(code))) {
      if (providerId) providerReviewIds.add(providerId);
    }
    if (reason === "UNKNOWN_OCCASION_CONTRACT") unverifiedPackageIds.push(pkg.id);
    if (reason !== "NOT_APPLICABLE" && looksPublic(pkg)) {
      candidateWithdrawals.push({packageId: pkg.id, providerId,
        reason, requiredPrivateProjection: {...privateProjection}});
    }
  }
  const blockers = [
    "TRUSTED_RELEASE_EVIDENCE_UNVERIFIED",
    "CATALOG_AND_ELIGIBILITY_WRITER_FENCING_UNVERIFIED",
    "ALL_PUBLIC_READERS_AND_OLDER_FLUTTER_UNVERIFIED",
    "WITHDRAWAL_NOT_EXECUTED_OR_VERIFIED",
    "RESTORATION_VALIDATION_NOT_IMPLEMENTED",
  ];
  if (!input.fullyEnumerated) blockers.push("INVENTORY_INCOMPLETE");
  if (unverifiedPackageIds.length) blockers.push("UNKNOWN_PACKAGE_CONTRACTS");
  if (providerReviewIds.size) blockers.push("PROVIDER_ELIGIBILITY_REVIEW_REQUIRED");
  return {action: input.action, occasionId: input.occasionId,
    state: "blocked", lifecycleAvailable: false,
    canCommitCatalog: false, canRestorePackages: false,
    candidateWithdrawals, unverifiedPackageIds,
    providerReviewIds: [...providerReviewIds].sort(), blockers};
}

/** A trusted reread must verify each withdrawn projection. This is not evidence
 * that every package or supported client has been enumerated. */
export function hasPrivateWithdrawalProjection(record: TransitionPackageSnapshot): boolean {
  return record.status === "draft" && record.isActive === false &&
    record.isPublished === false && record.providerPubliclyVisible === false &&
    record.publishedAt === null;
}
