/**
 * Read-only historical inventory pagination.
 *
 * This module performs no Firestore operations. A terminal scan does not
 * establish snapshot isolation, writer fencing, or release authority.
 */

export type HistoricalCollection =
  "packages" | "mainEvents" | "providerRequests";

export interface HistoricalInventoryRow {
  id: string;
  data: Readonly<Record<string, unknown>>;
}

export type ReadHistoricalInventoryPage = (
  afterId: string | null,
  limit: number,
) => Promise<readonly HistoricalInventoryRow[]>;

export interface HistoricalInventoryScan {
  collection: HistoricalCollection;
  rows: HistoricalInventoryRow[];
  scannedCount: number;
  pageCount: number;
  terminalPageReached: true;
  snapshotIsolated: false;
  writersFenced: false;
  coverageVerified: false;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_RECORDS = PAGE_SIZE * MAX_PAGES;
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;

function validRow(value: unknown): value is HistoricalInventoryRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" &&
    DOCUMENT_ID.test(row.id) &&
    row.data !== null &&
    typeof row.data === "object" &&
    !Array.isArray(row.data);
}

export async function scanHistoricalOccasionInventory(input: {
  collection: HistoricalCollection;
  readPage: ReadHistoricalInventoryPage;
}): Promise<HistoricalInventoryScan> {
  if (!input || !["packages", "mainEvents", "providerRequests"]
    .includes(input.collection) || typeof input.readPage !== "function") {
    throw new Error("INVALID_HISTORICAL_INVENTORY_REQUEST");
  }

  const rows: HistoricalInventoryRow[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await input.readPage(after, PAGE_SIZE);

    if (!Array.isArray(batch) || batch.length > PAGE_SIZE) {
      throw new Error("INVALID_HISTORICAL_INVENTORY_PAGE");
    }

    if (batch.length === 0) {
      return {
        collection: input.collection,
        rows,
        scannedCount: rows.length,
        pageCount: page + 1,
        terminalPageReached: true,
        snapshotIsolated: false,
        writersFenced: false,
        coverageVerified: false,
      };
    }

    for (const row of batch) {
      if (!validRow(row) ||
          (after !== null && row.id <= after)) {
        throw new Error("UNSORTED_OR_MALFORMED_HISTORICAL_INVENTORY");
      }

      rows.push(row);
      after = row.id;

      if (rows.length > MAX_RECORDS) {
        throw new Error("HISTORICAL_INVENTORY_LIMIT");
      }
    }
  }

  throw new Error("HISTORICAL_INVENTORY_NOT_EXHAUSTED");
}
