"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node CommonJS transaction harness. */

/** Offline simulation of the unexported B2B writer. The two production gates
 * remain false on disk. They are enabled in memory only in this test VM.
 * No Firebase, emulator, Cloudinary or network connection is made. */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const writerPath = path.resolve(__dirname, "../../src/lib/provider/provider-setup-gallery-v2-writer.ts");
const source = fs.readFileSync(writerPath, "utf8");
const FLAGS = [
  "PRIVATE_V2_WRITER_COVERAGE_VERIFIED = false",
  "MIXED_GALLERY_PUBLIC_V1_COMPATIBILITY_VERIFIED = false",
];
for (const flag of FLAGS) assert.equal(source.split(flag).length, 2, `Expected exactly one disabled gate: ${flag}`);

function fixture(changes = {}, enabled = true) {
  const state = {
    writes: [], reads: [], authenticated: 0, startedTransactions: 0,
    provider: {ownerId: "owner", verificationStatus: "approved", isActive: true,
      providerServiceType: "catering", serviceCategories: ["catering"]},
    user: {role: "provider", providerId: "provider_id", accountStatus: "active",
      isActive: true, isBlocked: false},
    gallery: {revision: 7, setups: []},
    eligibility: {revision: 3, approvedCategoryCodes: ["catering"],
      approvedOccasionIds: ["occasion_one"]},
    catalog: {revision: 4, activationState: "stable"},
    policy: {revision: 1, effectiveEnvironment: "feasta-catering-system",
      validFromMillis: Date.now() - 10000, validUntilMillis: Date.now() + 600000,
      privateWrites: true, publicReads: true, maxSpecificOccasions: 10,
      maxApplicableOccasions: 100, maxCatalogRecords: 200, pageSize: 100,
      maxPages: 2, requireCurrentRevisions: true, requireValidEligibility: true},
    category: {code: "catering", status: "active", serviceType: "catering"},
    occasions: [{id: "occasion_one", data: {id: "occasion_one", revision: 1,
      moderationState: "approved", active: true, sortOrder: 1,
      applicableServiceCategoryCodes: ["catering"],
      setupGalleryLegacyEventType: "wedding"}}],
    ...changes,
  };
  const ref = (key, id) => ({kind: "document", key, id,
    get: async () => snapshot(key),
    collection: (name) => collection(`${key}/${name}`)});
  const collection = (name) => ({
    doc: (id) => ref(`${name}/${id}`, id),
    orderBy: () => query(name),
  });
  const query = (name, after = null, pageSize = 500) => ({
    kind: "query", name, after, pageSize,
    limit: (size) => query(name, after, size),
    startAfter: (cursor) => query(name, cursor, pageSize),
  });
  const snapshot = (key) => {
    let value;
    switch (key) {
      case "users/owner": value = state.user; break;
      case "providers/provider_id": value = state.provider; break;
      case "providers/provider_id/catalog/setups": value = state.gallery; break;
      case "providerEligibilityAuthorities/provider_id": value = state.eligibility; break;
      case "occasionCatalog/current": value = state.catalog; break;
      case "contractPolicies/setupGalleryV2": value = state.policy; break;
      case "serviceCategories/catering": value = state.category; break;
      default: throw Error(`Unexpected Firestore path: ${key}`);
    }
    return {exists: value !== undefined && value !== null,
      data: () => value};
  };
  function transactionAttempt() {
  const pending = [];
  const readValues = new Map();
  const readValue = (target) => target.kind === "query" ? state.occasions : snapshot(target.key).data();
  const tx = {
    get: async (target) => {
      assert.equal(pending.length, 0, "All transaction reads must precede writes");
      readValues.set(target, JSON.stringify(readValue(target)));
      state.reads.push(target.kind === "query" ? `query:${target.name}` : target.key);
      if (target.kind === "query") {
        assert.equal(target.name, "occasions");
        const docs = state.occasions.filter((row) =>
          target.after === null || row.id > target.after)
          .slice(0, target.pageSize)
          .map((row) => ({id: row.id, data: () => row.data}));
        return {empty: docs.length === 0, docs};
      }
      return snapshot(target.key);
    },
    set: (target, value) => {pending.push({path: target.key, value});},
  };
  return {tx, pending, readValues, readValue};
  }
  const db = {
    collection,
    doc: (key) => ref(key, key.slice(key.lastIndexOf("/") + 1)),
    runTransaction: async (callback) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        state.startedTransactions++;
        const {tx, pending, readValues, readValue} = transactionAttempt();
        const result = await callback(tx);
        if (state.beforeCommit) await state.beforeCommit(state, attempt);
        if ([...readValues].some(([target, value]) => JSON.stringify(readValue(target)) !== value)) continue;
        state.writes.push(...pending);
        if (pending.length) state.gallery = pending[0].value;
        return result;
      }
      throw Error("Retry budget exhausted");
    },
  };
  const mocks = {
    "server-only": {},
    "firebase-admin/firestore": {
      FieldPath: {documentId: () => "__name__"},
      FieldValue: {serverTimestamp: () => "SERVER_TIMESTAMP"},
    },
    "@/lib/firebase/admin": {adminDb: db},
    "@/lib/auth/session": {requireApprovedProvider: async () => {
      state.authenticated++;
      return {uid: "owner", provider: {id: "provider_id",
        providerServiceType: "catering", serviceCategories: ["catering"]}};
    }},
    "@/lib/customer/providers/provider-normalization": {
      isPublicProviderRecord: () => true,
    },
    "./provider-content-capabilities": {
      providerContentCapabilities: (type, categories) => ({
        catering: type === "catering" && categories.includes("catering"),
      }),
    },
    "./catalog-media": {CATALOG_IMAGE_BYTES: 10000000},
    "./provider-menu": {menuAssetPublicId: () => "safe_image"},
    "./provider-setup-gallery": {
      PROVIDER_SETUP_LIMIT: 12,
      parseProviderSetups: (setups) => {
        if (!Array.isArray(setups)) throw Error("Invalid legacy gallery");
        return setups.map((item) => {
          if (!item || typeof item !== "object" || item.setupOccasionSchemaVersion === 2) {
            throw Error("Invalid legacy setup");
          }
          return {...item};
        });
      },
    },
    "./provider-setup-gallery-v2": {
      parsePrivateProviderSetups: (setups) => {
        if (setups === undefined) return [];
        if (!Array.isArray(setups)) throw Error("Malformed stored gallery");
        return setups.map((item) => ({...item}));
      },
      resolveSetupGalleryV2: (entry, _owner, authority) => ({
        ...entry, eventType: "wedding", occasionMatchIds: ["occasion_one"],
        occasionCatalogRevision: authority.catalogRevision,
        providerEligibilityRevision: authority.providerEligibilityRevision,
        occasionEligibilityState: "valid",
      }),
    },
  };
  // Execute the real pure parsers inside the offline adapter simulation.
  for (const name of ["provider-menu", "provider-setup-gallery", "provider-setup-gallery-v2"]) {
    const parserSource = fs.readFileSync(path.resolve(__dirname,
      "../../src/lib/provider", name + ".ts"), "utf8");
    const parserJs = ts.transpileModule(parserSource, {compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    }}).outputText;
    const parserModule = {exports: {}};
    const run = vm.runInNewContext("(function(require,module,exports) {" + parserJs + "\n})", {URL});
    mocks["./catalog-media"].CATALOG_IMAGE_LIMIT = 12;
    run((key) => mocks[key], parserModule, parserModule.exports);
    mocks["./" + name] = parserModule.exports;
  }
  mocks["@/lib/auth/session"].requireProviderCatalogAccess = mocks["@/lib/auth/session"].requireApprovedProvider;
  let text = source;
  if (enabled) {
    for (const flag of FLAGS) {
      text = text.replace(flag, flag.replace(" = false", " = true"));
    }
  }
  const js = ts.transpileModule(text, {compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  }}).outputText;
  const writerModule = {exports: {}};
  const context = {module: writerModule, exports: writerModule.exports, Buffer, AbortSignal,
    process: {env: {GCLOUD_PROJECT: "feasta-catering-system", ...state.env}}, Date,
    fetch: state.fetch || (async () => {throw Error("Unexpected network access");})};
  const wrapper = vm.runInNewContext(`(function(require, module, exports) {${js}\n})`, context,
    {filename: "isolated-provider-setup-gallery-v2-writer.js"});
  wrapper((name) => {
    if (!Object.prototype.hasOwnProperty.call(mocks, name)) {
      throw Error(`Unexpected module import: ${name}`);
    }
    return mocks[name];
  }, writerModule, writerModule.exports);
  const save = writerModule.exports.savePrivateProviderSetupGalleryV2;
  assert.equal(typeof save, "function");
  return {save, load: writerModule.exports.loadPrivateProviderSetupGalleryV2, state};
}

