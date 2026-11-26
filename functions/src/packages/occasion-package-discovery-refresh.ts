/**
 * Server-owned discovery pin refresh for published V2 packages.
 * Reuses resolveOccasionV2 (global eligibility) — the same derivation publish pins.
 * Never changes publication flags, prices, or financial fields.
 */
import {FieldPath, type Firestore, type Query, type QuerySnapshot, type Transaction} from "firebase-admin/firestore";
import type {GlobalOccasion} from "@feasta/shared-types/provider-package-v2";
import {isServiceCategoryCode} from "../shared/service-category-code.js";
import {parseWritableOccasionV2, resolveOccasionV2} from "./occasion-v2-validation.js";

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

export function isExposedPackageRecord(data: Readonly<Record<string, unknown>>): boolean {
  return data.isPublished !== false || data.isActive !== false ||
    data.providerPubliclyVisible !== false || data.status === "published";
}

function sameIds(a: unknown, b: readonly string[]): boolean {
  return Array.isArray(a) && a.length === b.length &&
    a.every((id, index) => id === b[index]);
}

function positiveRevision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 && value < Number.MAX_SAFE_INTEGER;
}

function asGlobalOccasion(
  id: string, data: Readonly<Record<string, unknown>>, forceActive?: boolean,
): GlobalOccasion {
  if (data.id !== id || data.moderationState !== "approved" ||
      !Array.isArray(data.applicableServiceCategoryCodes) ||
      !positiveRevision(data.revision) ||
      typeof data.sortOrder !== "number" ||
      !Number.isSafeInteger(data.sortOrder)) {
    refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
  }
  return {
    id,
    label: typeof data.label === "string" ? data.label : id,
    normalizedName: typeof data.normalizedName === "string" ?
      data.normalizedName : id,
    aliases: Array.isArray(data.aliases) ? data.aliases as string[] : [],
    active: forceActive === true ? true : data.active === true,
    moderationState: "approved",
    applicableServiceCategoryCodes:
      data.applicableServiceCategoryCodes as string[],
    sortOrder: data.sortOrder,
    revision: data.revision,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "system",
    createdAt: data.createdAt as GlobalOccasion["createdAt"],
    updatedAt: data.updatedAt as GlobalOccasion["updatedAt"],
  };
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
  /**
   * When true, skip well-formed exposed V2 packages whose specific occasionIds
   * reference an inactive/unavailable occasion (or fits-all when no active
   * occasion remains for their category, or whose service category is no longer
   * active). Those packages stay logically hidden without blocking unaffected
   * packages from refreshing to the new catalog revision.
   */
  skipUnavailablePackages?: boolean;
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
    if (!isExposedPackageRecord(data)) continue;

    // Malformed V2 occasion contracts always fail closed, even when skipping unavailable selections.
    let writableSelection;
    try {
      writableSelection = parseWritableOccasionV2({
        occasionSchemaVersion: 2,
        occasionScope: data.occasionScope,
        occasionIds: data.occasionIds,
      }, input.maxSpecificOccasions);
    } catch {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }

    const category = data.serviceCategoryCode;
    if (typeof category !== "string" ||
        !input.approvedActiveCategoryCodes.includes(category)) {
      if (input.skipUnavailablePackages) continue;
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }

    const approvedOccasionIds = input.catalog
      .filter((occasion) => occasion.active === true &&
        occasion.moderationState === "approved" &&
        occasion.applicableServiceCategoryCodes.includes(category))
      .map((occasion) => occasion.id);

    if (input.skipUnavailablePackages) {
      if (writableSelection.occasionScope === "specific" &&
          writableSelection.occasionIds.some((id) => !approvedOccasionIds.includes(id))) {
        continue;
      }
      if (writableSelection.occasionScope === "all" && approvedOccasionIds.length === 0) {
        continue;
      }
    }

    let resolved;
    try {
      resolved = resolveOccasionV2(writableSelection, {
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

/**
 * Paginated read of all packages inside a transaction.
 * Used by occasion writers that advance occasionCatalog/current.revision so
 * published V2 discovery pins stay atomically synchronized without artificial 40-doc caps.
 */
export async function readAllPackagesInTransaction(
  tx: Transaction,
  db: Firestore,
  pageSize = 40,
  maxTotal = 400,
): Promise<Array<{id: string; data: Record<string, unknown>}>> {
  const rows: Array<{id: string; data: Record<string, unknown>}> = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const ordered = db.collection("packages").orderBy(FieldPath.documentId());
    const query: Query = cursor === null ?
      ordered.limit(pageSize) :
      ordered.startAfter(cursor).limit(pageSize);

    const snapshot: QuerySnapshot = await tx.get(query);
    if (!Array.isArray(snapshot.docs) ||
        snapshot.docs.length > pageSize ||
        (typeof snapshot.size === "number" && snapshot.size !== snapshot.docs.length)) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }

    let previous: string | null = cursor;
    for (const doc of snapshot.docs) {
      if (typeof doc.id !== "string" || doc.id.length === 0 ||
          (previous !== null && doc.id <= previous) || seen.has(doc.id)) {
        refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
      }
      const data: unknown = doc.data();
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
      }
      seen.add(doc.id);
      rows.push({id: doc.id, data: data as Record<string, unknown>});
      previous = doc.id;
    }

    if (rows.length > maxTotal) {
      refuse("PACKAGE_INVENTORY_TOO_LARGE");
    }
    if (snapshot.docs.length < pageSize) {
      return rows;
    }
    if (previous === null || previous === cursor) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }
    cursor = previous;
  }
}

