"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(
  __dirname,
  "../src/bookings/multi-provider-marketplace-reader.ts",
);

const transpiled = ts.transpileModule(
  fs.readFileSync(filename, "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  },
);

assert.equal(
  (transpiled.diagnostics || []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
);

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));

const normalRequire = compiled.require.bind(compiled);

compiled.require = function(specifier) {
  if (specifier === "./multi-provider-marketplace-service.js") {
    return {
      resolveTrustedMarketplaceService: (input) => ({
        serviceId: input.serviceId,
        providerId: input.providerId,
        serviceData: input.serviceData,
      }),
    };
  }
  return normalRequire(specifier);
};

compiled._compile(transpiled.outputText, filename);

const {readTrustedMarketplaceService} = compiled.exports;

function fixture(changes = {}) {
  const calls = {
    collection: [],
    doc: [],
    get: [],
  };

  const reference = {path: "addons/service123"};

  const firestore = {
    collection(name) {
      calls.collection.push(name);
      return {
        doc(id) {
          calls.doc.push(id);
          return reference;
        },
      };
    },
  };

  const transaction = {
    async get(ref) {
      calls.get.push(ref);
      return changes.snapshot || {
        exists: true,
        data() {
          return {revision: 3, name: "Photography"};
        },
      };
    },
  };

  return {
    calls,
    input: {
      transaction,
      firestore,
      providerId: "provider123",
      ownerId: "owner12345",
      providerData: {ownerId: "owner12345"},
      serviceId: "service123",
      expectedRevision: 3,
      ...changes.input,
    },
  };
}

test("reads the authoritative addons document in transaction", async () => {
  const {input, calls} = fixture();
  const result = await readTrustedMarketplaceService(input);

  assert.deepEqual(calls.collection, ["addons"]);
  assert.deepEqual(calls.doc, ["service123"]);
  assert.equal(calls.get.length, 1);
  assert.equal(result.serviceData.revision, 3);
});

test("rejects a missing service", async () => {
  const {input} = fixture({
    snapshot: {exists: false},
  });

  await assert.rejects(
    readTrustedMarketplaceService(input),
    /unavailable/,
  );
});

test("rejects a stale service revision", async () => {
  const {input} = fixture({
    snapshot: {
      exists: true,
      data() {
        return {revision: 4};
      },
    },
  });

  await assert.rejects(
    readTrustedMarketplaceService(input),
    /Reload your selections/,
  );
});

test("rejects an invalid revision before reading", async () => {
  const {input, calls} = fixture({
    input: {expectedRevision: 0},
  });

  await assert.rejects(
    readTrustedMarketplaceService(input),
    /read input is invalid/,
  );
  assert.equal(calls.get.length, 0);
});

test("rejects invalid service ID before Firestore access", async () => {
  const {input, calls} = fixture({
    input: {serviceId: "../bad"},
  });

  await assert.rejects(
    readTrustedMarketplaceService(input),
    /identity is invalid/,
  );
  assert.equal(calls.collection.length, 0);
  assert.equal(calls.get.length, 0);
});

test("rejects invalid provider ID before Firestore access", async () => {
  const {input, calls} = fixture({
    input: {providerId: "../bad"},
  });

  await assert.rejects(
    readTrustedMarketplaceService(input),
    /identity is invalid/,
  );
  assert.equal(calls.get.length, 0);
});

test("rejects malformed stored record", async () => {
  const {input} = fixture({
    snapshot: {
      exists: true,
      data() {
        return null;
      },
    },
  });

  await assert.rejects(
    readTrustedMarketplaceService(input),
    /record is invalid/,
  );
});