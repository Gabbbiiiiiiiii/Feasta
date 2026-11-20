const {test, beforeEach} = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
let store, commits, attempts, beforeCommit, failCommit, authDisabled, rateCalls;
class Ref {constructor(key) {this.key = key; this.id = key.split("/").at(-1);}}
const snapshot = (key) => {
  const data = structuredClone(store.get(key));
  return {id: key.split("/").at(-1), exists: data !== undefined, data: () => data};
};
const db = {collection: (name) => ({doc: (id) => new Ref(`${name}/${id}`)}),
  runTransaction: async (callback) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      attempts++;
      const reads = new Map();
      const pending = [];
      const tx = {get: async (ref) => {
        assert.equal(pending.length, 0, "All reads precede writes");
        reads.set(ref.key, JSON.stringify(store.get(ref.key)));
        return snapshot(ref.key);
      }, create: (ref, data) => pending.push([ref.key, data])};
      const result = await callback(tx);
      if (beforeCommit) await beforeCommit(attempt);
      if ([...reads].some(([key, value]) => value !== JSON.stringify(store.get(key)))) continue;
      if (failCommit) throw Error("injected commit failure");
      for (const [key] of pending) assert.equal(store.has(key), false, "create-only audit/operation");
      for (const [key, data] of pending) store.set(key, structuredClone(data));
      commits.push(...pending);
      return result;
    }
    throw Error("retry budget exceeded");
  }};
const original = Module._load;
Module._load = function(id, parent, ...rest) {
  let resolved = "";
  try {resolved = Module._resolveFilename(id, parent).replaceAll("\\", "/");} catch {}
  if (resolved.endsWith("/lib/shared/firestore.js")) return {db};
  if (resolved.endsWith("/lib/shared/authorization.js")) return {requireRole: async (uid, roles) => {
    if (authDisabled || !roles.includes(store.get(`users/${uid}`)?.role)) {
      throw Object.assign(Error("denied"), {code: "permission-denied"});
    }
  }};
  if (resolved.endsWith("/lib/shared/rate-limit.js")) return {
    enforceCallableRateLimit: async (_request, policy) => {rateCalls.push(policy);},
  };
  return original.call(this, id, parent, ...rest);
};
const readiness = require("../lib/admin/occasion-activation-readiness.js");
const transitions = require("../lib/admin/occasion-transition-preparation.js");
Module._load = original;
const input = (extra = {}) => ({occasionId: "birthday", expectedOccasionRevision: 2,
  expectedCatalogRevision: 3, ...extra});
const transitionInput = (extra = {}) => ({occasionId: "birthday", expectedRevision: 2,
  expectedCatalogRevision: 3, releaseApprovalId: "untrusted_test_reference",
  reason: "Local blocked transition test", idempotencyKey: "transition_test_0001", ...extra});
const request = (data, extra = {}) => ({data, auth: {uid: "admin", token: {}},
  app: {appId: "test-app"}, rawRequest: {headers: {}}, ...extra});
const check = (data = input(), extra) => readiness.checkAdminOccasionActivationReadiness.run(request(data, extra));
const checkDeactivation = (data = input(), extra) =>
  readiness.checkAdminOccasionDeactivationReadiness.run(request(data, extra));
const prepare = (data = transitionInput(), action = "activate", extra) =>
  transitions.prepareBlockedOccasionTransition(request(data, extra), action);
const blocked = (result, code) => assert.ok(result.blockers.includes(code), code);
const reason = (value) => (error) => error.details?.reason === value;
beforeEach(() => {
  store = new Map(Object.entries({
    "users/admin": {role: "admin", accountStatus: "active", isActive: true, isBlocked: false},
    "users/customer": {role: "customer", accountStatus: "active", isActive: true, isBlocked: false},
    "occasionCatalog/current": {revision: 3, activationState: "stable"},
    "occasions/birthday": {id: "birthday", active: false, moderationState: "approved", revision: 2,
      applicableServiceCategoryCodes: ["catering_service"]},
    "serviceCategories/catering_service": {code: "catering_service", status: "active", serviceType: "catering"},
    "bookings/historical": {eventType: "birthday", agreement: {hash: "immutable-original"}},
    "providers/provider": {eventTypesSupported: ["birthday"]},
    "providerEligibilityAuthorities/provider": {revision: 7, approvedOccasionIds: []},
    "packages/universal": {occasionSchemaVersion: 2, occasionScope: "all", occasionIds: [], isPublished: true},
  }));
  commits = []; attempts = 0; beforeCommit = null; failCommit = false; authDisabled = false; rateCalls = [];
});

