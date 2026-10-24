const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const constants = require("../lib/shared/constants.js");
const policy = require("../lib/shared/document-catalog-policy.js");
const {HttpsError} = require("firebase-functions/v2/https");

function fixture(options = {}) {
  const status = options.status ?? "suspended";
  const records = new Map([
    ["providerVerifications/v", {providerId: "p", ownerId: options.wrongOwner ? "other" : "owner", status, suspensionReason: "old"}],
    ["providers/p", {ownerId: "owner", businessName: "Test", description: "Test", address: "Test", city: "Test", province: "Test", verificationStatus: status, businessRegistrationType: "individual", providerServiceType: "catering", serviceCategories: options.venue ? ["venue_provider"] : [], isActive: status === "approved", isSuspended: status === "suspended"}],
    ["users/owner", {role: "provider", providerId: "p", accountStatus: "active", isActive: true, isBlocked: false, ...options.owner}],
    ["packages/public", {providerId: "p", status: "published", isActive: true, isPublished: true}],
    ["packages/draft", {providerId: "p", status: "draft", isActive: true, isPublished: false}],
    ["bookings/b", {status: "confirmed"}], ["payments/b", {amount: 100}], ["refunds/b", {status: "pending"}],
  ]);
  for (const type of ["valid_id", "sanitary_permit", ...(options.venue || options.optionalMayor ? ["mayors_permit"] : [])]) {
    if (type === options.missing) continue;
    records.set(`providerVerifications/v/documents/${type}`, {documentType: type, status: "pending", storagePath: `providers/${options.wrongPath ? "other" : "p"}/verification/${type}/file.pdf`});
  }
  const catalog = policy.initialBusinessDocumentTypes();
  const snapshot = (path) => ({id: path.split("/").at(-1), ref: ref(path), exists: records.has(path), data: () => records.get(path)});
  function ref(path) {
    return {path, doc: (id) => ref(`${path}/${id}`), collection: (name) => ref(`${path}/${name}`),
      where: () => ref(path), limit: () => ref(path), get: async () => {
        if (records.has(path)) return snapshot(path);
        const docs = [...records.keys()].filter((key) => key.startsWith(path + "/") && !key.slice(path.length + 1).includes("/")).map(snapshot);
        return {exists: false, docs, size: docs.length};
      }};
  }
  const audit = [], history = [], notifications = [], completed = new Map();
  const db = {collection: ref, runTransaction: async (callback) => {
    const writes = [];
    const result = await callback({get: (reference) => reference.get(), update: (reference, data) => writes.push([reference.path, data])});
    for (const [path, data] of writes) records.set(path, {...records.get(path), ...data});
    return result;
  }};
  const mocks = {
    "@feasta/shared-types/documents": require("@feasta/shared-types/documents"),
    "firebase-functions/v2/https": {HttpsError, onCall: (_, handler) => handler},
    "firebase-admin/storage": {getStorage: () => ({bucket: () => ({file: () => ({getMetadata: async () => [{contentType: options.invalidStorage ? "text/plain" : "application/pdf", size: 100}]})})})},
    "firebase-admin/auth": {getAuth: () => ({getUser: async () => ({uid: "owner", disabled: options.disabled})})},
    "../shared/constants.js": constants,
    "../shared/document-catalog.js": {...policy, loadBusinessDocumentCatalog: async () => catalog},
    "../shared/firestore.js": {db},
    "../shared/auth.js": {requireAuth: () => ({uid: "admin"})},
    "../shared/authorization.js": {requireRole: async () => {}},
    "../shared/validation.js": require("../lib/shared/validation.js"),
    "../shared/function-options.js": {appCheckCallableOptions: {}},
    "../shared/rate-limit.js": {enforceCallableRateLimit: async () => {}},
    "../shared/provider-identity-prerequisites.js": {requireTrustedProviderIdentity: async (auth) => {if (auth.disabled) throw new HttpsError("failed-precondition", "disabled");}},
    "../shared/timestamps.js": {serverTimestamp: () => "now"},
    "../shared/audit.js": {writeAuditLogInTransaction: (_, data) => {audit.push(data); return {id: "audit"};}},
    "../shared/verification-history.js": {writeVerificationHistoryInTransaction: (_, data) => history.push(data)},
    "../shared/notifications.js": {createNotificationInTransaction: (_, data) => notifications.push(data)},
    "../shared/logger.js": {logInfo() {}, logError() {}},
    "../shared/security-events.js": {logSecurityEvent() {}},
    "../shared/idempotency.js": {createIdempotencyKey: ({clientKey}) => clientKey, beginIdempotentOperation: async ({key}) => completed.has(key) ? {state: "completed", result: completed.get(key)} : {state: "acquired"}, completeIdempotentOperation: async ({key, result}) => completed.set(key, result), failIdempotentOperation: async () => {}},
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve("../lib/verification/review-provider-verification.js"), "utf8"), {exports, require: (name) => {assert.ok(mocks[name], name); return mocks[name];}});
  return {records, audit, history, notifications, review: (action = "restore", remarks = "Accidental suspension during administrator testing.") => exports.reviewProviderVerification({data: {verificationId: "v", action, remarks, idempotencyKey: action}})};
}

