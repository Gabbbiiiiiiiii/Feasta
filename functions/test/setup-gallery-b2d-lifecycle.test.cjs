"use strict";

// Offline execution of the real callable bodies and their pure policy helpers.
// Firebase/Auth/App Check services are mocked; this is not rules execution.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src");

function fixture(overrides = {}) {
  const docs = new Map(Object.entries({
    "users/admin": {role: "admin", accountStatus: "active", isActive: true, isBlocked: false},
    "users/owner": {role: "provider", providerId: "provider", accountStatus: "active",
      isActive: true, isBlocked: false},
    "providers/provider": {ownerId: "owner", verificationStatus: "approved", isActive: true,
      providerServiceType: "both", serviceCategories: ["catering", "decorations"],
      eventTypesSupported: ["wedding"]},
    "providerEligibilityAuthorities/provider": {revision: 3, approvedOccasionIds: [],
      approvedCategoryCodes: []},
    "occasionCatalog/current": {revision: 4, activationState: "stable"},
    "occasions/occasion_one": {id: "occasion_one", revision: 1, active: true,
      moderationState: "approved", sortOrder: 1, applicableServiceCategoryCodes: ["catering"]},
    "occasions/occasion_two": {id: "occasion_two", revision: 1, active: true,
      moderationState: "approved", sortOrder: 2, applicableServiceCategoryCodes: ["decorations"]},
    "serviceCategories/catering": {code: "catering", name: "Catering", serviceType: "catering",
      status: "active"},
    "serviceCategories/decorations": {code: "decorations", name: "Decorations", serviceType: "addon",
      status: "active"},
    ...overrides,
  }).filter(([, v]) => v !== undefined));
  const state = {docs, commits: [], attempts: 0};
  const snap = (key) => {
    const value = structuredClone(docs.get(key));
    return {id: key.split("/").at(-1), exists: value !== undefined, data: () => value};
  };
  const ref = (key) => ({key, id: key.split("/").at(-1),
    get: async () => snap(key), collection: (name) => collection(`${key}/${name}`)});
  const query = (name, filters = [], max = Infinity) => ({name, filters, max,
    where: (...f) => query(name, [...filters, f], max), limit: (n) => query(name, filters, n)});
  const collection = (name) => ({...query(name), doc: (id) => ref(`${name}/${id}`)});
  const read = (target) => {
    if (target.key) return snap(target.key);
    const rows = [...docs].filter(([key, value]) => key.startsWith(target.name + "/") &&
      key.split("/").length === target.name.split("/").length + 1 &&
      target.filters.every(([field, op, expected]) => op === "==" ? value[field] === expected :
        Array.isArray(value[field]) && value[field].includes(expected)))
      .sort(([a], [b]) => a.localeCompare(b)).slice(0, target.max).map(([key]) => snap(key));
    return {docs: rows, size: rows.length, empty: !rows.length};
  };
  const signature = (target) => {
    const s = read(target);
    return JSON.stringify(target.key ? s.data() : s.docs.map((d) => [d.id, d.data()]));
  };
  const db = {collection, runTransaction: async (callback) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      state.attempts++;
      const reads = new Map();
      const pending = [];
      const tx = {get: async (target) => {
        assert.equal(pending.length, 0, "read after write");
        reads.set(target, signature(target));
        return read(target);
      }, getAll: async (...refs) => Promise.all(refs.map((r) => tx.get(r))),
      update: (r, value) => pending.push(["update", r.key, value]),
      create: (r, value) => pending.push(["create", r.key, value]),
      delete: (r) => pending.push(["delete", r.key])};
      const result = await callback(tx);
      if (state.beforeCommit) await state.beforeCommit(attempt);
      if ([...reads].some(([r, sig]) => signature(r) !== sig)) continue;
      for (const [kind, key, value] of pending) {
        if (kind === "delete") docs.delete(key);
        else if (kind === "update") {
          assert.ok(docs.has(key));
          docs.set(key, {...docs.get(key), ...value});
        } else {assert.ok(!docs.has(key)); docs.set(key, value);}
      }
      state.commits.push(...pending);
      return result;
    }
    throw Error("Retry budget exhausted");
  }};
  const mocks = new Map();
  const mock = (name, value) => mocks.set(path.join(root, name), value);
  mock("shared/firestore.ts", {db});
  mock("shared/auth.ts", {requireAuth: (request) => {
    if (!request.auth?.uid) throw Error("AUTH_REQUIRED");
    return {uid: request.auth.uid};
  }});
  mock("shared/authorization.ts", {requireRole: async (uid, roles) => {
    const p = docs.get(`users/${uid}`);
    if (!p || !roles.includes(p.role) || p.isActive !== true || p.isBlocked ||
      p.accountStatus !== "active" || state.authDisabled) throw Error("ADMIN_REQUIRED");
  }});
  mock("shared/function-options.ts", {appCheckCallableOptions: {enforceAppCheck: true}});
  mock("shared/rate-limit.ts", {enforceCallableRateLimit: async () => {}});
  mock("shared/security-events.ts", {correlationIdFromCallable: () => "test-correlation-id"});
  mock("shared/timestamps.ts", {serverTimestamp: () => "SERVER_TIMESTAMP"});
  mock("shared/audit.ts", {writeAuditLogInTransaction: () => {}});
  const cache = new Map();
  function load(file) {
    if (mocks.has(file)) return mocks.get(file);
    if (cache.has(file)) return cache.get(file);
    const module = {exports: {}};
    cache.set(file, module.exports);
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    }}).outputText;
    const run = vm.runInThisContext(`(function(require,module,exports){${js}\n})`);
    run((name) => {
      if (name === "firebase-functions/v2/https") return {
        HttpsError: class extends Error {constructor(code, message) {super(message); this.code = code;}},
        onCall: (options, handler) => {assert.equal(options.enforceAppCheck, true); return handler;},
      };
      if (name === "firebase-admin/firestore") return {Timestamp: {now: () => "NOW"}};
      if (name.startsWith("node:")) return require(name);
      if (name.startsWith("@feasta/shared-types")) return require(name);
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name.replace(/\.js$/, ".ts")));
      throw Error(`Unexpected dependency ${name}`);
    }, module, module.exports);
    cache.set(file, module.exports);
    return module.exports;
  }
  const capability = load(path.join(root, "packages/provider-occasion-capabilities-v2.ts"));
  const category = load(path.join(root, "admin/service-category-management.ts"));
  return {state, capability: capability.updateProviderOccasionCapabilities, category};
}
const input = (changes = {}) => ({providerId: "provider", approveOccasionIds: ["occasion_one"],
  revokeOccasionIds: [], expectedProviderEligibilityRevision: 3, expectedCatalogRevision: 4,
  reason: "Approved after manual verification", idempotencyKey: "capability-request-0001", ...changes});