test("authorized readiness reports satisfied catalog checks but BLOCKED and performs no domain writes", async () => {
  const before = structuredClone(store);
  const result = await check();
  assert.equal(result.status, "BLOCKED"); assert.equal(result.lifecycleAvailable, false);
  assert.equal(result.checks.filter((item) => item.status === "SATISFIED").length, 7);
  assert.deepEqual(store, before); assert.equal(commits.length, 0);
  assert.equal(rateCalls[0].scope, "adminOccasions.readiness");
  assert.equal(JSON.stringify(result).includes("immutable-original"), false);
});

test("authentication App Check and current admin role are required on readiness preparation and polling", async () => {
  for (const invoke of [check, checkDeactivation, (data, extra) => prepare(transitionInput(), "activate", extra),
    (data, extra) => transitions.getOccasionTransition(request({operationId: "absent"}, extra))]) {
    await assert.rejects(invoke(input(), {auth: undefined}), {code: "unauthenticated"});
    await assert.rejects(invoke(input(), {app: undefined}), reason("APP_CHECK_REQUIRED"));
    await assert.rejects(invoke(input(), {auth: {uid: "customer", token: {}}}),
      {code: "permission-denied"});
    authDisabled = true;
    await assert.rejects(invoke(input()), {code: "permission-denied"}); authDisabled = false;
  }
  for (const patch of [{isActive: false}, {isBlocked: true}, {accountStatus: "deactivated"}]) {
    const prior = store.get("users/admin"); store.set("users/admin", {...prior, ...patch});
    await assert.rejects(check(), reason("ADMIN_REQUIRED"));
    await assert.rejects(prepare(), reason("ADMIN_REQUIRED")); store.set("users/admin", prior);
  }
  assert.equal(commits.length, 0);
});

test("deactivation readiness verifies the opposite state without changing the occasion", async () => {
  blocked(await checkDeactivation(), "OCCASION_STATE");
  store.get("occasions/birthday").active = true;
  const result = await checkDeactivation();
  assert.equal(result.action, "deactivate");
  assert.equal(result.blockers.includes("OCCASION_STATE"), false);
  assert.equal(result.lifecycleAvailable, false);
  assert.equal(store.get("occasions/birthday").active, true);
  assert.equal(commits.length, 0);
});

test("browser readiness assertions and release IDs are rejected", async () => {
  for (const extra of [{ready: true}, {withdrawalVerified: true}, {releaseApprovalId: "made_up"},
    {evidence: {web: true, flutter: true}}, {active: true}]) {
    await assert.rejects(check(input(extra)), reason("INVALID_REVIEW_TARGET"));
  }
});

for (const code of ["RELEASE_AUTHORIZATION_UNVERIFIED", "ELIGIBILITY_WRITER_COVERAGE_UNVERIFIED",
  "AFFECTED_INVENTORY_UNVERIFIED", "PUBLICATION_WITHDRAWAL_UNAVAILABLE", "BOOKING_COMPATIBILITY_UNVERIFIED",
  "CUSTOMER_WEB_COMPATIBILITY_UNVERIFIED", "FLUTTER_COMPATIBILITY_UNVERIFIED",
  "INDEX_QUERY_READINESS_UNVERIFIED", "GENERATION_COORDINATION_UNAVAILABLE", "DEPLOYMENT_SECURITY_GATES_UNVERIFIED"]) {
  test(`missing safeguard always blocks: ${code}`, async () => {
    store.set("contractPolicies/providerPackageV2", {ready: true, releaseApprovalId: "made_up"});
    store.set("occasionReleaseApprovals/made_up", {approved: true, allChecksPassed: true});
    blocked(await check(), code);
  });
}