test("restore coordinates canonical state, visibility, history, notification and replay", async () => {
  const f = fixture();
  const before = [...f.records].filter(([key]) => /^(bookings|payments|refunds)\//.test(key));
  await f.review();
  assert.equal(f.records.get("providerVerifications/v").status, "approved");
  assert.equal(f.records.get("providerVerifications/v").suspensionReason, null);
  const provider = f.records.get("providers/p");
  assert.equal(provider.verificationStatus, "approved");
  assert.equal(provider.isActive, true); assert.equal(provider.isSuspended, false);
  for (const field of ["suspendedAt", "suspendedBy", "suspensionReason"]) assert.equal(provider[field], null);
  assert.equal(f.records.get("users/owner").verificationStatus, "verified");
  assert.equal(f.records.get("packages/public").providerPubliclyVisible, true);
  assert.equal(f.records.get("packages/draft").providerPubliclyVisible, false);
  assert.equal(f.audit[0].action, "provider_verification_restored");
  assert.equal(f.history[0].eventType, "verification_restored");
  assert.equal(f.history[0].fromStatus, "suspended"); assert.equal(f.history[0].toStatus, "approved");
  assert.match(f.notifications[0].message, /restored/);
  assert.doesNotMatch(f.notifications[0].message, /approved/);
  assert.equal(f.audit.some((entry) => entry.action === "provider_verification_approved"), false);
  assert.equal(f.history.some((entry) => entry.eventType === "verification_approved"), false);
  assert.equal(f.records.get("providerVerifications/v/documents/sanitary_permit").status, "pending");
  assert.deepEqual([...f.records].filter(([key]) => /^(bookings|payments|refunds)\//.test(key)), before);
  assert.equal((await f.review()).idempotentReplay, true);
  assert.equal(f.audit.length, 1); assert.equal(f.history.length, 1); assert.equal(f.notifications.length, 1);
});

for (const status of ["pending", "draft", "submitted", "under_review", "approved", "rejected", "resubmission_required"]) {
  test(`restore rejects ${status}`, async () => assert.rejects(fixture({status}).review(), {code: "failed-precondition"}));
}
for (const options of [{missing: "sanitary_permit"}, {invalidStorage: true}, {wrongPath: true}, {wrongOwner: true}, {venue: true, missing: "mayors_permit"}, {owner: {isBlocked: true}}, {owner: {isActive: false}}, {owner: {accountStatus: "blocked"}}, {owner: {accountStatus: "disabled"}}, {disabled: true}]) {
  test(`restore fails closed: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options); await assert.rejects(f.review(), {code: "failed-precondition"});
    assert.equal(f.records.get("providers/p").verificationStatus, "suspended");
    assert.equal(f.audit.length, 0);
  });
}
test("venue restoration succeeds with required permit", async () => {await fixture({venue: true}).review();});
test("pending optional Mayor's permit is preserved and does not block catering restoration", async () => {
  const f = fixture({optionalMayor: true}); await f.review();
  assert.equal(f.records.get("providerVerifications/v/documents/mayors_permit").status, "pending");
});
test("restore requires meaningful reason", async () => assert.rejects(fixture().review("restore", "short"), {code: "invalid-argument"}));
test("approved provider can be suspended and restored without changing owner account controls", async () => {
  const f = fixture({status: "approved"});
  const owner = {...f.records.get("users/owner")};
  assert.equal(f.records.get("providers/p").isActive, true);
  await f.review("suspend");
  assert.equal(f.records.get("providers/p").isActive, false);
  assert.equal(f.records.get("providers/p").isSuspended, true);
  for (const field of ["isActive", "isBlocked", "accountStatus"]) {
    assert.equal(f.records.get("users/owner")[field], owner[field]);
  }
  await f.review("restore");
  assert.equal(f.records.get("providers/p").isActive, true);
  assert.equal(f.records.get("providers/p").isSuspended, false);
  assert.equal(f.audit[1].action, "provider_verification_restored");
  assert.equal(f.history[1].eventType, "verification_restored");
  assert.equal(f.history[1].fromStatus, "suspended");
  assert.equal(f.history[1].toStatus, "approved");
  assert.match(f.notifications[1].title, /Restored/);
  assert.doesNotMatch(f.notifications[1].message, /approved/);
});
test("existing approve, suspend, reject and resubmission transitions remain supported", async () => {
  for (const [status, action, expected] of [["under_review", "approve", "approved"], ["approved", "suspend", "suspended"], ["under_review", "reject", "rejected"], ["under_review", "require_resubmission", "resubmission_required"]]) {
    const f = fixture({status}); await f.review(action); assert.equal(f.records.get("providerVerifications/v").status, expected);
  }
  assert.equal(constants.isProviderVerificationTransitionAllowed("suspended", "approved"), false);
  assert.equal(constants.isProviderVerificationTransitionAllowed("suspended", "approved", "restore"), true);
});
