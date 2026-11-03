const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validOccasionCategoryDependencyEntry,
  occasionCategoryDependencyEntryPath,
} = require("../lib/admin/occasion-category-dependency-registry.js");

function entry(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "universal_package",
    categoryCode: "catering",
    sourceId: "package_123",
    sourcePath: "packages/package_123",
    ...overrides,
  };
}

test("valid category dependency has deterministic path", () => {
  const value = entry();

  assert.equal(validOccasionCategoryDependencyEntry(value), true);
  assert.equal(
    occasionCategoryDependencyEntryPath(value),
    "occasionCategoryDependencies/catering/entries/" +
      "universal_package_package_123",
  );
});

test("category witness is independent of specific occasion IDs", () => {
  const value = entry();

  assert.equal(Object.hasOwn(value, "occasionId"), false);
  assert.equal(Object.hasOwn(value, "occasionMatchIds"), false);
  assert.equal(validOccasionCategoryDependencyEntry(value), true);
});

test("reject invalid category codes", () => {
  for (const categoryCode of [
    "",
    "Catering",
    "bad/category",
    "a",
    123,
    null,
  ]) {
    const value = entry({categoryCode});
    assert.equal(validOccasionCategoryDependencyEntry(value), false);
    assert.throws(
      () => occasionCategoryDependencyEntryPath(value),
      /OCCASION_CATEGORY_DEPENDENCY_ENTRY_INVALID/,
    );
  }
});

test("reject invalid source identity or path", () => {
  for (const value of [
    entry({sourceId: ""}),
    entry({sourceId: "bad/id"}),
    entry({sourcePath: "mainEvents/package_123"}),
    entry({sourcePath: "packages/other_package"}),
    entry({kind: "package"}),
    entry({schemaVersion: 2}),
  ]) {
    assert.equal(validOccasionCategoryDependencyEntry(value), false);
    assert.throws(
      () => occasionCategoryDependencyEntryPath(value),
      /OCCASION_CATEGORY_DEPENDENCY_ENTRY_INVALID/,
    );
  }
});

test("reject malformed registry values", () => {
  for (const value of [
    null,
    undefined,
    [],
    "category",
    {},
  ]) {
    assert.equal(validOccasionCategoryDependencyEntry(value), false);
  }
});

test("the category registry cannot authorize deactivation by itself", () => {
  // Contract entries are witnesses, not completeness certificates.
  const value = entry();
  assert.equal(validOccasionCategoryDependencyEntry(value), true);
  assert.equal(Object.hasOwn(value, "coverageVerified"), false);
  assert.equal(Object.hasOwn(value, "canDeactivate"), false);
});
