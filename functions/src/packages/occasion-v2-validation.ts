import type {
  GlobalOccasion, OccasionV2, PublicOccasion, WritableOccasionV2,
  UpdateProviderOccasionCapabilitiesRequest,
} from "@feasta/shared-types/provider-package-v2";
import {
  documentId, exact, invalid, mutationKey, plainText, positiveRevision,
  type ValidationReason,
} from "./v2-validation.js";

export function occasionId(value: unknown, reason: ValidationReason =
  "INVALID_OCCASION_SELECTION"): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(value)) {
    return invalid(reason);
  }
  return value;
}

export function occasionIds(value: unknown, reason: ValidationReason =
  "INVALID_OCCASION_SELECTION"): string[] {
  if (!Array.isArray(value)) return invalid(reason);
  const ids = Array.from(value, (id) => occasionId(id, reason));
  if (new Set(ids).size !== ids.length) return invalid(reason);
  return ids;
}

/** Must come from validated server policy, never a request or cached UI limits. */
export function specificSelectionLimit(value: unknown): number {
  return positiveRevision(value, "CONFIG_UNAVAILABLE");
}

export function parseWritableOccasionV2(
  value: unknown, maxSpecificOccasions: unknown,
): WritableOccasionV2 {
  const max = specificSelectionLimit(maxSpecificOccasions);
  const v = exact(value, ["occasionSchemaVersion", "occasionScope", "occasionIds"], [],
    "INVALID_OCCASION_SELECTION");
  if (v.occasionSchemaVersion !== 2 ||
      (v.occasionScope !== "specific" && v.occasionScope !== "all") ||
      !Array.isArray(v.occasionIds) ||
      (v.occasionScope === "specific" ? v.occasionIds.length < 1 ||
        v.occasionIds.length > max : v.occasionIds.length !== 0)) {
    return invalid("INVALID_OCCASION_SELECTION");
  }
  const ids = occasionIds(v.occasionIds);
  return {occasionSchemaVersion: 2, occasionScope: v.occasionScope, occasionIds: ids};
}

export interface OccasionAuthority {
  /** Current server-loaded catalog and explicitly approved provider capabilities. */
  catalog: readonly GlobalOccasion[];
  approvedOccasionIds: readonly string[];
  serviceCategoryCode: string;
  /** Validated active canonical provider category codes, from the server authority. */
  approvedActiveCategoryCodes: readonly string[];
  catalogRevision: number;
  providerEligibilityRevision: number;
  maxSpecificOccasions: number;
}