const request = (data, uid = "admin") => ({auth: uid ? {uid} : undefined,
  app: {appId: "test-app"}, data});

test("capability mutation rejects missing App Check before any grant or audit", async () => {
  const {capability, state} = fixture();
  await assert.rejects(capability({...request(input()), app: undefined}), /APP_CHECK_REQUIRED/);
  assert.equal(state.commits.length, 0);
  assert.deepEqual(state.docs.get("providerEligibilityAuthorities/provider").approvedOccasionIds, []);
});

test("real capability handler grants only catering authority and preserves V1", async () => {
  const {capability, state} = fixture();
  const result = await capability(request(input()));
  assert.equal(result.providerEligibilityRevision, 4);
  assert.deepEqual(Array.from(state.docs.get("providerEligibilityAuthorities/provider").approvedCategoryCodes), ["catering"]);
  assert.deepEqual(state.docs.get("providers/provider").eventTypesSupported, ["wedding"]);
  assert.equal(state.commits.length, 4);
  const audit = state.commits.find(([, key]) => key.startsWith("providerOccasionCapabilityAudits/"));
  assert.equal(audit[2].correlationId, "test-correlation-id");
});

test("same idempotency key replays without another revision; changed payload rejects", async () => {
  const {capability, state} = fixture();
  const a = await capability(request(input()));
  const b = await capability(request(input()));
  assert.deepEqual(a, b);
  assert.equal(state.commits.length, 4);
  await assert.rejects(capability(request(input({reason: "Different approval explanation"}))), /IDEMPOTENCY_CONFLICT/);
});