const request = (overrides = {}) => ({
  galleryWriteSchemaVersion: 2, revision: 7, expectedCatalogRevision: 4,
  expectedProviderEligibilityRevision: 3, setups: [], ...overrides,
});

const rejectsWithoutWrites = async (changes, input = request()) => {
  const {save, state} = fixture(changes);
  await assert.rejects(save(input));
  assert.equal(state.writes.length, 0, "Denied request must not write");
  return state;
};

test("production gates remain disabled before any authentication or Firestore read", async () => {
  const {save, state} = fixture({}, false);
  await assert.rejects(save(request()), /disabled/i);
  assert.equal(state.authenticated, 0);
  assert.equal(state.startedTransactions, 0);
  assert.equal(state.writes.length, 0);
});

test("full-gallery transaction succeeds for valid legacy records only in isolated VM", async () => {
  const setup = {id: "setup_a", title: "Wedding", description: "", eventType: "wedding",
    themeTags: [], imageUrls: [], isPublished: false};
  const {save, state} = fixture();
  const result = await save(request({setups: [setup]}));
  assert.equal(result.revision, 8);
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].path, "providers/provider_id/catalog/setups");
  assert.equal(state.writes[0].value.revision, 8);
  assert.equal(state.writes[0].value.setups[0].id, "setup_a");
  assert.ok(state.reads.includes("serviceCategories/catering"));
  assert.ok(state.reads.includes("query:occasions"));
});

