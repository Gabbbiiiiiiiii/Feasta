"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(
  __dirname,
  "../src/bookings/multi-provider-submission-contract.ts",
);

const result = ts.transpileModule(
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
  (result.diagnostics || []).filter(
    item => item.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
);

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));

const originalRequire = compiled.require.bind(compiled);

compiled.require = function(specifier) {
  if (specifier.includes("validate-provider-availability")) {
    return {isCanonicalEventTimeRange: () => true};
  }
  return originalRequire(specifier);
};

compiled._compile(result.outputText, filename);

const {parseMultiProviderMarketplaceSelection} = compiled.exports;

const event = {
  eventType: "wedding",
  eventDate: "2026-12-20",
  eventTime: "10:00",
  eventEndTime: "18:00",
  guestCount: 100,
  eventLocation: "Ormoc City",
  eventAddress: "Ormoc City, Leyte",
};

function selection() {
  return {
    kind: "marketplace_service",
    providerId: "provider123",
    serviceId: "service123",
    expectedRevision: 3,
    configuration: {event: {...event}, specialRequest: "Photos"},
  };
}

test("accepts explicit marketplace service identity", () => {
  const actual = parseMultiProviderMarketplaceSelection(selection(), event);
  assert.equal(actual.kind, "marketplace_service");
  assert.equal(actual.serviceId, "service123");
  assert.equal(actual.expectedRevision, 3);
});

test("rejects packageId mixed into marketplace selection", () => {
  const input = selection();
  input.packageId = "package123";
  assert.throws(
    () => parseMultiProviderMarketplaceSelection(input, event),
    /Unexpected or missing submission fields/,
  );
});

test("rejects missing service identity", () => {
  const input = selection();
  delete input.serviceId;
  assert.throws(
    () => parseMultiProviderMarketplaceSelection(input, event),
    /Unexpected or missing submission fields/,
  );
});

test("rejects incorrect selection kind", () => {
  const input = selection();
  input.kind = "catering";
  assert.throws(
    () => parseMultiProviderMarketplaceSelection(input, event),
    /Invalid marketplace selection kind/,
  );
});

test("rejects stale or invalid revision input", () => {
  for (const revision of [0, -1, 1.2, "3", null]) {
    const input = selection();
    input.expectedRevision = revision;
    assert.throws(
      () => parseMultiProviderMarketplaceSelection(input, event),
      /Invalid marketplace service revision/,
    );
  }
});

test("rejects conflicting event details", () => {
  const input = selection();
  input.configuration.event.guestCount = 200;
  assert.throws(
    () => parseMultiProviderMarketplaceSelection(input, event),
    /conflicting guestCount/,
  );
});

test("rejects malformed nested event without fallback", () => {
  const input = selection();
  input.configuration.event = null;
  assert.throws(
    () => parseMultiProviderMarketplaceSelection(input, event),
    /Expected a structured object/,
  );
});

test("rejects unbounded provider instructions", () => {
  const input = selection();
  input.configuration.specialRequest = "x".repeat(1001);
  assert.throws(
    () => parseMultiProviderMarketplaceSelection(input, event),
    /Invalid marketplace provider instructions/,
  );
});