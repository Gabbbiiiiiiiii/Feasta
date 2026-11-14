/**
 * Private, read-only Phase 2B inventory enumerator.
 *
 * Enumerating to a terminal page does NOT confer transaction isolation:
 * writers may change packages or create new ones between queries. Therefore
 * even a fully scanned collection is NEVER release, withdrawal or activation
 * authorization. A future coordinator must own a proven write fence and recheck
 * all evidence in its transaction protocol.
 *
 * This module performs no database I/O on its own and is not exported from the
 * Firebase Functions entrypoint. Only a trusted server caller may supply the
 * page-reader callback, sourced from a server-owned Firestore query.
 */

export interface OccasionInventoryRow {
  id: string;
  data: Readonly<Record<string, unknown>>;
}

export type ReadInventoryPage = (
  afterDocumentId: string | null,
  limit: number,
) => Promise<readonly OccasionInventoryRow[]>;

export interface OccasionInventoryScan {
  occasionId: string;
  action: "activate" | "deactivate";
  scannedCount: number;
  pageCount: number;
  terminalPageReached: true;
  /** ID-sorted, conservative candidate list, NOT a trusted executable batch. */
  candidatePackageIds: string[];
  /** Potentially public records whose contract cannot be established. */
  ambiguousPackageIds: string[];
  providerReviewIds: string[];
  /** Query pagination cannot prove the collection remained unchanged. */
  snapshotIsolated: false;
  allWritersFenced: false;
  canWithdraw: false;
  canActivate: false;
  canRestore: false;
  blockers: readonly string[];
}

const pageSize = 100;
const maxPages = 100;
const maxRecords = pageSize * maxPages;
const v2Fields = ["occasionScope", "occasionIds", "occasionMatchIds",
  "occasionCatalogRevision", "providerEligibilityRevision", "occasionEligibilityState",
  "pricingModel"];
const legacyIds = new Set(["birthday", "wedding", "debut", "anniversary", "reunion",
  "corporate", "baptism", "graduation", "other"]);

function canonical(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/u.test(value);
}
function documentId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}
function uniqueCanonicalList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(canonical) &&
    new Set(value).size === value.length;
}
function own(value: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exposed(data: Readonly<Record<string, unknown>>): boolean {
  return data.isPublished !== false || data.isActive !== false ||
    data.providerPubliclyVisible !== false || data.status === "published";
}
function affected(data: Readonly<Record<string, unknown>>, occasionId: string,
  categories: ReadonlySet<string>): {include: boolean; ambiguous: boolean} {
  if (data.occasionSchemaVersion === 2) {
    if (!uniqueCanonicalList(data.occasionIds) ||
      !uniqueCanonicalList(data.occasionMatchIds) ||
      !["specific", "all"].includes(data.occasionScope as string) ||
      (data.occasionScope === "all" && data.occasionIds.length !== 0) ||
      (data.occasionScope === "specific" && data.occasionIds.length === 0)) {
      return {include: true, ambiguous: true};
    }
    if (data.occasionIds.includes(occasionId) ||
      data.occasionMatchIds.includes(occasionId)) {
      return {include: true, ambiguous: false};
    }
    if (data.occasionScope === "all") {
      // Unknown category must be treated as potentially affected.
      if (!canonical(data.serviceCategoryCode)) {
        return {include: true, ambiguous: true};
      }
      return {include: categories.has(data.serviceCategoryCode), ambiguous: false};
    }
    return {include: false, ambiguous: false};
  }
  if ((own(data, "occasionSchemaVersion") && data.occasionSchemaVersion !== 1) ||
    (own(data, "offerSchemaVersion") && data.offerSchemaVersion !== 1) ||
    v2Fields.some((field) => own(data, field))) {
    return {include: true, ambiguous: true};
  }
  if (data.eventType === occasionId) return {include: true, ambiguous: false};
  if (typeof data.eventType !== "string" || !legacyIds.has(data.eventType)) {
    return {include: true, ambiguous: true};
  }
  return {include: false, ambiguous: false};
}

/** Exhausts a finite, ascending document-ID scan or refuses without partial success. */
export async function scanOccasionPackageInventory(input: {
  action: "activate" | "deactivate";
  occasionId: string;
  applicableCategoryCodes: readonly string[];
  readPage: ReadInventoryPage;
}): Promise<OccasionInventoryScan> {
  if (!input || !["activate", "deactivate"].includes(input.action) ||
    !canonical(input.occasionId) ||
    !Array.isArray(input.applicableCategoryCodes) ||
    !uniqueCanonicalList([...input.applicableCategoryCodes]) ||
    !input.applicableCategoryCodes.length ||
    typeof input.readPage !== "function") {
    throw new Error("INVALID_OCCASION_INVENTORY_REQUEST");
  }
  const categories = new Set(input.applicableCategoryCodes);
  const candidates: string[] = [];
  const ambiguous: string[] = [];
  const providers = new Set<string>();
  let scannedCount = 0;
  let after: string | null = null;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    // Always request an explicit empty terminal page (even after a short page)
    // so a failed final page is not mistaken for completion.
    const rows = await input.readPage(after, pageSize);
    if (!Array.isArray(rows) || rows.length > pageSize) {
      throw new Error("INVALID_OCCASION_INVENTORY_PAGE");
    }
    if (rows.length === 0) {
      return {
        occasionId: input.occasionId, action: input.action,
        scannedCount, pageCount: pageIndex + 1, terminalPageReached: true,
        candidatePackageIds: candidates, ambiguousPackageIds: ambiguous,
        providerReviewIds: [...providers].sort(),
        snapshotIsolated: false, allWritersFenced: false,
        canWithdraw: false, canActivate: false, canRestore: false,
        blockers: ["INVENTORY_UNFENCED", "WRITERS_NOT_FENCED",
          "AUTHORITY_AND_PROVIDER_REVISIONS_UNVERIFIED",
          "FLUTTER_AND_CUSTOMER_READERS_UNVERIFIED",
          "LIFECYCLE_COMMIT_UNAVAILABLE"],
      };
    }
    for (const row of rows) {
      if (!row || !documentId(row.id) || !record(row.data) ||
        (after !== null && row.id <= after)) {
        throw new Error("UNSORTED_OR_MALFORMED_OCCASION_INVENTORY");
      }
      after = row.id;
      scannedCount++;
      if (scannedCount > maxRecords) throw new Error("OCCASION_INVENTORY_LIMIT");
      if (!exposed(row.data)) continue;
      const match = affected(row.data, input.occasionId, categories);
      if (match.include) {
        candidates.push(row.id);
        if (match.ambiguous) ambiguous.push(row.id);
        if (documentId(row.data.providerId)) providers.add(row.data.providerId);
      }
    }
  }
  throw new Error("OCCASION_INVENTORY_NOT_EXHAUSTED");
}