test("stale gallery revision rejects without writes", async () => {
  await rejectsWithoutWrites({}, request({revision: 6}));
});

test("stale eligibility revision rejects without writes", async () => {
  await rejectsWithoutWrites({}, request({expectedProviderEligibilityRevision: 2}));
});

test("stale occasion catalog revision rejects without writes", async () => {
  await rejectsWithoutWrites({}, request({expectedCatalogRevision: 3}));
});

test("inactive category rejects without writes", async () => {
  await rejectsWithoutWrites({category: {code: "catering", status: "discontinued", serviceType: "catering"}});
});

test("incomplete catalog pagination rejects without writes", async () => {
  const original = fixture().state;
  await rejectsWithoutWrites({policy: {...original.policy, maxPages: 1}});
});

test("malformed stored gallery rejects without writes", async () => {
  await rejectsWithoutWrites({gallery: {revision: 7, setups: "CORRUPT"}});
});

test("duplicate setup identifiers reject without writes", async () => {
  const s = {id: "same", title: "Wedding", eventType: "wedding",
    description: "", themeTags: [], imageUrls: [], isPublished: false};
  await rejectsWithoutWrites({}, request({setups: [s, s]}));
});

test("V2 proposals use server-derived occasion and eligibility revisions", async () => {
  const proposal = {setupOccasionSchemaVersion: 2, id: "v2_a", title: "Wedding",
    description: "", themeTags: [], imageUrls: [], isPublished: false,
    occasionScope: "specific", occasionIds: ["occasion_one"]};
  const {save, state} = fixture();
  await save(request({setups: [proposal]}));
  assert.equal(state.writes.length, 1);
  const persisted = state.writes[0].value.setups[0];
  assert.equal(persisted.occasionCatalogRevision, 4);
  assert.equal(persisted.providerEligibilityRevision, 3);
  assert.equal(persisted.eventType, "wedding");
});
test("published V2 proposals fail closed without writes", async () => {
  const proposal = {
    setupOccasionSchemaVersion: 2,
    id: "v2_published",
    title: "Wedding",
    description: "",
    themeTags: [],
    imageUrls: [],
    isPublished: true,
    occasionScope: "specific",
    occasionIds: ["occasion_one"],
  };
  await rejectsWithoutWrites({}, request({setups: [proposal]}));
});