test("missing malformed unstable and overflowing catalog generations block", async () => {
  for (const catalog of [undefined, {}, {revision: 0}, {revision: "3"},
    {revision: Number.MAX_SAFE_INTEGER, activationState: "stable"}, {revision: 3, activationState: "preparing"}]) {
    store.set("occasionCatalog/current", catalog); blocked(await check(), "STABLE_CATALOG");
  }
});

test("missing rejected malformed and already-active occasions cannot authorize activation", async () => {
  const valid = store.get("occasions/birthday");
  for (const patch of [undefined, {...valid, id: "different"}, {...valid, moderationState: "rejected"}]) {
    store.set("occasions/birthday", patch); blocked(await check(), "APPROVED_OCCASION");
  }
  store.set("occasions/birthday", {...valid, active: true});
  blocked(await check(), "OCCASION_STATE"); await assert.rejects(prepare(), reason("OCCASION_STATE_CONFLICT"));
});

test("invalid category mappings block, including missing duplicate add-on type corruption", async () => {
  const valid = store.get("occasions/birthday");
  for (const codes of [[], ["missing"], ["catering_service", "catering_service"], ["bad/code"], null]) {
    store.set("occasions/birthday", {...valid, applicableServiceCategoryCodes: codes});
    blocked(await check(), "ACTIVE_CATEGORY_MAPPINGS");
  }
  store.set("occasions/birthday", valid);
  for (const patch of [{status: "discontinued"}, {serviceType: "invalid"}, {code: "wrong"}]) {
    store.set("serviceCategories/catering_service", {code: "catering_service", status: "active", serviceType: "catering", ...patch});
    blocked(await check(), "ACTIVE_CATEGORY_MAPPINGS");
  }
});

test("request revisions are strict and conflicts are explicit", async () => {
  for (const value of [0, -1, 1.5, "2", null]) {
    await assert.rejects(check(input({expectedOccasionRevision: value})));
    await assert.rejects(check(input({expectedCatalogRevision: value})));
  }
  blocked(await check(input({expectedOccasionRevision: 1})), "OCCASION_REVISION");
  blocked(await check(input({expectedCatalogRevision: 1})), "CATALOG_REVISION");
  await assert.rejects(prepare(transitionInput({expectedRevision: 1})), reason("REVISION_CONFLICT"));
  await assert.rejects(prepare(transitionInput({expectedCatalogRevision: 1})), reason("REVISION_CONFLICT"));
  assert.equal(commits.length, 0);
});

