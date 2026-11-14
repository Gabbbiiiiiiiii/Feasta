"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../src/packages");
const cache = new Map();

function load(name) {
  if (cache.has(name)) return cache.get(name).exports;

  const filename = path.join(root, name + ".ts");
  const source = fs.readFileSync(filename, "utf8");

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = {exports: {}};
  cache.set(name, module);

  const localRequire = (id) => {
    if (id.startsWith("./")) {
      return load(id.replace(/^\.\//, "").replace(/\.js$/, ""));
    }
    return require(id);
  };

  const context = {
    module,
    exports: module.exports,
    require: localRequire,
    Set,
    Error,
    Object,
    Array,
    Number,
    String,
  };

  vm.runInNewContext(compiled, context, {filename});
  return module.exports;
}

const {isGloballyEligibleOccasion} =
  load("global-occasion-eligibility");

const {resolveGlobalOccasionSelection} =
  load("global-occasion-selection-v3");

const {isGlobalOccasionProjectionV1} =
  load("global-occasion-contract-v1");

const provider = () => ({
  verificationStatus: "approved",
  isActive: true,
  isBlocked: false,
  isSuspended: false,
  isDeleted: false,
  serviceCategories: ["catering_service"],
});

const birthday = () => ({
  id: "birthday",
  label: "Birthday",
  revision: 2,
  sortOrder: 1,
  active: true,
  moderationState: "approved",
  applicableServiceCategoryCodes: [
    "catering_service",
    "photographer",
  ],
});

const authority = () => ({
  catalog: [birthday()],
  catalogRevision: 11,
  provider: provider(),
  serviceCategoryCode: "catering_service",
  maxSpecificOccasions: 10,
  activeServiceCategoryCodes: ["catering_service"],
});

const selection = () => ({
  occasionSchemaVersion: 2,
  occasionScope: "specific",
  occasionIds: ["birthday"],
});

test("active Birthday is eligible for approved catering provider", () => {
  assert.equal(isGloballyEligibleOccasion({
    occasion: birthday(),
    provider: provider(),
    serviceCategoryCode: "catering_service",
    occasionId: "birthday",
  }), true);
});

test("inactive or unapproved occasion is rejected", () => {
  for (const patch of [
    {active: false},
    {moderationState: "pending"},
  ]) {
    assert.equal(isGloballyEligibleOccasion({
      occasion: {...birthday(), ...patch},
      provider: provider(),
      serviceCategoryCode: "catering_service",
      occasionId: "birthday",
    }), false);
  }
});

test("provider must be operationally eligible", () => {
  for (const patch of [
    {verificationStatus: "pending"},
    {isActive: false},
    {isBlocked: true},
    {isSuspended: true},
    {isDeleted: true},
  ]) {
    assert.equal(isGloballyEligibleOccasion({
      occasion: birthday(),
      provider: {...provider(), ...patch},
      serviceCategoryCode: "catering_service",
      occasionId: "birthday",
    }), false);
  }
});

test("unrelated service category cannot use Birthday", () => {
  assert.equal(isGloballyEligibleOccasion({
    occasion: birthday(),
    provider: {...provider(), serviceCategories: ["transportation"]},
    serviceCategoryCode: "transportation",
    occasionId: "birthday",
  }), false);
});

test("global resolver does not require provider-specific grants", () => {
  const result = resolveGlobalOccasionSelection(
    selection(),
    authority(),
  );

  assert.equal(result.occasionEligibilityModel, "global_v1");
  assert.equal(result.globalEligibilityContractVersion, 1);
  assert.equal(result.eventType, "birthday");
  assert.equal(result.occasionCatalogRevision, 11);
  assert.equal(
    Object.hasOwn(result, "providerEligibilityRevision"),
    false,
  );
});

test("Fits All resolves every applicable active occasion", () => {
  const result = resolveGlobalOccasionSelection({
    occasionSchemaVersion: 2,
    occasionScope: "all",
    occasionIds: [],
  }, authority());

  assert.equal(result.occasionScope, "all");
  assert.deepEqual(Array.from(result.occasionMatchIds), ["birthday"]);
});

test("duplicate or unsupported selections are rejected", () => {
  for (const ids of [
    ["birthday", "birthday"],
    ["wedding"],
    [],
  ]) {
    assert.throws(() => resolveGlobalOccasionSelection({
      occasionSchemaVersion: 2,
      occasionScope: "specific",
      occasionIds: ids,
    }, authority()));
  }
});

test("global projection rejects mixed legacy authority fields", () => {
  const result = resolveGlobalOccasionSelection(
    selection(),
    authority(),
  );

  assert.equal(isGlobalOccasionProjectionV1(result), true);

  assert.equal(isGlobalOccasionProjectionV1({
    ...result,
    providerEligibilityRevision: 1,
  }), false);

  assert.equal(isGlobalOccasionProjectionV1({
    ...result,
    occasionCatalogRevision: 0,
  }), false);
});