test("public V2 publication gate remains disabled on disk", () => {
  assert.match(source, /PRIVATE_V2_PUBLICATION_VERIFIED = false/u);
});

test("private V1-only load returns trusted authority without writes while gates are disabled", async () => {
  const legacy = {id: "setup_v1", title: "Wedding", description: "", eventType: "wedding",
    themeTags: [], imageUrls: [], isPublished: false};
  const {load, state} = fixture({gallery: {revision: 7, setups: [legacy]}}, false);
  const result = await load({galleryWriteSchemaVersion: 2});
  assert.equal(result.setups[0].id, "setup_v1");
  assert.equal(result.revision, 7);
  assert.equal(result.galleryWriteSchemaVersion, 2);
  assert.equal(result.authority.catalogRevision, 4);
  assert.equal(result.authority.providerEligibilityRevision, 3);
  assert.equal(result.availability.canSave, false);
  assert.equal(result.availability.canPublishV2, false);
  assert.equal(state.writes.length, 0);
});

test("private mixed load preserves both record versions", async () => {
  const base = {title: "Wedding", description: "", themeTags: [], imageUrls: [], isPublished: false};
  const setups = [{...base, id: "legacy", eventType: "wedding"},
    {...base, id: "draft", setupOccasionSchemaVersion: 2, eventType: "wedding",
      occasionScope: "specific", occasionIds: ["occasion_one"], occasionMatchIds: ["occasion_one"],
      occasionCatalogRevision: 4, providerEligibilityRevision: 3, occasionEligibilityState: "valid"}];
  const {load, state} = fixture({gallery: {revision: 7, setups}}, false);
  const result = await load({galleryWriteSchemaVersion: 2});
  assert.equal(result.setups.length, 2);
  assert.equal(result.setups[1].setupOccasionSchemaVersion, 2);
  assert.equal(state.writes.length, 0);
});

test("private load rejects client provider identifiers and invalid versions", async () => {
  const {load, state} = fixture({}, false);
  for (const input of [{}, {galleryWriteSchemaVersion: 1}, {galleryWriteSchemaVersion: 2, providerId: "other"}]) {
    await assert.rejects(load(input), /Invalid/);
  }
  assert.equal(state.startedTransactions, 0);
});

test("private load rejects cross-provider ownership and blocked accounts", async () => {
  for (const change of [{provider: {...fixture().state.provider, ownerId: "other"}},
    {provider: {...fixture().state.provider, isBlocked: true}},
    {provider: {...fixture().state.provider, isSuspended: true}},
    {user: {...fixture().state.user, providerId: "other"}}]) {
    const {load, state} = fixture(change, false);
    await assert.rejects(load({galleryWriteSchemaVersion: 2}));
    assert.equal(state.writes.length, 0);
  }
});

test("private load permits review-pending drafts but not saving", async () => {
  const {load} = fixture({provider: {...fixture().state.provider, verificationStatus: "pending"}}, false);
  const result = await load({galleryWriteSchemaVersion: 2});
  assert.equal(result.availability.canSave, false);
});

test("missing authority and malformed gallery fail private load without writes", async () => {
  for (const change of [{eligibility: null}, {catalog: null}, {policy: null},
    {gallery: {revision: 7, setups: "CORRUPT"}}]) {
    const {load, state} = fixture(change, false);
    await assert.rejects(load({galleryWriteSchemaVersion: 2}));
    assert.equal(state.writes.length, 0);
  }
});