/**
 * Plans transactional V2 discovery pin refresh for any occasion writer that
 * advances occasionCatalog/current.revision.
 *
 * When zero exposed V2 packages exist, performs no policy/category/occasion reads
 * and returns an empty plan (preserving legacy-only isolation).
 */
export async function planTransactionalV2DiscoveryRefresh(
  tx: Transaction,
  db: Firestore,
  input: {
    nextCatalogRevision: number;
    /** Optional override: exclude an occasion being deactivated. */
    deactivateOccasionId?: string;
    /** Optional override: apply an edited/activated occasion record to the active catalog. */
    upsertOccasion?: {id: string; data: Readonly<Record<string, unknown>>; forceActive?: boolean};
    /** Optional pre-read full occasion records (e.g. from occasion-management.ts). */
    preloadedOccasions?: ReadonlyArray<Readonly<Record<string, unknown>>>;
    /** Optional pre-read packages (e.g. when caller already scanned packages). */
    preloadedPackages?: ReadonlyArray<{id: string; data: Readonly<Record<string, unknown>>}>;
    skipUnavailablePackages?: boolean;
    onlyStale?: boolean;
  },
): Promise<DiscoveryRefreshPlanItem[]> {
  const packageRows = input.preloadedPackages ??
    await readAllPackagesInTransaction(tx, db);
  const exposedV2Rows = packageRows.filter((row) =>
    row.data.occasionSchemaVersion === 2 && isExposedPackageRecord(row.data));
  if (exposedV2Rows.length === 0) {
    return [];
  }

  const policy = (await tx.get(
    db.collection("contractPolicies").doc("providerPackageV2"),
  )).data();
  if (!policy ||
      !Number.isSafeInteger(policy.maxSpecificOccasions) ||
      policy.maxSpecificOccasions < 1 ||
      policy.maxSpecificOccasions > 100) {
    refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
  }

  const categoriesSnap = await tx.get(
    db.collection("serviceCategories").where("status", "==", "active").limit(101),
  );
  if (categoriesSnap.docs.length > 100) {
    refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
  }
  const activeCategories = categoriesSnap.docs
    .map((doc) => {
      const row = doc.data();
      if (!row || row.code !== doc.id ||
          !isServiceCategoryCode(row.code) ||
          !["catering", "addon"].includes(row.serviceType)) {
        return null;
      }
      return row.code as string;
    })
    .filter((code): code is string => code !== null);
  if (activeCategories.length < 1) {
    refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
  }

  const byId = new Map<string, GlobalOccasion>();
  if (input.preloadedOccasions) {
    for (const row of input.preloadedOccasions) {
      if (row.active !== true || typeof row.id !== "string") continue;
      byId.set(row.id, asGlobalOccasion(row.id, row));
    }
  } else {
    const occasionSnap = await tx.get(
      db.collection("occasions").where("active", "==", true).limit(1001),
    );
    if (occasionSnap.docs.length > 1000) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }
    for (const doc of occasionSnap.docs) {
      byId.set(doc.id, asGlobalOccasion(doc.id, doc.data() as Record<string, unknown>));
    }
  }

  if (input.deactivateOccasionId) {
    byId.delete(input.deactivateOccasionId);
  }
  if (input.upsertOccasion) {
    const {id, data, forceActive} = input.upsertOccasion;
    if (forceActive === true || data.active === true) {
      byId.set(id, asGlobalOccasion(id, data, forceActive));
    } else {
      byId.delete(id);
    }
  }

  return planPublishedPackageDiscoveryRefresh({
    packageRows: exposedV2Rows,
    catalog: [...byId.values()],
    catalogRevision: input.nextCatalogRevision,
    maxSpecificOccasions: policy.maxSpecificOccasions as number,
    approvedActiveCategoryCodes: activeCategories,
    onlyStale: input.onlyStale,
    skipUnavailablePackages: input.skipUnavailablePackages ?? true,
  });
}
