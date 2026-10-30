const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(
  path.join(__dirname, "../src/packages/legacy-occasion-publication-guard.ts"),
  "utf8"
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

const exported = {};
vm.runInNewContext(output, {exports: exported});
const isLegacy = exported.isLegacyOccasionPackage;

test("ordinary V1 offers remain compatible", () => {
  assert.equal(isLegacy({eventType: "birthday"}), true);
  assert.equal(isLegacy({
    eventType: "birthday",
    occasionSchemaVersion: 1,
    offerSchemaVersion: 1
  }), true);
});

test("explicit pricingModel cannot bypass legacy boundary", () => {
  for (const marker of ["per_pax", "fixed_bundle", null, undefined, 0, ""]) {
    assert.equal(isLegacy({eventType: "birthday", pricingModel: marker}),
      false, String(marker));
  }
});

test("unknown offer versions are rejected", () => {
  for (const marker of [2, null, "1", 0]) {
    assert.equal(isLegacy({offerSchemaVersion: marker}), false);
  }
});

test("partial V2 occasion fields remain rejected", () => {
  for (const key of [
    "occasionScope", "occasionIds", "occasionMatchIds",
    "occasionCatalogRevision", "providerEligibilityRevision",
    "occasionEligibilityState"
  ]) {
    assert.equal(isLegacy({[key]: null}), false, key);
  }
});