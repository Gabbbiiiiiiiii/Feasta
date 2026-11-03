const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildHistoricalOccasionInventoryReport,
} = require("../lib/admin/occasion-historical-inventory-report.js");

function row(id, data) {
  return {id, data};
}

function reader(rows) {
  return async (after, limit) => rows
    .filter(item => after === null || item.id > after)
    .slice(0, limit);
}

function packageWitness(id) {
  return {
    path: `occasionDependencies/birthday/entries/package_${id}`,
    value: {
      schemaVersion: 1,
      kind: "package",
      occasionId: "birthday",
      sourceId: id,
      sourcePath: `packages/${id}`,
    },
  };
}

function input(overrides = {}) {
  return {
    readPackages: reader([
      row("pkg_1", {eventType: "birthday"}),
    ]),
    readMainEvents: reader([]),
    readProviderRequests: reader([]),
    actual: [packageWitness("pkg_1")],
    ...overrides,
  };
}

test("complete supplied pages remain non-authoritative", async () => {
  const report = await buildHistoricalOccasionInventoryReport(input());

  assert.equal(report.inventory.packages, 1);
  assert.equal(report.inventory.mainEvents, 0);
  assert.equal(report.inventory.providerRequests, 0);
  assert.equal(report.matched, 1);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.unresolved, []);
  assert.equal(report.snapshotIsolated, false);
  assert.equal(report.writersFenced, false);
  assert.equal(report.coverageVerified, false);
  assert.equal(report.canDeactivate, false);
});

test("missing package witness is reported", async () => {
  const report = await buildHistoricalOccasionInventoryReport(
    input({actual: []}),
  );

  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].reason, "missing");
  assert.equal(report.canDeactivate, false);
});

test("orphan provider request blocks reconciliation", async () => {
  const report = await buildHistoricalOccasionInventoryReport(input({
    readProviderRequests: reader([
      row("request_1", {
        mainEventId: "missing_booking",
        eventType: "birthday",
        status: "pending",
      }),
    ]),
  }));

  assert.ok(report.unresolved.includes(
    "providerRequests/request_1:orphan_or_mismatch",
  ));
  assert.equal(report.coverageVerified, false);
});

test("ambiguous historical package remains unresolved", async () => {
  const report = await buildHistoricalOccasionInventoryReport(input({
    readPackages: reader([
      row("pkg_2", {
        occasionSchemaVersion: 99,
        eventType: "birthday",
      }),
    ]),
    actual: [],
  }));

  assert.deepEqual(report.unresolved, ["packages/pkg_2"]);
  assert.equal(report.canDeactivate, false);
});

test("failed terminal-page read rejects the report", async () => {
  let count = 0;

  await assert.rejects(
    buildHistoricalOccasionInventoryReport(input({
      readPackages: async () => {
        count++;
        if (count === 1) {
          return [row("pkg_1", {eventType: "birthday"})];
        }
        throw new Error("PAGE_READ_FAILED");
      },
    })),
    /PAGE_READ_FAILED/,
  );
});

test("unsorted inventory rejects the report", async () => {
  await assert.rejects(
    buildHistoricalOccasionInventoryReport(input({
      readPackages: async () => [
        row("pkg_b", {eventType: "birthday"}),
        row("pkg_a", {eventType: "birthday"}),
      ],
    })),
    /UNSORTED_OR_MALFORMED_HISTORICAL_INVENTORY/,
  );
});

test("empty inventories never authorize deactivation", async () => {
  const report = await buildHistoricalOccasionInventoryReport(input({
    readPackages: reader([]),
    actual: [],
  }));

  assert.equal(report.checked, 0);
  assert.deepEqual(report.issues, []);
  assert.equal(report.coverageVerified, false);
  assert.equal(report.canDeactivate, false);
});
