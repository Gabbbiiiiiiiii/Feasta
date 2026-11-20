/**
 * Server-owned discovery pin refresh for published V2 packages.
 * Reuses resolveOccasionV2 (global eligibility) — the same derivation publish pins.
 * Never changes publication flags, prices, or financial fields.
 */
import type {GlobalOccasion} from "@feasta/shared-types/provider-package-v2";
import {resolveOccasionV2} from "./occasion-v2-validation.js";

export type DiscoveryRefreshPatch = {
  eventType: string;
  occasionMatchIds: string[];
  occasionCatalogRevision: number;
  providerEligibilityRevision: number;
  occasionEligibilityState: "valid";
};

export type DiscoveryRefreshPlanItem = {
  packageId: string;
  patch: DiscoveryRefreshPatch;
  changed: boolean;
};

function refuse(code: string): never {
  throw new Error(code);
}

function exposed(data: Readonly<Record<string, unknown>>): boolean {
  return data.isPublished !== false || data.isActive !== false ||
    data.providerPubliclyVisible !== false || data.status === "published";
}

function sameIds(a: unknown, b: readonly string[]): boolean {
  return Array.isArray(a) && a.length === b.length &&
    a.every((id, index) => id === b[index]);
}

/** Plans discoveryProjection updates for exposed V2 packages. Legacy rows are ignored. */
export function planPublishedPackageDiscoveryRefresh(input: {
  packageRows: readonly {id: string; data: Readonly<Record<string, unknown>>}[];
  catalog: readonly GlobalOccasion[];
  catalogRevision: number;
  maxSpecificOccasions: number;
  approvedActiveCategoryCodes: readonly string[];
  /** When true, skip packages whose pins already match the resolved projection. */
  onlyStale?: boolean;
}): DiscoveryRefreshPlanItem[] {
  if (!input || !Array.isArray(input.packageRows) ||
      !Array.isArray(input.catalog) ||
      !Number.isSafeInteger(input.catalogRevision) ||
      input.catalogRevision < 1 ||
      !Number.isSafeInteger(input.maxSpecificOccasions) ||
      input.maxSpecificOccasions < 1 || input.maxSpecificOccasions > 100 ||
      !Array.isArray(input.approvedActiveCategoryCodes) ||
      input.approvedActiveCategoryCodes.length < 1) {
    refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
  }

  const planned: DiscoveryRefreshPlanItem[] = [];

  for (const row of input.packageRows) {
    if (!row || typeof row.id !== "string" || !row.data) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }
    const data = row.data;
    if (data.occasionSchemaVersion !== 2) continue;
    if (!exposed(data)) continue;

    const category = data.serviceCategoryCode;
    if (typeof category !== "string" ||
        !input.approvedActiveCategoryCodes.includes(category)) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }

    const approvedOccasionIds = input.catalog
      .filter((occasion) => occasion.active === true &&
        occasion.moderationState === "approved" &&
        occasion.applicableServiceCategoryCodes.includes(category))
      .map((occasion) => occasion.id);

    let resolved;
    try {
      resolved = resolveOccasionV2({
        occasionSchemaVersion: 2,
        occasionScope: data.occasionScope,
        occasionIds: data.occasionIds,
      }, {
        catalog: input.catalog,
        approvedOccasionIds,
        eligibilityMode: "global",
        serviceCategoryCode: category,
        approvedActiveCategoryCodes: input.approvedActiveCategoryCodes,
        catalogRevision: input.catalogRevision,
        providerEligibilityRevision: 1,
        maxSpecificOccasions: input.maxSpecificOccasions,
      }, typeof data.eventType === "string" ? data.eventType : undefined);
    } catch {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }

    if (!("providerEligibilityRevision" in resolved)) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }

    const patch: DiscoveryRefreshPatch = {
      eventType: resolved.eventType,
      occasionMatchIds: [...resolved.occasionMatchIds],
      occasionCatalogRevision: resolved.occasionCatalogRevision,
      providerEligibilityRevision: resolved.providerEligibilityRevision,
      occasionEligibilityState: "valid",
    };

    const changed = data.eventType !== patch.eventType ||
      data.occasionCatalogRevision !== patch.occasionCatalogRevision ||
      data.providerEligibilityRevision !== patch.providerEligibilityRevision ||
      data.occasionEligibilityState !== patch.occasionEligibilityState ||
      !sameIds(data.occasionMatchIds, patch.occasionMatchIds);

    if (input.onlyStale && !changed) continue;
    planned.push({packageId: row.id, patch, changed});
  }

  return planned;
}