function catalogOrder(a: GlobalOccasion, b: GlobalOccasion): number {
  return a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Produces a new completed contract or rejects; never silently falls back to V1. */
export function resolveOccasionV2(
  value: unknown, authority: OccasionAuthority, previousEventType?: string,
): OccasionV2 {
  const input = parseWritableOccasionV2(value, authority.maxSpecificOccasions);
  positiveRevision(authority.catalogRevision, "CONFIG_UNAVAILABLE");
  positiveRevision(authority.providerEligibilityRevision, "CONFIG_UNAVAILABLE");
  if (!authority.approvedActiveCategoryCodes.includes(authority.serviceCategoryCode)) {
    return invalid("INVALID_SERVICE_CATEGORY");
  }
  const applicable = authority.catalog.filter((o) =>
    o.active === true && o.moderationState === "approved" &&
    o.applicableServiceCategoryCodes.includes(authority.serviceCategoryCode)).sort(catalogOrder);
  const eligible = applicable.filter((o) => authority.approvedOccasionIds.includes(o.id));
  if (input.occasionScope === "specific") {
    for (const id of input.occasionIds) {
      const occasion = authority.catalog.find((o) => o.id === id);
      if (!occasion || occasion.moderationState !== "approved" ||
          !occasion.applicableServiceCategoryCodes.includes(authority.serviceCategoryCode)) {
        return invalid("INVALID_OCCASION_SELECTION");
      }
      if (occasion.active !== true) return invalid("OCCASION_INACTIVE");
      if (!authority.approvedOccasionIds.includes(id)) {
        return invalid("PROVIDER_OCCASION_INELIGIBLE");
      }
    }
  }
  if (input.occasionScope === "all" && eligible.length !== applicable.length) {
    return invalid("UNIVERSAL_REVALIDATION_REQUIRED");
  }
  const selected = input.occasionScope === "all" ? applicable :
    applicable.filter((o) => input.occasionIds.includes(o.id));
  if (!selected.length || selected.some((o) => !eligible.includes(o)) ||
      (input.occasionScope === "specific" && selected.length !== input.occasionIds.length)) {
    return invalid("INVALID_OCCASION_SELECTION");
  }
  const ids = selected.map((o) => o.id);
  return {
    ...input, occasionIds: input.occasionScope === "all" ? [] : [...ids],
    eventType: previousEventType && ids.includes(previousEventType) ? previousEventType : ids[0],
    occasionMatchIds: ids, occasionCatalogRevision: authority.catalogRevision,
    providerEligibilityRevision: authority.providerEligibilityRevision,
    occasionEligibilityState: "valid",
  };
}

/** Pure explicit allowlist; no moderation, aliases, actors, or administrative timestamps leak. */
export function projectPublicOccasions(
  catalog: readonly GlobalOccasion[], activeCanonicalCategoryCodes: readonly string[],
  category?: string,
): PublicOccasion[] {
  if (category !== undefined && !activeCanonicalCategoryCodes.includes(category)) {
    return invalid("INVALID_SERVICE_CATEGORY");
  }
  return catalog.filter((o) => o.active === true && o.moderationState === "approved" &&
    (category === undefined || o.applicableServiceCategoryCodes.includes(category)))
    .sort(catalogOrder).map((o) => ({
      id: o.id, label: o.label,
      applicableServiceCategoryCodes: [...o.applicableServiceCategoryCodes],
      sortOrder: o.sortOrder, revision: o.revision,
    }));
}

export function parseCapabilityChange(value: unknown): UpdateProviderOccasionCapabilitiesRequest {
  const reason = "INVALID_CAPABILITY_CHANGE";
  const v = exact(value, ["providerId", "approveOccasionIds", "revokeOccasionIds",
    "expectedProviderEligibilityRevision", "expectedCatalogRevision", "reason", "idempotencyKey"],
  [], reason);
  const approve = occasionIds(v.approveOccasionIds, reason);
  const revoke = occasionIds(v.revokeOccasionIds, reason);
  if (!approve.length && !revoke.length || approve.some((id) => revoke.includes(id))) {
    return invalid(reason);
  }
  return {
    providerId: documentId(v.providerId, reason),
    approveOccasionIds: approve, revokeOccasionIds: revoke,
    expectedProviderEligibilityRevision:
      positiveRevision(v.expectedProviderEligibilityRevision, reason),
    expectedCatalogRevision: positiveRevision(v.expectedCatalogRevision, reason),
    reason: plainText(v.reason, 10, 500, reason),
    idempotencyKey: mutationKey(v.idempotencyKey, reason),
  };
}

/** Server-loaded context only. This does not authenticate/admin-authorize or commit a change. */
export function validateCapabilityDelta(value: unknown, context: {
  catalog: readonly GlobalOccasion[]; heldOccasionIds: readonly string[];
  approvedActiveCategoryCodes: readonly string[]; providerOperationallyApproved: boolean;
}): UpdateProviderOccasionCapabilitiesRequest {
  const input = parseCapabilityChange(value);
  const reason = "INVALID_CAPABILITY_CHANGE";
  for (const id of input.approveOccasionIds) {
    const occasion = context.catalog.find((o) => o.id === id);
    if (context.providerOperationallyApproved !== true || context.heldOccasionIds.includes(id) ||
        occasion?.active !== true || occasion.moderationState !== "approved" ||
        !occasion.applicableServiceCategoryCodes.some((c) =>
          context.approvedActiveCategoryCodes.includes(c))) {
      return invalid(reason);
    }
  }
  for (const id of input.revokeOccasionIds) {
    if (!context.catalog.some((o) => o.id === id) || !context.heldOccasionIds.includes(id)) {
      return invalid(reason);
    }
  }
  return input;
}
