/**
 * Pure eligibility decision for trusted server-side provider discovery.
 *
 * This helper cannot grant permissions, read Firestore, or expose private
 * eligibility authority documents.
 */

type RecordData = Readonly<Record<string, unknown>>;

const occasionPattern = /^[a-z][a-z0-9_]{1,63}$/u;
const categoryPattern = /^[a-z][a-z0-9_]{1,63}$/u;

function positiveRevision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) && value > 0;
}

function validList(
  value: unknown,
  pattern: RegExp,
  maximum: number,
): value is string[] {
  return Array.isArray(value) &&
    value.length <= maximum &&
    value.every(
      (item: unknown) =>
        typeof item === "string" && pattern.test(item),
    ) &&
    new Set(value).size === value.length;
}

export type VerifiedProviderOccasionEvidence = {
  occasionId: string;
  provider: RecordData | null;
  authority: RecordData | null;
  catalog: RecordData | null;
  occasion: RecordData | null;
  expectedCatalogRevision: number;
  expectedProviderEligibilityRevision: number;
};

export function hasVerifiedProviderOccasion(
  evidence: VerifiedProviderOccasionEvidence,
): boolean {
  const {
    occasionId,
    provider,
    authority,
    catalog,
    occasion,
    expectedCatalogRevision,
    expectedProviderEligibilityRevision,
  } = evidence;

  if (!occasionPattern.test(occasionId) ||
      !provider || !authority || !catalog || !occasion) {
    return false;
  }

  if (catalog.activationState !== "stable" ||
      !positiveRevision(catalog.revision) ||
      !positiveRevision(expectedCatalogRevision) ||
      catalog.revision !== expectedCatalogRevision ||
      !positiveRevision(authority.revision) ||
      !positiveRevision(expectedProviderEligibilityRevision) ||
      authority.revision !== expectedProviderEligibilityRevision) {
    return false;
  }

  if (provider.verificationStatus !== "approved" ||
      provider.publiclyVisible !== true ||
      provider.isActive !== true ||
      provider.isBlocked === true ||
      provider.isSuspended === true ||
      provider.isDeleted === true) {
    return false;
  }

  if (occasion.id !== occasionId ||
      occasion.active !== true ||
      occasion.moderationState !== "approved") {
    return false;
  }

  if (!validList(authority.approvedOccasionIds, occasionPattern, 200) ||
      !validList(authority.approvedCategoryCodes, categoryPattern, 50) ||
      !validList(provider.serviceCategories, categoryPattern, 50) ||
      !validList(occasion.applicableServiceCategoryCodes, categoryPattern, 50)) {
    return false;
  }

  if (!authority.approvedOccasionIds.includes(occasionId)) {
    return false;
  }

  const approvedCategories = new Set(authority.approvedCategoryCodes);
  const providerCategories = new Set(provider.serviceCategories);

  return occasion.applicableServiceCategoryCodes.some(
    (category) =>
      approvedCategories.has(category) &&
      providerCategories.has(category),
  );
}