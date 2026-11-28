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
    x => x.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
);

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));

const originalRequire = compiled.require.bind(compiled);

compiled.require = function(specifier) {
  if (specifier.includes("validate-provider-availability")) {
    return {
      isCanonicalEventTimeRange: (start, end) =>
        start === "10:00" && end === "18:00",
    };
  }
  return originalRequire(specifier);
};

compiled._compile(result.outputText, filename);

const {
  parseMultiProviderMixedSubmissionEnvelope: parse,
} = compiled.exports;

const event = {
  eventType: "wedding",
  eventDate: "2026-12-20",
  eventTime: "10:00",
  eventEndTime: "18:00",
  guestCount: 100,
  eventLocation: "Ormoc City",
  eventAddress: "Ormoc City, Leyte",
  specialRequest: "",
};

function catering(providerId = "caterer123") {
  return {
    kind: "catering_package",
    providerId,
    packageId: "package123",
    configuration: {event: {...event}},
  };
}

function photography(providerId = "photographer123") {
  return {
    kind: "marketplace_service",
    providerId,
    serviceId: "service123",
    expectedRevision: 3,
    configuration: {
      event: {...event},
      specialRequest: "Photo coverage",
    },
  };
}

function envelope(selections = [catering(), photography()]) {
  return {
    schemaVersion: 2,
    clientRequestId: "request123",
    event: {...event},
    selections,
  };
}

test("accepts one Catering and one Photography provider", () => {
  const result = parse(envelope());
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.selections.length, 2);
  assert.equal(result.selections[0].kind, "catering_package");
  assert.equal(result.selections[1].kind, "marketplace_service");
});

test("accepts marketplace first without changing identity", () => {
  const result = parse(envelope([photography(), catering()]));
  assert.equal(result.selections[0].serviceId, "service123");
  assert.equal(result.selections[1].packageId, "package123");
});

test("accepts multiple Catering and marketplace providers", () => {
  const result = parse(envelope([
    catering("caterer123"),
    catering("caterer456"),
    photography("photographer123"),
  ]));
  assert.equal(result.selections.length, 3);
});

test("rejects Catering-only v2 selection", () => {
  assert.throws(
    () => parse(envelope([
      catering("caterer123"),
      catering("caterer456"),
    ])),
    /requires Catering and an event service/,
  );
});

test("rejects marketplace-only v2 selection", () => {
  assert.throws(
    () => parse(envelope([
      photography("photographer123"),
      photography("photographer456"),
    ])),
    /requires Catering and an event service/,
  );
});

test("rejects a duplicate provider across categories", () => {
  assert.throws(
    () => parse(envelope([
      catering("provider123"),
      photography("provider123"),
    ])),
    /Only one configuration per provider/,
  );
});

test("rejects a packageId on Photography", () => {
  const photo = photography();
  photo.packageId = "package123";
  assert.throws(
    () => parse(envelope([catering(), photo])),
    /Unexpected or missing submission fields/,
  );
});

test("rejects a serviceId on Catering", () => {
  const food = catering();
  food.serviceId = "service123";
  assert.throws(
    () => parse(envelope([food, photography()])),
    /Unexpected or missing submission fields/,
  );
});

test("rejects mismatched shared event details", () => {
  const photo = photography();
  photo.configuration.event.guestCount = 200;
  assert.throws(
    () => parse(envelope([catering(), photo])),
    /conflicting guestCount/,
  );
});

test("rejects stale revision input shape", () => {
  const photo = photography();
  photo.expectedRevision = 0;
  assert.throws(
    () => parse(envelope([catering(), photo])),
    /Invalid marketplace service revision/,
  );
});

test("rejects more than four providers", () => {
  assert.throws(
    () => parse(envelope([
      catering("caterer123"),
      catering("caterer456"),
      catering("caterer789"),
      photography("photographer123"),
      photography("photographer456"),
    ])),
    /between 2 and 4/,
  );
});

test("rejects missing configuration", () => {
  const food = catering();
  delete food.configuration;
  assert.throws(
    () => parse(envelope([food, photography()])),
    /Unexpected or missing submission fields/,
  );
});

test("rejects unsupported selection kind", () => {
  const photo = photography();
  photo.kind = "unknown";
  assert.throws(
    () => parse(envelope([catering(), photo])),
    /Unsupported mixed-provider selection kind/,
  );
});