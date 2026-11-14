const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {editorDraftUploadPlanV1} = require("../lib/packages/editor-draft-upload-plan-v1.js");

const scope = {ownerUid: "owner", providerId: "provider", editorDraftId: "draft",
  assetId: "server_asset", kind: "package", themeId: null};
const input = {editorDraftId: "draft", expectedRevision: 3, kind: "package", themeId: null};
class HttpsError extends Error {
  constructor(code, reason) { super(reason); this.code = code; }
}
function fixture(options = {}) {
  const calls = {sign: 0, writes: [], rate: 0};
  const ref = (name) => ({name, id: name.split("/").at(-1),
    doc: (id = "server_asset") => ref(`${name}/${id}`),
    collection: (id) => ref(`${name}/${id}`), where: () => ref(name), limit: () => ref(name)});
  const deps = {
    "./editor-draft-upload-plan-v1.js": {editorDraftUploadPlanV1},
    "firebase-admin/firestore": {Timestamp: {now: () => 1}},
    "firebase-functions/v2/https": {HttpsError, onCall: (_, handler) => handler},
    "../shared/auth.js": {requireAuth: (r) => {
      if (!r.auth) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
      return r.auth;
    }},
    "../shared/authorization.js": {requireRole: async () => {
      if (options.wrongRole) throw new HttpsError("permission-denied", "ROLE");
    }},
    "../shared/constants.js": {USER_ROLES: {provider: "provider"}},
    "../shared/function-options.js": {appCheckCallableOptions: {}},
    "../shared/rate-limit.js": {enforceCallableRateLimit: async () => {
      calls.rate++;
      if (options.rateLimited) throw new HttpsError("resource-exhausted", "RATE");
    }},
    "../shared/maintenance.js": {requireMaintenanceOpen: async () => {
      if (options.maintenance) throw new Error("MAINTENANCE");
    }},
    "../shared/cloudinary.js": {cloudinarySecrets: [],
      createEditorDraftUploadSignatureV1: (s) => {
        calls.sign++;
        if (options.signFailure) throw new Error("SIGN_FAILURE");
        return {parameters: editorDraftUploadPlanV1(s, 100), signature: "test"};
      }},
    "./provider-editor-draft-media-registration-v1.js": {
      assertRegistrationAccess: async (_, data) => {
        assert.equal(data.actorUid, "owner");
        assert.equal(data.assetId, "server_asset");
        if (options.accessFailure) throw new Error(options.accessFailure);
        return "provider";
      }},
    "../shared/firestore.js": {db: {collection: ref, doc: ref,
      runTransaction: async (fn) => fn({
        get: async (r) => {
          if (r.name.startsWith("contractPolicies/")) return {data: () => ({
            featureGates: {packageEditorMediaWrites: options.enabled === true}})};
          if (r.name.endsWith("mediaUploadReservations")) return {size: options.count || 0};
          return {data: () => ({mediaLifecycleVersion: 1, progress: {themes: [{editorThemeId: "garden"}]}})};
        },
        update: () => {},
        create: (r, data) => calls.writes.push({path: r.name, data}),
      })}},
  };
  const module = {exports: {}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,
    "../lib/packages/provider-editor-draft-upload-v1.js"), "utf8"), {
    module, exports: module.exports, require: (id) => {
      assert.ok(Object.hasOwn(deps, id), id); return deps[id];
    }, Object, Array, Number, Reflect,
  });
  const run = (data = input, extra = {}) => module.exports.prepareProviderEditorDraftUploadV1({
    auth: {uid: "owner"}, app: {appId: "trusted"}, data, ...extra,
  });
  return {run, calls, parse: module.exports.parseEditorDraftUploadRequestV1};
}

test("draft upload plan signs exact immutable path and formats", () => {
  assert.deepEqual(editorDraftUploadPlanV1(scope, 100), {
    public_id: "feasta/providers/owner/editor-drafts/draft/package/server_asset",
    timestamp: 100, overwrite: false, allowed_formats: "jpg,jpeg,png,webp",
  });
  assert.match(editorDraftUploadPlanV1({...scope, kind: "theme", themeId: "garden"}, 100)
    .public_id, /themes\/garden\/server_asset$/);
});
for (const change of [{ownerUid: "../owner"}, {providerId: ""},
  {editorDraftId: "../draft"}, {assetId: "a/b"}, {kind: "video"},
  {themeId: "unexpected"}, {kind: "theme", themeId: null}]) {
  test(`invalid signing scope ${JSON.stringify(change)}`, () => {
    assert.throws(() => editorDraftUploadPlanV1({...scope, ...change}, 100));
  });
}
test("reserves server identity and then signs without overwrites", async () => {
  const f = fixture({enabled: true});
  const result = await f.run();
  assert.equal(f.calls.writes.length, 1);
  assert.equal(f.calls.writes[0].data.ownerUid, "owner");
  assert.equal(f.calls.writes[0].data.providerId, "provider");
  assert.equal(f.calls.writes[0].data.draftRevision, 3);
  assert.equal(result.assetId, "server_asset");
  assert.equal(result.parameters.overwrite, false);
});
for (const [name, options, extra] of [
  ["auth", {}, {auth: null}], ["App Check", {}, {app: null}],
  ["role", {wrongRole: true}], ["rate limit", {rateLimited: true}],
  ["default gate", {}], ["wrong owner", {accessFailure: "RESOURCE_NOT_FOUND"}],
  ["stale revision", {accessFailure: "REVISION_CONFLICT"}],
  ["completed draft", {accessFailure: "RESOURCE_NOT_FOUND"}],
  ["outstanding reservation bound", {enabled: true, count: 56}],
  ["maintenance", {enabled: true, maintenance: true}],
]) {
  test(`refuses ${name} before signature or reservation`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run(input, extra));
    assert.equal(f.calls.sign, 0);
    assert.equal(f.calls.writes.length, 0);
  });
}
for (const field of ["ownerUid", "providerId", "assetId", "url", "publicId", "overwrite"]) {
  test(`rejects client ${field} authority`, async () => {
    const f = fixture({enabled: true});
    await assert.rejects(f.run({...input, [field]: "forged"}));
    assert.equal(f.calls.sign, 0);
  });
}
test("theme must already belong to saved draft", async () => {
  const f = fixture({enabled: true});
  await assert.rejects(f.run({...input, kind: "theme", themeId: "foreign"}));
  assert.equal(f.calls.sign, 0);
  const result = await f.run({...input, kind: "theme", themeId: "garden"});
  assert.match(result.parameters.public_id, /themes\/garden\//);
});
test("signing interruption retains reservation rather than falsely reporting success", async () => {
  const f = fixture({enabled: true, signFailure: true});
  await assert.rejects(f.run(), /SIGN_FAILURE/);
  assert.equal(f.calls.writes.length, 1);
});
test("candidate upload callable remains absent from deployment exports", () => {
  const index = fs.readFileSync(path.resolve(__dirname, "../src/index.ts"), "utf8");
  assert.doesNotMatch(index, /provider-editor-draft-upload-v1|prepareProviderEditorDraftUploadV1/);
});
