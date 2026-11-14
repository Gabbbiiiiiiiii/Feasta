const test = require("node:test");
const assert = require("node:assert/strict");

const {
  scanHistoricalOccasionInventory,
} = require("../lib/admin/occasion-historical-inventory-scan.js");

function row(id) {
  return {
    id,
    data: {eventType: "birthday"},
  };
}

function pageReader(rows) {
  return async (after, limit) => rows
    .filter(item => after === null || item.id > after)
    .slice(0, limit);
}

test("empty inventory requires terminal page", async () => {
  const result = await scanHistoricalOccasionInventory({
    collection: "packages",
    readPage: async () => [],
  });

  assert.equal(result.scannedCount, 0);
  assert.equal(result.pageCount, 1);
  assert.equal(result.terminalPageReached, true);
  assert.equal(result.coverageVerified, false);
  assert.equal(result.snapshotIsolated, false);
  assert.equal(result.writersFenced, false);
});

test("sorted inventory reaches explicit terminal page", async () => {
  const result = await scanHistoricalOccasionInventory({
    collection: "mainEvents",
    readPage: pageReader([row("a"), row("b"), row("c")]),
  });

  assert.deepEqual(
    result.rows.map(value => value.id),
    ["a", "b", "c"],
  );
  assert.equal(result.pageCount, 2);
  assert.equal(result.coverageVerified, false);
});

test("more than one full page is scanned", async () => {
  const rows = Array.from({length: 150}, (_, i) =>
    row(`doc_${String(i).padStart(4, "0")}`));

  const result = await scanHistoricalOccasionInventory({
    collection: "providerRequests",
    readPage: pageReader(rows),
  });

  assert.equal(result.scannedCount, 150);
  assert.equal(result.pageCount, 3);
  assert.equal(result.coverageVerified, false);
});

test("duplicate identifiers are rejected", async () => {
  await assert.rejects(
    scanHistoricalOccasionInventory({
      collection: "packages",
      readPage: async () => [row("pkg_1"), row("pkg_1")],
    }),
    /UNSORTED_OR_MALFORMED_HISTORICAL_INVENTORY/,
  );
});

test("unsorted pages are rejected", async () => {
  await assert.rejects(
    scanHistoricalOccasionInventory({
      collection: "packages",
      readPage: async () => [row("b"), row("a")],
    }),
    /UNSORTED_OR_MALFORMED_HISTORICAL_INVENTORY/,
  );
});

test("malformed records are rejected", async () => {
  await assert.rejects(
    scanHistoricalOccasionInventory({
      collection: "mainEvents",
      readPage: async () => [{id: "bad/id", data: {}}],
    }),
    /UNSORTED_OR_MALFORMED_HISTORICAL_INVENTORY/,
  );
});

test("oversized pages are rejected", async () => {
  await assert.rejects(
    scanHistoricalOccasionInventory({
      collection: "packages",
      readPage: async () => Array.from(
        {length: 101},
        (_, i) => row(`pkg_${i}`),
      ),
    }),
    /INVALID_HISTORICAL_INVENTORY_PAGE/,
  );
});

test("missing terminal page fails closed", async () => {
  let count = 0;

  await assert.rejects(
    scanHistoricalOccasionInventory({
      collection: "packages",
      readPage: async () => {
        count++;
        return [row(`pkg_${String(count).padStart(4, "0")}`)];
      },
    }),
    /HISTORICAL_INVENTORY_NOT_EXHAUSTED/,
  );
});

test("invalid collection is rejected", async () => {
  await assert.rejects(
    scanHistoricalOccasionInventory({
      collection: "unknown",
      readPage: async () => [],
    }),
    /INVALID_HISTORICAL_INVENTORY_REQUEST/,
  );
});