test("private draft transaction does not require public reads", async () => {
  const policy = {...fixture().state.policy, publicReads: false};
  const {save, state} = fixture({policy});
  const result = await save(request());
  assert.equal(result.revision, 8);
  assert.equal(result.availability.canPublishV2, false);
  assert.equal(state.writes.length, 1);
});

test("invalid save envelopes reject without writes", async () => {
  for (const input of [request({galleryWriteSchemaVersion: 1}), request({providerId: "other"}),
    request({revision: -1}), request({setups: null})]) await rejectsWithoutWrites({}, input);
});

test("blocked suspended and inactive providers cannot save", async () => {
  for (const fields of [{isBlocked: true}, {isSuspended: true}, {isActive: false}]) {
    await rejectsWithoutWrites({provider: {...fixture().state.provider, ...fields}});
  }
});

test("invalid occasion and forged derived authority reject in the transaction", async () => {
  const proposal = {setupOccasionSchemaVersion: 2, id: "setup_v2", title: "Wedding",
    description: "", themeTags: [], imageUrls: [], isPublished: false,
    occasionScope: "specific", occasionIds: ["occasion_one"]};
  for (const fields of [{occasionIds: ["unknown_occasion"]}, {occasionMatchIds: ["occasion_one"]},
    {occasionScope: "all", occasionIds: ["occasion_one"]}]) {
    await rejectsWithoutWrites({}, request({setups: [{...proposal, ...fields}]}));
  }
  await rejectsWithoutWrites({eligibility: {revision: 3,
    approvedCategoryCodes: ["catering"], approvedOccasionIds: ["different_occasion"]}},
    request({setups: [proposal]}));
});

test("mixed replacement retains V1 and resolves V2 through the real parsers", async () => {
  const legacy = {id: "setup_v1", title: "Wedding", eventType: "wedding", description: "",
    themeTags: [], imageUrls: [], isPublished: false};
  const proposal = {setupOccasionSchemaVersion: 2, id: "setup_v2", title: "Wedding",
    description: "", themeTags: [], imageUrls: [], isPublished: false,
    occasionScope: "all", occasionIds: []};
  const {save, state} = fixture({gallery: {revision: 7, setups: [legacy]}});
  const result = await save(request({setups: [legacy, proposal]}));
  assert.equal(result.setups.length, 2);
  assert.equal(result.setups[0].eventType, "wedding");
  assert.equal(result.setups[1].occasionMatchIds[0], "occasion_one");
  assert.equal(state.writes.length, 1);
});

