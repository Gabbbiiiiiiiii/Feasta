const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("../node_modules/typescript");

const packages = path.resolve(__dirname, "../src/packages");

function load(file, dependencies = {}) {
  const source = fs.readFileSync(
    path.join(packages, file),
    "utf8",
  );

  const result = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  const errors = (result.diagnostics || []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    throw new Error("TypeScript transpilation failed");
  }

  const module = {exports: {}};

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      process,
      console,
      require(id) {
        if (!Object.hasOwn(dependencies, id)) {
          throw new Error(`Unexpected import: ${id}`);
        }

        return dependencies[id];
      },
    },
    {filename: file},
  );

  return module.exports;
}

const registry = load("editor-draft-media-registry-v1.ts");

class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const owner = {
  ownerUid: "user_1",
  providerId: "provider_1",
  editorDraftId: "draft_1",
};

const publicId =
  "feasta/providers/user_1/editor-drafts/draft_1/package/asset_1";

const proof = {
  cloudinaryAssetId: "immutable_asset", cloudinaryVersion: 123,
  url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.webp`,
  record: {
    assetId: "asset_1",
    ownerUid: owner.ownerUid,
    providerId: owner.providerId,
    editorDraftId: owner.editorDraftId,
    kind: "package",
    themeId: null,
    cloudinaryPublicId: publicId,
    state: "verified",
  },
};

const input = {
  actorUid: owner.ownerUid,
  editorDraftId: owner.editorDraftId,
  expectedRevision: 3,
  assetId: "asset_1",
  kind: "package",
  themeId: null,
};

function ref(name) {
  return {
    name,
    doc(id) {
      return ref(`${name}/${id}`);
    },
    collection(id) {
      return ref(`${name}/${id}`);
    },
  };
}

function fixture(options = {}) {
  const calls = {
    transactions: 0,
    cloudinary: 0,
    created: [],
    maintenance: 0,
    updated: [],
    pathsRead: [],
  };

  let storedAsset;
  let storedReservation;
  let epoch = 0;
  const db = {
    collection(name) {
      return ref(name);
    },
    doc(name) {
      return ref(name);
    },
    async runTransaction(callback) {
      calls.transactions += 1;
      const transactionNumber = calls.transactions;

      const readEpoch = epoch;
      const writes = [];
      const tx = {
        async get(reference) {
          calls.pathsRead.push(reference.name);

          let data;
          let exists = true;

          switch (reference.name) {
          case "users/user_1":
            data = {
              role: options.wrongRole ? "customer" : "provider",
              providerId: "provider_1",
              accountStatus: "active",
              isActive: true,
              isBlocked: options.blocked || (transactionNumber > 1 && options.blockedAfterProof) || false,
            };
            break;

          case "providers/provider_1":
            data = {providerId: "provider_1"};
            break;

          case "providerPackageEditorDrafts/draft_1":
            data = {
              ownerUid: options.wrongOwner ?
                "other_user" : "user_1",
              providerId: "provider_1",
              editorSchemaVersion: 2,
              state: options.completed || (transactionNumber > 1 && options.discardedAfterProof) ? "completed" : "incomplete",
              packageId: null,
              basePackageRevision: null,
              revision:
                transactionNumber > 1 && options.secondRevision ?
                  options.secondRevision : 3,
            };
            break;

          case "contractPolicies/providerPackageV2":
            data = {
              effectiveEnvironment: "feasta-catering-system",
              revision: 1,
              featureGates: {
                packageEditorProgressWrites: !options.disabled,
              },
            };
            break;

          case "providerPackageEditorDrafts/draft_1/mediaUploadReservations/asset_1":
            data = options.missingReservation ? undefined : {
              ...proof.record, state: options.existing ? "registered" : "reserved",
              cloudinaryAssetId: proof.cloudinaryAssetId, cloudinaryVersion: proof.cloudinaryVersion,
              draftRevision: 3, issuedAtMs: Date.now() - 1000,
              expiresAtMs: Date.now() + 60000, registeredUrl: proof.url,
              ...options.reservation,
              ...(transactionNumber > 1 ? options.secondReservation : {}),
            };
            data = storedReservation || data;
            break;

          case "providerPackageEditorDrafts/draft_1/mediaAssets/asset_1":
            data = storedAsset || options.existing || undefined;
            exists = !!data;
            break;

          default:
            throw new Error(`Unexpected Firestore read: ${reference.name}`);
          }

          return {
            exists,
            data() {
              return data;
            },
          };
        },

        update(reference, data) { writes.push(() => { calls.updated.push({path: reference.name, data}); if(options.persist) storedReservation = {...proof.record, draftRevision:3, issuedAtMs:Date.now()-1000, expiresAtMs:Date.now()+60000, ...data}; }); },
        create(reference, data) {
          writes.push(() => { if(options.persist) storedAsset=data; calls.created.push({
            path: reference.name,
            data,
          }); });
        },
      };

      const result = await callback(tx);
      if(options.persist && writes.length && readEpoch !== epoch) return db.runTransaction(callback);
      for(const write of writes) write();
      if(writes.length) epoch++;
      return result;
    },
  };

  const dependencies = {
    "firebase-admin/firestore": {
      Timestamp: {
        now() {
          return "test_timestamp";
        },
      },
    },
    "firebase-functions/v2/https": {HttpsError},
    "../shared/firestore.js": {db},
    "../shared/account-state.js": require("../lib/shared/account-state.js"),
    "../shared/constants.js": {
      USER_ROLES: {provider: "provider"},
    },
    "../shared/maintenance.js": {
      async requireMaintenanceOpen() {
        calls.maintenance += 1;

        if (options.maintenanceClosed) {
          throw new HttpsError(
            "failed-precondition",
            "MAINTENANCE_CLOSED",
          );
        }
      },
    },
    "../shared/cloudinary.js": {
      async verifyEditorDraftCloudinaryAssetV1(scope) {
        calls.cloudinary += 1;

        if (options.cloudinaryFailure) {
          throw new HttpsError(
            "failed-precondition",
            "EDITOR_DRAFT_MEDIA_VERIFICATION_FAILED",
          );
        }

        assert.equal(scope.ownerUid, owner.ownerUid);
        assert.equal(scope.editorDraftId, owner.editorDraftId);
        assert.equal(scope.assetId, "asset_1");
        if(options.realLookup) {
          const {lookupVerifiedEditorDraftCloudinaryV1}=require('../lib/packages/editor-draft-cloudinary-lookup-v1.js');
          return lookupVerifiedEditorDraftCloudinaryV1(scope,'demo',async()=> {
            if(options.missingResource) throw new Error('not found');
            return {asset_id:'immutable_asset',version:123,public_id:publicId,
              resource_type:'image',type:'upload',format:'webp',bytes:options.invalidResource ? 6000000 : 1024,
              secure_url:proof.url.replace('/v1/','/v123/')};
          });
        }
        return options.proof || proof;
      },
    },
    "./package-domain.js": {
      authorizeProviderForPackageManagement() {
        return {
          providerId: "provider_1",
        };
      },
    },
    "./editor-draft-media-registry-v1.js": registry,
  };

  const service = load(
    "provider-editor-draft-media-registration-v1.ts",
    dependencies,
  );

  return {
    calls,
    register: service.registerEditorDraftMediaV1,
  };
}

process.env.GCLOUD_PROJECT = "feasta-catering-system";

test("creates the verified asset in its private draft", async () => {
  const {calls, register} = fixture();
  const result = await register(input);

  assert.equal(result.action, "create");
  assert.equal(result.state, "verified");
  assert.equal(calls.transactions, 2);
  assert.equal(calls.cloudinary, 1);
  assert.equal(calls.created.length, 1);

  assert.equal(
    calls.created[0].path,
    "providerPackageEditorDrafts/draft_1/mediaAssets/asset_1",
  );

  assert.equal(calls.created[0].data.ownerUid, "user_1");
  assert.equal(calls.created[0].data.providerId, "provider_1");
  assert.equal(calls.created[0].data.createdAt, "test_timestamp");
});

test("accepts an identical registration without another write", async () => {
  const {calls, register} = fixture({
    existing: {...proof.record, url: proof.url},
  });

  const result = await register(input);

  assert.equal(result.action, "unchanged");
  assert.equal(calls.created.length, 0);
});

test("rejects unauthorized provider before Cloudinary lookup", async () => {
  const {calls, register} = fixture({wrongRole: true});

  await assert.rejects(
    register(input),
    (error) => error.message === "PROVIDER_NOT_APPROVED",
  );

  assert.equal(calls.cloudinary, 0);
  assert.equal(calls.created.length, 0);
});

test("rejects another draft owner before Cloudinary lookup", async () => {
  const {calls, register} = fixture({wrongOwner: true});

  await assert.rejects(
    register(input),
    (error) => error.message === "RESOURCE_NOT_FOUND",
  );

  assert.equal(calls.cloudinary, 0);
  assert.equal(calls.created.length, 0);
});

test("rejects stale expected revision", async () => {
  const {calls, register} = fixture();

  await assert.rejects(
    register({...input, expectedRevision: 2}),
    (error) => error.message === "REVISION_CONFLICT",
  );

  assert.equal(calls.cloudinary, 0);
  assert.equal(calls.created.length, 0);
});

test("rejects revision changed after Cloudinary verification", async () => {
  const {calls, register} = fixture({secondRevision: 4});

  await assert.rejects(
    register(input),
    (error) => error.message === "REVISION_CONFLICT",
  );

  assert.equal(calls.cloudinary, 1);
  assert.equal(calls.created.length, 0);
});

test("does not register an asset when Cloudinary verification fails", async () => {
  const {calls, register} = fixture({cloudinaryFailure: true});

  await assert.rejects(
    register(input),
    (error) =>
      error.message === "EDITOR_DRAFT_MEDIA_VERIFICATION_FAILED",
  );

  assert.equal(calls.created.length, 0);
});

test("rejects registration while maintenance is closed", async () => {
  const {calls, register} = fixture({maintenanceClosed: true});

  await assert.rejects(
    register(input),
    (error) => error.message === "MAINTENANCE_CLOSED",
  );

  assert.equal(calls.created.length, 0);
});

test("rejects a conflicting existing asset record", async () => {
  const {calls, register} = fixture({
    existing: {
      ...proof.record,
      url: proof.url.replace("/v1/", "/v2/"),
    },
  });

  await assert.rejects(register(input));

  assert.equal(calls.created.length, 0);
});

test("rejects registration when feature gate is disabled", async () => {
  const {calls, register} = fixture({disabled: true});

  await assert.rejects(
    register(input),
    (error) => error.message === "FEATURE_DISABLED",
  );

  assert.equal(calls.cloudinary, 0);
  assert.equal(calls.created.length, 0);
});

test("blocked actor cannot trigger Cloudinary verification", async () => {
 const {calls, register}=fixture({blocked:true});
 await assert.rejects(register(input),error=>error.code==="permission-denied"&&error.details.reason==="ACCOUNT_ACCESS_DENIED");
 assert.equal(calls.cloudinary,0);assert.equal(calls.created.length,0);
});
test("account blocked after proof cannot register the asset", async () => {
 const {calls, register}=fixture({blockedAfterProof:true});
 await assert.rejects(register(input),error=>error.code==="permission-denied"&&error.details.reason==="ACCOUNT_ACCESS_DENIED");
 assert.equal(calls.cloudinary,1);assert.equal(calls.created.length,0);
});

for (const [name, options] of [
  ["missing reservation", {missingReservation:true}],
  ...Object.entries({ownerUid:"other",providerId:"other",editorDraftId:"other",
    assetId:"other",kind:"theme",themeId:"other",cloudinaryPublicId:"other",
    state:"revoked",draftRevision:2,expiresAtMs:Date.now()-1})
    .map(([key,value])=>[key,{reservation:{[key]:value}}]),
  ["consumed without registry", {reservation:{state:"registered"}}],
  ["revoked during lookup", {secondReservation:{state:"revoked"}}],
  ["discard during lookup", {discardedAfterProof:true}],
  ["conflicting proof", {proof:{...proof,record:{...proof.record,assetId:"other"}}}],
]) {
  test('reservation binding rejects '+name+' without writes', async()=>{
    const f=fixture(options);
    await assert.rejects(f.register(input));
    assert.equal(f.calls.created.length,0);
    assert.equal(f.calls.updated.length,0);
  });
}
test('registration atomically consumes its reservation', async()=>{
  const f=fixture(); await f.register(input);
  assert.equal(f.calls.updated.length,1);
  assert.equal(f.calls.updated[0].data.state,'registered');
});

test('concurrent registration retries commit one immutable asset and replay once', async()=>{
 const f=fixture({persist:true});
 const results=await Promise.all([f.register(input),f.register(input)]);
 assert.deepEqual(results.map(r=>r.action).sort(),['create','unchanged']);
 assert.equal(f.calls.created.length,1);assert.equal(f.calls.updated.length,1);
});
test('changed Cloudinary immutable identity cannot replay a consumed reservation', async()=>{
 const f=fixture({existing:{...proof.record,url:proof.url},proof:{...proof,cloudinaryAssetId:'replacement'}});
 await assert.rejects(f.register(input));assert.equal(f.calls.created.length,0);assert.equal(f.calls.updated.length,0);
});

for(const options of [{realLookup:true,missingResource:true},{realLookup:true,invalidResource:true}]) {
 test('actual Cloudinary proof rejection leaves Firestore untouched '+JSON.stringify(options),async()=>{
  const f=fixture(options);await assert.rejects(f.register(input));
  assert.equal(f.calls.created.length,0);assert.equal(f.calls.updated.length,0);
 });
}
test('trusted lookup and proof feed the real reservation registration transaction',async()=>{
 const f=fixture({realLookup:true});const result=await f.register(input);
 assert.equal(result.state,'verified');assert.equal(f.calls.created[0].data.cloudinaryVersion,123);
 assert.equal(f.calls.updated[0].data.cloudinaryAssetId,'immutable_asset');
});

test('expired consumed reservation permits only identical verified replay',async()=>{
 const f=fixture({existing:{...proof.record,url:proof.url},reservation:{issuedAtMs:Date.now()-60000,expiresAtMs:Date.now()-1000}});
 const result=await f.register(input);assert.equal(result.action,'unchanged');
 assert.equal(f.calls.created.length,0);assert.equal(f.calls.updated.length,0);
});