test("blocked preparation only creates immutable operation/audit and preserves all business records", async () => {
  const before = structuredClone(store);
  const result = await prepare(); assert.equal(result.state, "blocked");
  for (const [key, value] of before) assert.deepEqual(store.get(key), value, key);
  assert.equal(commits.length, 2);
  assert.ok(commits.every(([key]) => /^(occasionTransitions|occasionTransitionAudits)\//.test(key)));
  const record = store.get(`occasionTransitions/${result.operationId}`);
  assert.deepEqual(record.checkpoint, {stage: "readiness_checked", withdrawalVerified: false,
    catalogCommitted: false, restorationVerified: false});
  assert.equal(record.releaseAuthorizationVerified, false);
  const read = await transitions.getOccasionTransition(request({operationId: result.operationId}));
  assert.deepEqual(read, result); assert.equal(read.requestedReleaseApprovalId, undefined);
});

test("replay preserves operation identity and audit; conflicting payload cannot overwrite", async () => {
  const first = await prepare(); const audit = structuredClone(commits[1]);
  store.get("occasionCatalog/current").revision = 4;
  assert.deepEqual(await prepare(), first); assert.deepEqual(structuredClone(commits[1]), audit);
  await assert.rejects(prepare(transitionInput({reason: "Different valid reason"})), reason("IDEMPOTENCY_CONFLICT"));
  assert.equal(commits.length, 2);
});

test("concurrent identical keys create one blocked identity and one audit", async () => {
  const results = await Promise.all([prepare(), prepare()]);
  assert.deepEqual(results[0], results[1]); assert.equal(commits.length, 2); assert.equal(attempts, 3);
});

test("concurrent distinct requests stay blocked without acquiring lifecycle authority", async () => {
  const before = structuredClone(store.get("occasionCatalog/current"));
  const results = await Promise.all([prepare(), prepare(transitionInput({idempotencyKey: "transition_test_0002"}))]);
  assert.notEqual(results[0].operationId, results[1].operationId);
  assert.ok(results.every((result) => result.state === "blocked"));
  assert.deepEqual(store.get("occasionCatalog/current"), before);
  assert.equal(store.get("occasions/birthday").active, false);
});

test("actor and action scoped identities; deactivation is equally blocked", async () => {
  const first = await prepare();
  store.set("users/admin_two", {...store.get("users/admin")});
  const second = await prepare(transitionInput(), "activate", {auth: {uid: "admin_two", token: {}}});
  assert.notEqual(first.operationId, second.operationId);
  store.get("occasions/birthday").active = true;
  const third = await prepare(transitionInput(), "deactivate");
  assert.notEqual(first.operationId, third.operationId); assert.equal(third.state, "blocked");
  assert.equal(store.get("occasions/birthday").active, true);
});

test("interrupted atomic commit retries without partial audit or business changes", async () => {
  const before = structuredClone(store); failCommit = true;
  await assert.rejects(prepare(), /injected commit failure/); assert.deepEqual(store, before);
  failCommit = false; const result = await prepare();
  assert.equal(result.state, "blocked"); assert.equal(commits.length, 2);
});

test("catalog/category/admin changes during transaction are rechecked on retry", async () => {
  beforeCommit = (attempt) => {if (!attempt) store.get("occasionCatalog/current").revision++;};
  await assert.rejects(prepare(), reason("REVISION_CONFLICT")); assert.equal(commits.length, 0);
  beforeCommit = (attempt) => {if (!attempt) store.get("serviceCategories/catering_service").status = "discontinued";};
  blocked(await check(input({expectedCatalogRevision: 4})), "ACTIVE_CATEGORY_MAPPINGS");
  beforeCommit = (attempt) => {if (!attempt) store.get("users/admin").isBlocked = true;};
  await assert.rejects(prepare(transitionInput({expectedCatalogRevision: 4})), reason("ADMIN_REQUIRED"));
});

test("unrecognized interrupted stages and corrupted saved results require recovery, never completion", async () => {
  const result = await prepare(); const record = store.get(`occasionTransitions/${result.operationId}`);
  for (const state of ["preparing", "withdrawn", "committed", "rebuilding", "completed"]) {
    record.state = state;
    await assert.rejects(prepare(), reason("TRANSITION_RECOVERY_REQUIRED"));
    await assert.rejects(transitions.getOccasionTransition(request({operationId: result.operationId})), reason("TRANSITION_RECOVERY_REQUIRED"));
  }
  record.state = "blocked"; record.result.action = "invented";
  await assert.rejects(prepare(), reason("TRANSITION_RECOVERY_REQUIRED")); assert.equal(commits.length, 2);
});

test("entry point exposes only the new read; private transition/audit collections default deny", () => {
  const source = (file) => fs.readFileSync(path.resolve(__dirname, file), "utf8");
  const index = source("../src/index.ts");
  assert.match(index, /export \{checkAdminOccasionActivationReadiness\}/);
  for (const name of ["activateGlobalOccasion", "deactivateGlobalOccasion", "getOccasionTransition",
    "prepareBlockedOccasionTransition", "updateProviderOccasionCapabilities"]) assert.equal(index.includes(name), false);
  const rules = source("../../firebase/firestore.rules");
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  for (const name of ["occasionTransitions", "occasionTransitionAudits"]) assert.equal(rules.includes(`match /${name}/`), false);
  assert.match(source("../src/admin/occasion-activation-readiness.ts"), /onCall\(\s*appCheckCallableOptions/);
  assert.match(source("../src/packages/setup-gallery-v2-authority.ts"), /WRITER_COVERAGE_VERIFIED: boolean = false/);
});
