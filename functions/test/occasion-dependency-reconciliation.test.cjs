const test = require("node:test");
const assert = require("node:assert/strict");

const {
  reconcileOccasionDependencyWitnesses,
} = require("../lib/admin/occasion-dependency-reconciliation.js");

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

test("matching witnesses do not establish complete coverage", () => {
  const entry = witness("package_1");
  const result = reconcileOccasionDependencyWitnesses({
    expected: [entry],
    actual: [entry],
  });

  assert.equal(result.checked, 1);
  assert.equal(result.matched, 1);
  assert.deepEqual(result.issues, []);
  assert.equal(result.coverageVerified, false);
});

test("missing witness is reported", () => {
  const result = reconcileOccasionDependencyWitnesses({
    expected: [witness("package_1")],
    actual: [],
  });

  assert.deepEqual(result.issues, [{
    path: witness("package_1").path,
    reason: "missing",
  }]);
  assert.equal(result.coverageVerified, false);
});

test("conflicting witness is reported", () => {
  const original = witness("package_1");
  const conflicting = {
    ...original,
    value: {...original.value, sourcePath: "packages/package_2"},
  };

  const result = reconcileOccasionDependencyWitnesses({
    expected: [original],
    actual: [conflicting],
  });

  assert.equal(result.issues[0].reason, "mismatch");
  assert.equal(result.matched, 0);
});

test("duplicate expected witnesses are rejected", () => {
  const entry = witness("package_1");
  const result = reconcileOccasionDependencyWitnesses({
    expected: [entry, entry],
    actual: [entry],
  });

  assert.ok(result.issues.some(issue => issue.reason === "duplicate"));
  assert.equal(result.coverageVerified, false);
});

test("duplicate actual witnesses are rejected", () => {
  const entry = witness("package_1");
  const result = reconcileOccasionDependencyWitnesses({
    expected: [entry],
    actual: [entry, entry],
  });

  assert.ok(result.issues.some(issue => issue.reason === "duplicate"));
  assert.equal(result.coverageVerified, false);
});

test("unexpected registry entries require review", () => {
  const result = reconcileOccasionDependencyWitnesses({
    expected: [witness("package_1")],
    actual: [witness("package_1"), witness("package_2")],
  });

  assert.ok(result.issues.some(issue =>
    issue.path === witness("package_2").path &&
    issue.reason === "mismatch"));
});

test("malformed input is never considered complete", () => {
  const result = reconcileOccasionDependencyWitnesses({
    expected: [null, witness("package_1")],
    actual: [undefined, witness("package_1")],
  });

  assert.ok(result.issues.some(issue => issue.reason === "invalid"));
  assert.equal(result.coverageVerified, false);
});

test("empty inventories cannot independently authorize release", () => {
  const result = reconcileOccasionDependencyWitnesses({
    expected: [],
    actual: [],
  });

  assert.equal(result.checked, 0);
  assert.equal(result.matched, 0);
  assert.deepEqual(result.issues, []);
  assert.equal(result.coverageVerified, false);
});
