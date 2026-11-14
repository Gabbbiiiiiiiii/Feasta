import type {GlobalOccasion} from
  "@feasta/shared-types/provider-package-v2";

import {
  isGloballyEligibleOccasion,
  type GlobalOccasionEligibilityInput,
} from "./global-occasion-eligibility.js";

export const GLOBAL_OCCASION_CONTRACT_VERSION = 1 as const;

type Provider = GlobalOccasionEligibilityInput["provider"];

export interface GlobalOccasionSelectionInput {
  occasionSchemaVersion: 2;
  occasionScope: "specific" | "all";
  occasionIds: string[];
}

export interface GlobalOccasionSelectionAuthority {
  catalog: readonly GlobalOccasion[];
  catalogRevision: number;
  provider: Provider;
  serviceCategoryCode: string;
  maxSpecificOccasions: number;
  activeServiceCategoryCodes: readonly string[];
}

const ID = /^[a-z][a-z0-9_]{1,63}$/u;

function invalid(reason: string): never {
  throw new Error(reason);
}

function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * New global-eligibility projection.
 *
 * No provider-specific approvedOccasionIds or
 * providerEligibilityRevision is used.
 *
 * This does not independently authorize package publication.
 * Callers must load trusted provider, category and catalog
 * snapshots within their transaction.
 */
export function resolveGlobalOccasionSelection(
  input: GlobalOccasionSelectionInput,
  authority: GlobalOccasionSelectionAuthority,
  previousEventType?: string,
) {
  if (
    !positive(authority.catalogRevision) ||
    !positive(authority.maxSpecificOccasions) ||
    authority.maxSpecificOccasions > 100 ||
    !ID.test(authority.serviceCategoryCode) ||
    !authority.activeServiceCategoryCodes.includes(
      authority.serviceCategoryCode,
    )
  ) {
    return invalid("CONFIG_UNAVAILABLE");
  }

  if (
    input?.occasionSchemaVersion !== 2 ||
    !["specific", "all"].includes(input.occasionScope) ||
    !Array.isArray(input.occasionIds) ||
    input.occasionIds.some(id => typeof id !== "string" || !ID.test(id)) ||
    new Set(input.occasionIds).size !== input.occasionIds.length ||
    (input.occasionScope === "all" && input.occasionIds.length !== 0) ||
    (input.occasionScope === "specific" &&
      (input.occasionIds.length < 1 ||
       input.occasionIds.length > authority.maxSpecificOccasions))
  ) {
    return invalid("INVALID_OCCASION_SELECTION");
  }

  if (
    !["approved", "verified"].includes(
      String(authority.provider.verificationStatus),
    ) ||
    authority.provider.isActive !== true ||
    authority.provider.isBlocked === true ||
    authority.provider.isSuspended === true ||
    authority.provider.isDeleted === true ||
    !Array.isArray(authority.provider.serviceCategories) ||
    !authority.provider.serviceCategories.includes(
      authority.serviceCategoryCode,
    )
  ) {
    return invalid("PROVIDER_OCCASION_INELIGIBLE");
  }

  if (!Array.isArray(authority.catalog) ||
      authority.catalog.length > 200) {
    return invalid("CONFIG_UNAVAILABLE");
  }

  const seen = new Set<string>();

  for (const occasion of authority.catalog) {
    if (
      !occasion ||
      typeof occasion.id !== "string" ||
      !ID.test(occasion.id) ||
      seen.has(occasion.id) ||
      !positive(occasion.revision) ||
      !Number.isSafeInteger(occasion.sortOrder) ||
      occasion.active !== true ||
      occasion.moderationState !== "approved" ||
      !Array.isArray(occasion.applicableServiceCategoryCodes) ||
      occasion.applicableServiceCategoryCodes.length < 1 ||
      occasion.applicableServiceCategoryCodes.some(
        (code: unknown) => typeof code !== "string" || !ID.test(code),
      )
    ) {
      return invalid("CONFIG_UNAVAILABLE");
    }

    seen.add(occasion.id);
  }

  const applicable = authority.catalog
    .filter(occasion => occasion.applicableServiceCategoryCodes.includes(
      authority.serviceCategoryCode,
    ))
    .sort((a, b) =>
      a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );

  const selected = input.occasionScope === "all" ?
    applicable :
    applicable.filter(occasion => input.occasionIds.includes(occasion.id));

  if (
    selected.length < 1 ||
    (input.occasionScope === "specific" &&
      selected.length !== input.occasionIds.length)
  ) {
    return invalid("INVALID_OCCASION_SELECTION");
  }

  for (const occasion of selected) {
    if (!isGloballyEligibleOccasion({
      occasion,
      provider: authority.provider,
      serviceCategoryCode: authority.serviceCategoryCode,
      occasionId: occasion.id,
    })) {
      return invalid("PROVIDER_OCCASION_INELIGIBLE");
    }
  }

  const ids = selected.map(occasion => occasion.id);

  return {
    occasionSchemaVersion: 2 as const,
    occasionScope: input.occasionScope,
    occasionIds: input.occasionScope === "all" ? [] : [...ids],
    eventType: previousEventType && ids.includes(previousEventType) ?
      previousEventType : ids[0],
    occasionMatchIds: ids,
    occasionCatalogRevision: authority.catalogRevision,
    occasionEligibilityModel: "global_v1" as const,
    globalEligibilityContractVersion: GLOBAL_OCCASION_CONTRACT_VERSION,
    occasionEligibilityState: "valid" as const,
  };
}