test("same-revision concurrent saves commit once; loser retries and rejects", async () => {
  const {save, state} = fixture();
  const results = await Promise.allSettled([save(request()), save(request())]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(state.writes.length, 1);
  assert.equal(state.gallery.revision, 8);
  assert.equal(state.startedTransactions, 3);
});

for (const [name, mutate] of [
  ["Admin revocation", (s) => {s.eligibility = {...s.eligibility, revision: 4, approvedOccasionIds: []};}],
  ["category deactivation", (s) => {s.category = {...s.category, status: "discontinued"};}],
  ["provider blocking", (s) => {s.provider = {...s.provider, isBlocked: true};}],
  ["provider deactivation", (s) => {s.provider = {...s.provider, isActive: false};}],
  ["owner blocking", (s) => {s.user = {...s.user, isBlocked: true};}],
  ["catalog mutation", (s) => {s.catalog = {...s.catalog, revision: 5};}],
]) {
  test(`concurrent ${name} discards pending write and revalidates on retry`, async () => {
    const {save, state} = fixture({beforeCommit(s, attempt) {if (attempt === 0) mutate(s);}});
    await assert.rejects(save(request()));
    assert.equal(state.startedTransactions, 2);
    assert.equal(state.writes.length, 0);
  });
}

const imageUrl = (owner = "owner", id = "photo_a") =>
  `https://res.cloudinary.com/test-cloud/image/upload/v1/feasta/providers/${owner}/services/${id}/image.jpg`;
const imageSetup = (urls) => ({id: "setup_a", title: "Wedding", eventType: "wedding",
  description: "", themeTags: [], imageUrls: urls, isPublished: false});
function imageFixture(changes = {}) {
  const calls = [];
  const f = fixture({env: {CLOUDINARY_CLOUD_NAME: "test-cloud", CLOUDINARY_API_KEY: "test-key",
    CLOUDINARY_API_SECRET: "test-secret"}, fetch: async (url) => {
    calls.push(url);
    return {ok: true, json: async () => ({public_id: "feasta/providers/owner/services/photo_a/image",
      secure_url: imageUrl(), resource_type: "image", bytes: 100, format: "jpg"})};
  }, ...changes});
  return {...f, calls};
}

test("real image verifier validates a newly added owned image before commit", async () => {
  const {save, state, calls} = imageFixture();
  await save(request({setups: [imageSetup([imageUrl()])]}));
  assert.equal(calls.length, 1);
  assert.equal(state.writes.length, 1);
  assert.match(calls[0], /^https:\/\/api.cloudinary.com\/v1_1\/test-cloud\/resources\/image\/upload\//);
});

test("another owner and arbitrary URLs fail before network or writes", async () => {
  for (const url of [imageUrl("another_owner"), "https://example.com/image.jpg",
    imageUrl() + "?bypass=true"]) {
    const {save, state, calls} = imageFixture();
    await assert.rejects(save(request({setups: [imageSetup([url])]})));
    assert.equal(calls.length, 0);
    assert.equal(state.writes.length, 0);
  }
});

test("malformed image metadata and failed verification never commit", async () => {
  for (const metadata of [null, {}, {bytes: -1}, {public_id: "other"},
    {secure_url: imageUrl("other")}, {resource_type: "video"}, {bytes: 10000001},
    {bytes: "100"}, {format: "svg"}]) {
    const valid = {public_id: "feasta/providers/owner/services/photo_a/image",
      secure_url: imageUrl(), resource_type: "image", bytes: 100, format: "jpg"};
    const {save, state} = imageFixture({fetch: async () => ({ok: true,
      json: async () => metadata === null ? null : {...valid, ...metadata,
        ...(Object.keys(metadata).length === 0 ? {public_id: undefined} : {})}})});
    await assert.rejects(save(request({setups: [imageSetup([imageUrl()])]})));
    assert.equal(state.writes.length, 0);
  }
  for (const fetch of [async () => ({ok: false}), async () => {throw Error("timeout");}]) {
    const {save, state} = imageFixture({fetch});
    await assert.rejects(save(request({setups: [imageSetup([imageUrl()])]})));
    assert.equal(state.writes.length, 0);
  }
});

test("owned existing V1 photos can reorder without network; replacement is verified", async () => {
  const original = imageSetup([imageUrl(), imageUrl("owner", "photo_b")]);
  const {save, calls} = imageFixture({gallery: {revision: 7, setups: [original]}});
  await save(request({setups: [imageSetup([...original.imageUrls].reverse())]}));
  assert.equal(calls.length, 0);
  const replacement = imageFixture({gallery: {revision: 7,
    setups: [imageSetup([imageUrl("owner", "photo_b")])]}});
  await replacement.save(request({setups: [imageSetup([imageUrl()])]}));
  assert.equal(replacement.calls.length, 1);
});

test("photo removed after preflight cannot be reintroduced without verification", async () => {
  const {save, state} = fixture({gallery: {revision: 7, setups: [imageSetup([imageUrl()])]},
    beforeCommit(s, attempt) {
      if (attempt === 0) s.gallery = {revision: 7, setups: []};
    }});
  await assert.rejects(save(request({setups: [imageSetup([imageUrl()])]})), /images changed/);
  assert.equal(state.writes.length, 0);
});

test("missing protected authority and malformed generations reject saves without writes", async () => {
  for (const changes of [{eligibility: null}, {catalog: null}, {policy: null},
    {eligibility: {revision: 3}}, {gallery: {revision: -1, setups: []}},
    {provider: {...fixture().state.provider, isDeleted: true}}]) {
    await rejectsWithoutWrites(changes);
  }
});