test("unauthenticated non-admin blocked and Auth-disabled administrators cannot grant", async () => {
  for (const uid of [null, "owner", "admin"]) {
    const {capability, state} = fixture();
    if (uid === "admin") state.docs.get("users/admin").isBlocked = true;
    await assert.rejects(capability(request(input(), uid)));
    assert.equal(state.commits.length, 0);
  }
  const {capability, state} = fixture();
  state.authDisabled = true;
  await assert.rejects(capability(request(input())));
  assert.equal(state.commits.length, 0);
});

test("inactive blocked suspended rejected deleted and unlinked providers cannot obtain grants", async () => {
  for (const change of [{isActive: false}, {isBlocked: true}, {isSuspended: true},
    {isDeleted: true}, {verificationStatus: "rejected"}, {verificationStatus: "pending"}, {ownerId: "other"}]) {
    const {capability, state} = fixture();
    Object.assign(state.docs.get("providers/provider"), change);
    await assert.rejects(capability(request(input())));
    assert.equal(state.commits.length, 0);
  }
});

test("missing malformed stale and unstable authority fails closed", async () => {
  for (const authority of [undefined, {}, {revision: 0}, {revision: 2},
    {revision: 3, approvedOccasionIds: ["bad-id"]}]) {
    const {capability, state} = fixture({"providerEligibilityAuthorities/provider": authority});
    await assert.rejects(capability(request(input())));
    assert.equal(state.commits.length, 0);
  }
  for (const catalog of [undefined, {revision: 3, activationState: "stable"},
    {revision: 4, activationState: "updating"}]) {
    const {capability, state} = fixture({"occasionCatalog/current": catalog});
    await assert.rejects(capability(request(input())));
    assert.equal(state.commits.length, 0);
  }
});

test("inactive rejected and add-on-only occasions cannot be granted", async () => {
  for (const change of [{active: false}, {moderationState: "rejected"},
    {applicableServiceCategoryCodes: ["decorations"]}]) {
    const {capability, state} = fixture();
    Object.assign(state.docs.get("occasions/occasion_one"), change);
    await assert.rejects(capability(request(input())));
    assert.equal(state.commits.length, 0);
  }
});

test("revocation advances protected revision even for a now-blocked provider", async () => {
  const {capability, state} = fixture({"providerEligibilityAuthorities/provider": {
    revision: 3, approvedOccasionIds: ["occasion_one"], approvedCategoryCodes: ["catering"]}});
  state.docs.get("providers/provider").isBlocked = true;
  await capability(request(input({approveOccasionIds: [], revokeOccasionIds: ["occasion_one"]})));
  const authority = state.docs.get("providerEligibilityAuthorities/provider");
  assert.equal(authority.revision, 4);
  assert.equal(authority.approvedOccasionIds.length, 0);
});

test("existing V2 gallery or package fails closed pending coordinated withdrawal", async () => {
  for (const extra of [{"packages/existing": {providerId: "provider"}},
    {"providers/provider/catalog/setups": {setups: [{setupOccasionSchemaVersion: 2}]}}]) {
    const {capability, state} = fixture(extra);
    await assert.rejects(capability(request(input())), /GALLERY_REVALIDATION_REQUIRED/);
    assert.equal(state.commits.length, 0);
  }
});

test("concurrent package or V2 gallery creation fences capability changes on retry", async () => {
  for (const [key, value] of [["packages/concurrent", {providerId: "provider"}],
    ["providers/provider/catalog/setups", {setups: [{setupOccasionSchemaVersion: 2}]}]]) {
    const {capability, state} = fixture();
    state.beforeCommit = (attempt) => {if (!attempt) state.docs.set(key, value);};
    await assert.rejects(capability(request(input())), /GALLERY_REVALIDATION_REQUIRED/);
    assert.equal(state.attempts, 2);
    assert.equal(state.commits.length, 0);
    assert.equal(state.docs.get("providerEligibilityAuthorities/provider").revision, 3);
  }
});

