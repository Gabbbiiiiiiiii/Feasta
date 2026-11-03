const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildHistoricalOccasionReconciliationReport,
} = require("../lib/admin/occasion-historical-reconciliation-report.js");

function pkg(id, eventType = "birthday") {
  return {
    id,
    data: {eventType},
  };
}

function witness(id, occasion = "birthday") {
  return {
    path: `occasionDependencies/${occasion}/entries/package_${id}`,
    value: {
      schemaVersion: 1,
      kind: "package",
      occasionId: occasion,
      sourceId: id,
      sourcePath: `packages/${id}`,
    },
  };
}

test("matching package witnesses remain non-authoritative", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [pkg("pkg_1")],
    providerRequests: [],
    mainEvents: [],
    actual: [witness("pkg_1")],
  });

  assert.equal(report.checked, 1);
  assert.equal(report.matched, 1);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.unresolved, []);
  assert.equal(report.coverageVerified, false);
});

test("missing historical package witness is reported", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [pkg("pkg_1")],
    providerRequests: [],
    mainEvents: [],
    actual: [],
  });

  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].reason, "missing");
  assert.equal(report.coverageVerified, false);
});

test("ambiguous package remains unresolved", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [{
      id: "pkg_2",
      data: {occasionSchemaVersion: 99, eventType: "birthday"},
    }],
    providerRequests: [],
    mainEvents: [],
    actual: [],
  });

  assert.deepEqual(report.unresolved, ["packages/pkg_2"]);
  assert.equal(report.coverageVerified, false);
});

test("customer planning draft is excluded", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [],
    providerRequests: [],
    mainEvents: [{
      id: "draft_1",
      data: {
        status: "draft",
        customerId: "customer_1",
        eventType: "birthday",
      },
    }],
    actual: [],
  });

  assert.deepEqual(report.excluded, ["mainEvents/draft_1"]);
  assert.deepEqual(report.unresolved, []);
  assert.equal(report.coverageVerified, false);
});

test("incomplete booking remains unresolved", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [],
    providerRequests: [],
    mainEvents: [{
      id: "booking_1",
      data: {
        status: "pending",
        eventType: "birthday",
        bookingId: "booking_1",
      },
    }],
    actual: [],
  });

  assert.deepEqual(report.unresolved, [
    "mainEvents/booking_1",
    "mainEvents/booking_1:provider_requests_unverified",
  ]);
  assert.equal(report.coverageVerified, false);
});

test("unexpected archived witness requires review", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [{
      id: "pkg_3",
      data: {
        eventType: "birthday",
        status: "archived",
        isActive: false,
        isPublished: false,
        providerPubliclyVisible: false,
      },
    }],
    providerRequests: [],
    mainEvents: [],
    actual: [witness("pkg_3")],
  });

  assert.deepEqual(report.excluded, ["packages/pkg_3"]);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.retainedArchivedWitnesses, [
    witness("pkg_3").path,
  ]);
  assert.equal(report.matched, 1);
  assert.equal(report.coverageVerified, false);
});

test("empty supplied inventories cannot certify coverage", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [],
    providerRequests: [],
    mainEvents: [],
    actual: [],
  });

  assert.equal(report.checked, 0);
  assert.deepEqual(report.issues, []);
  assert.equal(report.coverageVerified, false);
});

function booking(id = "booking_1") {
  return {
    id,
    data: {
      bookingId: id,
      mainEventId: id,
      bookingCode: "BK-ABC1234567",
      submissionFingerprint: "a".repeat(64),
      submittedAt: "2026-10-01T10:00:00Z",
      status: "pending",
      eventType: "birthday",
      providerRequestIds: ["request_1"],
      providerRequestCount: 1,
    },
  };
}

function providerRequest(eventType = "birthday") {
  return {
    id: "request_1",
    data: {
      mainEventId: "booking_1",
      eventType,
      status: "pending",
    },
  };
}

test("verified booking relationship has no linkage blocker", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [],
    mainEvents: [booking()],
    providerRequests: [providerRequest()],
    actual: [],
  });

  assert.deepEqual(report.unresolved, []);
  assert.equal(report.checked, 1);
  assert.equal(report.issues[0].reason, "missing");
  assert.equal(report.coverageVerified, false);
});

test("mismatched provider request remains unresolved", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [],
    mainEvents: [booking()],
    providerRequests: [providerRequest("wedding")],
    actual: [],
  });

  assert.ok(report.unresolved.includes(
    "mainEvents/booking_1:provider_requests_unverified",
  ));
  assert.ok(report.unresolved.includes(
    "providerRequests/request_1:orphan_or_mismatch",
  ));
  assert.equal(report.coverageVerified, false);
});

test("malformed archived membership remains unresolved", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [{
      id: "pkg_bad",
      data: {
        status: "archived",
        isActive: false,
        isPublished: false,
        providerPubliclyVisible: false,
        occasionSchemaVersion: 99,
      },
    }],
    mainEvents: [],
    providerRequests: [],
    actual: [],
  });

  assert.ok(report.unresolved.includes(
    "packages/pkg_bad:archived_membership_unverified",
  ));
  assert.equal(report.coverageVerified, false);
});

test("unrelated registry entries still require review", () => {
  const report = buildHistoricalOccasionReconciliationReport({
    packages: [],
    mainEvents: [],
    providerRequests: [],
    actual: [witness("unknown_package")],
  });

  assert.ok(report.issues.some(issue =>
    issue.path === witness("unknown_package").path &&
    issue.reason === "mismatch",
  ));
  assert.deepEqual(report.retainedArchivedWitnesses, []);
  assert.equal(report.coverageVerified, false);
});

test("archived witness with conflicting identity is rejected", () => {
  const conflicting = witness("pkg_3");
  conflicting.value.sourcePath = "packages/different_package";

  const report = buildHistoricalOccasionReconciliationReport({
    packages: [{
      id: "pkg_3",
      data: {
        eventType: "birthday",
        status: "archived",
        isActive: false,
        isPublished: false,
        providerPubliclyVisible: false,
      },
    }],
    mainEvents: [],
    providerRequests: [],
    actual: [conflicting],
  });

  assert.ok(report.issues.some(issue =>
    issue.reason === "mismatch",
  ));
  assert.equal(report.coverageVerified, false);
});