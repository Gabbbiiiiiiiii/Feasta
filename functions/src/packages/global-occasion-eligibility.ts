/**
 * FEASTA global occasion eligibility.
 *
 * Global activation makes an occasion available to applicable providers.
 * Individual provider occasion grants are not required.
 *
 * This module does not authorize publication or booking by itself.
 */

export interface GlobalOccasionEligibilityInput {
  occasion: {
    id?: unknown;
    active?: unknown;
    moderationState?: unknown;
    applicableServiceCategoryCodes?: unknown;
  };
  provider: {
    verificationStatus?: unknown;
    isActive?: unknown;
    isBlocked?: unknown;
    isSuspended?: unknown;
    isDeleted?: unknown;
    serviceCategories?: unknown;
  };
  serviceCategoryCode: string;
  occasionId: string;
}

const CODE = /^[a-z][a-z0-9_]{1,63}$/u;

export function isGloballyEligibleOccasion(
  input: GlobalOccasionEligibilityInput,
): boolean {
  const {occasion, provider, serviceCategoryCode, occasionId} = input;

  if (!CODE.test(occasionId) || !CODE.test(serviceCategoryCode)) {
    return false;
  }

  if (
    occasion.id !== occasionId ||
    occasion.active !== true ||
    occasion.moderationState !== "approved"
  ) {
    return false;
  }

  if (
    !["approved", "verified"].includes(
      String(provider.verificationStatus),
    ) ||
    provider.isActive !== true ||
    provider.isBlocked === true ||
    provider.isSuspended === true ||
    provider.isDeleted === true
  ) {
    return false;
  }

  if (
    !Array.isArray(provider.serviceCategories) ||
    !provider.serviceCategories.includes(serviceCategoryCode)
  ) {
    return false;
  }

  if (
    !Array.isArray(occasion.applicableServiceCategoryCodes) ||
    !occasion.applicableServiceCategoryCodes.includes(
      serviceCategoryCode,
    )
  ) {
    return false;
  }

  return true;
}