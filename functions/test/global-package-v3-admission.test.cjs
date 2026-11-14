"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../src/packages");

function load(name) {
  const file = path.join(root, name + ".ts");
  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = {exports: {}};

  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require,
    Set,
    Object,
    Array,
    Number,
    String,
  }, {filename: file});

  return module.exports;
}

const {isGlobalPackageWriteVersion} =
  load("global-package-write-v3");

const {packageOccasionContractMode} =
  load("package-occasion-contract-mode");

const validRequest = () => ({
  sharedContractVersion: 3,
  occasionSchemaVersion: 2,
  occasionScope: "specific",
  occasionIds: ["birthday"],
});

test("recognizes a valid global request", () => {
  assert.equal(isGlobalPackageWriteVersion(validRequest()), true);
});

test("rejects server-owned eligibility fields", () => {
  for (const field of [
    "occasionEligibilityModel",
    "occasionMatchIds",
    "occasionCatalogRevision",
    "providerEligibilityRevision",
    "approvedOccasionIds",
  ]) {
    assert.equal(isGlobalPackageWriteVersion({
      ...validRequest(),
      [field]: field === "occasionMatchIds" ? ["birthday"] : 1,
    }), false);
  }
});

test("rejects duplicate or invalid selections", () => {
  for (const occasionIds of [
    ["birthday", "birthday"],
    ["INVALID ID"],
    [],
  ]) {
    assert.equal(isGlobalPackageWriteVersion({
      ...validRequest(),
      occasionIds,
    }), false);
  }
});

test("rejects mixed legacy and global persisted records", () => {
  const global = {
    occasionEligibilityModel: "global_v1",
    globalEligibilityContractVersion: 1,
    occasionCatalogRevision: 11,
    occasionEligibilityState: "valid",
  };

  assert.equal(packageOccasionContractMode(global), "global_v1");

  assert.equal(packageOccasionContractMode({
    ...global,
    providerEligibilityRevision: 3,
  }), "invalid");
});

test("rejects malformed global versions", () => {
  const base = {
    occasionEligibilityModel: "global_v1",
    globalEligibilityContractVersion: 1,
    occasionCatalogRevision: 11,
    occasionEligibilityState: "valid",
  };

  assert.equal(packageOccasionContractMode({
    ...base,
    globalEligibilityContractVersion: 99,
  }), "invalid");

  assert.equal(packageOccasionContractMode({
    ...base,
    occasionCatalogRevision: 0,
  }), "invalid");
});
test("rejects all server-owned contract metadata", () => {
  for (const field of [
    "occasionEligibilityModel",
    "globalEligibilityContractVersion",
    "occasionMatchIds",
    "occasionCatalogRevision",
    "occasionEligibilityState",
    "providerEligibilityRevision",
    "approvedOccasionIds",
    "approvedCategoryCodes",
  ]) {
    assert.equal(isGlobalPackageWriteVersion({
      ...validRequest(),
      [field]: "spoofed",
    }), false, field);
  }
});

test("accepts Fits All only with an empty selection", () => {
  assert.equal(isGlobalPackageWriteVersion({
    ...validRequest(),
    occasionScope: "all",
    occasionIds: [],
  }), true);

  assert.equal(isGlobalPackageWriteVersion({
    ...validRequest(),
    occasionScope: "all",
    occasionIds: ["birthday"],
  }), false);
});

test("rejects unsupported contract versions", () => {
  for (const version of [1, 2, 4, null]) {
    assert.equal(isGlobalPackageWriteVersion({
      ...validRequest(),
      sharedContractVersion: version,
    }), false);
  }
});