test("concurrent capability requests cannot lose a generation", async () => {
  const {capability, state} = fixture();
  const results = await Promise.allSettled([capability(request(input())), capability(request(input({
    idempotencyKey: "capability-request-0002"})))]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(state.docs.get("providerEligibilityAuthorities/provider").revision, 4);
  assert.equal(state.commits.length, 4);
  assert.equal(state.attempts, 3);
});

test("concurrent identical capability retries commit one operation", async () => {
  const {capability, state} = fixture();
  const [a, b] = await Promise.all([capability(request(input())), capability(request(input()))]);
  assert.deepEqual(a, b);
  assert.equal(state.docs.get("providerEligibilityAuthorities/provider").revision, 4);
  assert.equal(state.commits.length, 4);
});

test("duplicate grant and revoked non-held capability reject without mutation", async () => {
  const {capability, state} = fixture();
  await capability(request(input()));
  await assert.rejects(capability(request(input({expectedProviderEligibilityRevision: 4,
    idempotencyKey: "capability-request-0002"}))), /INVALID_CAPABILITY_CHANGE/);
  await assert.rejects(capability(request(input({expectedProviderEligibilityRevision: 4,
    approveOccasionIds: [], revokeOccasionIds: ["occasion_two"],
    idempotencyKey: "capability-request-0003"}))), /INVALID_CAPABILITY_CHANGE/);
  assert.equal(state.commits.length, 4);
});

test("Admin blocked during a capability transaction cannot commit on retry or replay", async () => {
  const {capability, state} = fixture();
  state.beforeCommit = (attempt) => {
    if (!attempt) state.docs.get("users/admin").isBlocked = true;
  };
  await assert.rejects(capability(request(input())), /ADMIN_REQUIRED/);
  assert.equal(state.commits.length, 0);
  assert.equal(state.attempts, 2);
});

test("category deactivation during capability approval retries and rejects", async () => {
  const {capability, state} = fixture();
  state.beforeCommit = (attempt) => {
    if (!attempt) state.docs.get("serviceCategories/catering").status = "discontinued";
  };
  await assert.rejects(capability(request(input())));
  assert.equal(state.commits.length, 0);
  assert.equal(state.attempts, 2);
});

test("category lifecycle create update deactivate and reactivate uses transaction-safe reads", async () => {
  const {category, state} = fixture();
  const capacityCapabilities = {requiresGuestCapacity: true, usesStaffCapacity: false, usesEquipmentCapacity: false};
  await category.createServiceCategory(request({code: "new_category", name: "New category", serviceType: "catering", capacityCapabilities}));
  await category.updateServiceCategory(request({code: "new_category", name: "Renamed", capacityCapabilities}));
  await category.discontinueServiceCategory(request({code: "new_category"}));
  assert.equal(state.docs.get("serviceCategories/new_category").status, "discontinued");
  await category.reactivateServiceCategory(request({code: "new_category"}));
  assert.equal(state.docs.get("serviceCategories/new_category").status, "active");
});

for (const operation of ["delete", "change type"]) {
  test(`concurrent category usage prevents ${operation} on retry`, async () => {
    const {category, state} = fixture({"serviceCategories/unused": {
      code: "unused", name: "Unused", serviceType: "catering", status: "discontinued"}});
    state.beforeCommit = (attempt) => {
      if (!attempt) state.docs.set("providers/concurrent", {serviceCategories: ["unused"]});
    };
    const call = operation === "delete" ? category.deleteServiceCategory(request({code: "unused"})) :
      category.updateServiceCategory(request({code: "unused", name: "Unused", serviceType: "addon",
        capacityCapabilities: {requiresGuestCapacity: false, usesStaffCapacity: false, usesEquipmentCapacity: true}}));
    await assert.rejects(call, /in use/);
    assert.equal(state.attempts, 2);
    assert.equal(state.commits.length, 0);
    assert.equal(state.docs.get("serviceCategories/unused").serviceType, "catering");
  });
}

test("unused discontinued category can be deleted", async () => {
  const {category, state} = fixture({"serviceCategories/unused": {
    code: "unused", name: "Unused", serviceType: "catering", status: "discontinued"}});
  await category.deleteServiceCategory(request({code: "unused"}));
  assert.equal(state.docs.has("serviceCategories/unused"), false);
});
