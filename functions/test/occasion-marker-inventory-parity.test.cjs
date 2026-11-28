"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTypeScript(file) {
  const source = readFileSync(join(__dirname, "../src/packages", file), "utf8");
  const output = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText;
  const exports = {};
  vm.runInNewContext(output, {exports, require});
  return exports;
}
const {scanOccasionPackageInventory} = loadTypeScript("occasion-transition-inventory-scan.ts");
const {withdrawOccasionPackageBatchInTransaction, withdrawalBatchOperationId} =
  loadTypeScript("occasion-withdrawal-batch.ts");

async function scanPackage(data) {
  const docs = [{id: "offer1", data}];
  return scanOccasionPackageInventory({action: "activate", occasionId: "birthday",
    applicableCategoryCodes: ["catering_service"],
    readPage: async (after, limit) => docs.filter((row) =>
      after === null || row.id > after).slice(0, limit),
  });
}
function reference(path) {return {path, id: path.split("/").at(-1)};}
async function withdrawPackage(data) {
  const actorUid = "admin123";
  const occasionId = "birthday";
  const action = "activate";
  const idempotencyKey = "releasecase12345";
  const operationId = withdrawalBatchOperationId({actorUid, occasionId, action, idempotencyKey});
  const input = {action, occasionId, actorUid, idempotencyKey,
    expectedCatalogRevision: 10, expectedOccasionRevision: 1,
    applicableCategoryCodes: ["catering_service"], reason: "Regression test inventory parity",
    packageRefs: [reference("packages/offer1")],
    catalogRef: reference("occasionCatalog/current"),
    occasionRef: reference("occasions/birthday"),
    adminRef: reference("users/admin123"),
    operationRef: reference(`occasionWithdrawalBatchOperations/${operationId}`),
    auditRef: reference(`occasionWithdrawalBatchAudits/${operationId}`),
  };
  const dataByPath = {
    "users/admin123": {role: "admin", accountStatus: "active", isActive: true, isBlocked: false},
    "occasionCatalog/current": {activationState: "stable", revision: 10},
    "occasions/birthday": {id: "birthday", moderationState: "approved",
      revision: 1, active: false, applicableServiceCategoryCodes: ["catering_service"]},
    "packages/offer1": data,
  };
  const writes = [];
  const tx = {
    get: async (ref) => ({exists: Object.hasOwn(dataByPath, ref.path),
      data: () => dataByPath[ref.path]}),
    update: (ref, value) => writes.push({kind: "update", path: ref.path, value}),
    create: (ref, value) => writes.push({kind: "create", path: ref.path, value}),
  };
  return {result: await withdrawOccasionPackageBatchInTransaction(tx, input), writes};
}
function published(extra) {return {
  eventType: "wedding", isPublished: true, isActive: true,
  providerPubliclyVisible: true, status: "published", ...extra,
};}

test("pricingModel markers, even null, are ambiguous public inventory candidates", async () => {
  for (const value of ["per_pax", "fixed_bundle", null, undefined]) {
    const result = await scanPackage(published({pricingModel: value}));
    assert.deepEqual(Array.from(result.candidatePackageIds), ["offer1"]);
    assert.deepEqual(Array.from(result.ambiguousPackageIds), ["offer1"]);
  }
});

test("unsupported offerSchemaVersion markers are ambiguous candidates", async () => {
  for (const value of [2, null, "1", 0]) {
    const result = await scanPackage(published({offerSchemaVersion: value}));
    assert.deepEqual(Array.from(result.ambiguousPackageIds), ["offer1"]);
  }
});

test("known legacy offerSchemaVersion 1 stays unrelated to another occasion", async () => {
  const result = await scanPackage(published({offerSchemaVersion: 1}));
  assert.equal(result.candidatePackageIds.length, 0);
});

test("withdrawal recognizes public marker-only offers conservatively", async () => {
  for (const data of [published({pricingModel: null}),
    published({offerSchemaVersion: 2})]) {
    const {result, writes} = await withdrawPackage(data);
    assert.deepEqual(Array.from(result.withdrawnPackageIds), ["offer1"]);
    const update = writes.find((row) => row.kind === "update" && row.path === "packages/offer1");
    assert.ok(update);
    assert.equal(update.value.isPublished, false);
    assert.equal(update.value.providerPubliclyVisible, false);
  }
});

test("withdrawal rejects unrelated V1 offers rather than changing them", async () => {
  await assert.rejects(withdrawPackage(published({offerSchemaVersion: 1})),
    /UNRELATED_WITHDRAWAL_PACKAGE/);
});
