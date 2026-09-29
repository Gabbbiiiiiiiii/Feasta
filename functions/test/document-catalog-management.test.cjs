const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {createRequire} = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// Execute the compiled handlers with an in-memory transaction boundary.
// No credentials, emulator, or live Firestore connection is used.
function catalogHarness(initial = {}) {
  const records = structuredClone({
    "documentCategories/agreements": {status: "active"},
    "documentCategories/business_documents": {status: "active"},
    "documentCategories/test": {status: "active", name: "test"},
    ...initial,
  });
  const writes = [];
  const transaction = {
    get: async (ref) => ref.id ? {
      exists: Boolean(records[ref.path]), data: () => records[ref.path],
    } : {
      docs: Object.entries(records)
        .filter(([key]) => key.startsWith(`${ref.path}/`))
        .map(([key, data]) => ({id: key.split("/")[1], ref: {path: key}, data: () => data})),
    },
    create: (ref, data) => { records[ref.path] = data; writes.push(ref.path); },
    update: (ref, data) => {
      records[ref.path] = {...records[ref.path], ...data};
      writes.push(ref.path);
    },
  };
  const db = {
    collection: (name) => ({path: name, doc: (id) => ({id, path: `${name}/${id}`})}),
    runTransaction: (callback) => callback(transaction),
  };
  const filename = path.resolve(__dirname, "../lib/admin/document-catalog-management.js");
  const realRequire = createRequire(filename);
  const stubs = {
    "firebase-functions/v2/https": {
      ...realRequire("firebase-functions/v2/https"),
      onCall: (_options, handler) => handler,
    },
    "../shared/audit.js": {writeAuditLogInTransaction() {}},
    "../shared/auth.js": {requireAuth: () => ({uid: "admin"})},
    "../shared/authorization.js": {requireRole: async () => {}},
    "../shared/document-catalog.js": realRequire("../shared/document-catalog-policy.js"),
    "../shared/firestore.js": {db},
    "../shared/function-options.js": {appCheckCallableOptions: {}},
    "../shared/rate-limit.js": {enforceCallableRateLimit: async () => {}},
    "../shared/timestamps.js": {serverTimestamp: () => "timestamp"},
  };
  const exports = {};
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    exports, require: (name) => stubs[name] ?? realRequire(name),
  }, {filename});
  return {handlers: exports, records, writes};
}

const agreement = {
  code: "provider_agreement", name: "Provider agreement", summary: "Terms",
  version: "2", effectiveDate: "2026-09-29",
  sections: [{title: "Responsibilities", paragraphs: ["Deliver the agreed services."]}],
  useForProviderOnboarding: true,
};
const businessDocument = {
  code: "permit", name: "Business permit", description: "Current permit",
  rules: [{effect: "required", oneOfGroup: "", registrationScope: "registered_business",
    serviceTypes: [], serviceCategoryCodes: [], excludeServiceCategoryCodes: []}],
};

for (const [kind, collection, categoryCode, input] of [
  ["AgreementTemplate", "agreementTemplates", "agreements", agreement],
  ["BusinessDocumentType", "businessDocumentTypes", "business_documents", businessDocument],
]) {
  for (const action of ["create", "update"]) {
    for (const suppliedCategory of [undefined, "test"]) {
      test(`${action}${kind} assigns its system classification (input: ${suppliedCategory})`, async () => {
        const recordPath = `${collection}/${input.code}`;
        const historical = {version: "0", sections: []};
        const previous = {...input, categoryCode: "test", status: "active", version: "1",
          priorVersions: [historical], createdBy: "original-admin"};
        const harness = catalogHarness(action === "update" ? {[recordPath]: previous} : {});
        const categoriesBefore = JSON.stringify(Object.entries(harness.records)
          .filter(([key]) => key.startsWith("documentCategories/")));
        if (kind === "AgreementTemplate" && action === "update") {
          await assert.rejects(
            harness.handlers.updateAgreementTemplate({
              data: {...input, ...(suppliedCategory ? {categoryCode: suppliedCategory} : {})},
            }),
            (error) => {
              assert.equal(error.code, "failed-precondition");
              assert.match(error.message, /already been published/);
              return true;
            },
          );
          const saved = harness.records[recordPath];
          assert.equal(saved.version, "1");
          assert.equal(saved.createdBy, "original-admin");
          assert.equal(saved.priorVersions.length, 1);
          assert.equal(saved.priorVersions[0].version, "0");
          assert.deepEqual(harness.writes, []);
          assert.equal(JSON.stringify(Object.entries(harness.records)
            .filter(([key]) => key.startsWith("documentCategories/"))), categoriesBefore);
          return;
        }
        const result = await harness.handlers[`${action}${kind}`]({
          data: {...input, ...(suppliedCategory ? {categoryCode: suppliedCategory} : {})},
        });
        assert.equal(result.success, true);
        const saved = harness.records[recordPath];
        assert.equal(saved.categoryCode, categoryCode);
        assert.equal(JSON.stringify(saved.rules ?? saved.sections), JSON.stringify(input.rules ?? input.sections));
        assert.deepEqual(harness.writes, [recordPath]);
        assert.equal(JSON.stringify(Object.entries(harness.records)
          .filter(([key]) => key.startsWith("documentCategories/"))), categoriesBefore);
        if (kind === "AgreementTemplate") {
          assert.equal(saved.useForProviderOnboarding, true);
          assert.equal(saved.versions[0].status, "current");
          assert.equal(saved.versions[0].version, input.version);
        }
      });
    }
  }

  test(`${kind} retains validation of the internal category without changing data`, async () => {
    const harness = catalogHarness({[`documentCategories/${categoryCode}`]: {status: "discontinued"}});
    await assert.rejects(harness.handlers[`create${kind}`]({data: input}), {code: "failed-precondition"});
    assert.deepEqual(harness.writes, []);
  });
}

test("category CRUD handlers are no longer exposed", () => {
  const {handlers} = catalogHarness();
  for (const action of ["create", "update", "delete", "discontinue", "reactivate"]) {
    assert.equal(handlers[`${action}DocumentCategory`], undefined);
  }
});
