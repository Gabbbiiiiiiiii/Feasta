"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(
  __dirname,
  "../src/bookings/multi-provider-mixed-refund-preparation.ts",
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
    x => x.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
);

const captured = [];

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));

const originalRequire = compiled.require.bind(compiled);

compiled.require = function(specifier) {
  if (specifier === "./booking-refund-policy.js") {
    return {
      parseBookingRefundPolicyRollout: rollout =>
        rollout.exists && rollout.data?.mode === "required"
          ? "required"
          : "off",

      resolveBookingRefundPolicies: relationships => {
        captured.push(relationships);

        return new Map(relationships.map(row => [
          row.providerId,
          {providerId: row.providerId, providerName: row.providerName},
        ]));
      },

      refundPolicyDisclosures: policies =>
        [...policies.values()],
    };
  }

  if (specifier === "./multi-provider-refund-preparation.js") {
    return {
      confirmMultiProviderRefundAcknowledgements:
        (prepared, value, timestamp) => {
          if (prepared.mode === "required" &&
              value?.length !== prepared.policies.size) {
            throw new Error("Acknowledgements incomplete");
          }

          return new Map(
            [...prepared.policies.keys()].map(id => [
              id,
              {timestamp},
            ]),
          );
        },
    };
  }

  return originalRequire(specifier);
};

compiled._compile(transpiled.outputText, filename);

const {
  prepareMixedProviderRefundPolicies: prepare,
  confirmMixedProviderRefundAcknowledgements: confirm,
} = compiled.exports;

function catering() {
  return {
    kind: "catering_package",
    providerId: "caterer123",
    providerOwnerId: "caterOwner123",
    providerData: {
      ownerId: "caterOwner123",
      businessName: "Catering Provider",
    },
    packageData: {providerId: "caterer123"},
    resolved: {
      providerId: "caterer123",
      packageId: "package123",
    },
  };
}

function photography() {
  return {
    kind: "marketplace_service",
    providerId: "photographer123",
    providerOwnerId: "photoOwner123",
    providerData: {
      ownerId: "photoOwner123",
      businessName: "Photography Provider",
    },
    service: {
      providerId: "photographer123",
      ownerId: "photoOwner123",
      serviceId: "service123",
    },
  };
}

const rollout = {
  exists: true,
  data: {mode: "required"},
};

test("resolves a separate refund policy for each provider", () => {
  const result = prepare({
    rows: [catering(), photography()],
    rollout,
  });

  assert.equal(result.mode, "required");
  assert.equal(result.policies.size, 2);
  assert.equal(result.disclosures.length, 2);
});

test("Catering retains the trusted package relationship", () => {
  prepare({rows: [catering(), photography()], rollout});

  const relationships = captured.at(-1);
  assert.equal(
    relationships[0].packageRecord.packageId,
    "package123",
  );
});

test("Photography has no fabricated package", () => {
  prepare({rows: [catering(), photography()], rollout});

  const relationships = captured.at(-1);
  assert.equal(relationships[1].packageRecord, null);
});

test("preserves marketplace-first identity", () => {
  prepare({rows: [photography(), catering()], rollout});

  const relationships = captured.at(-1);
  assert.equal(relationships[0].providerId, "photographer123");
  assert.equal(relationships[1].providerId, "caterer123");
});

test("honors the existing off rollout", () => {
  const result = prepare({
    rows: [catering(), photography()],
    rollout: {exists: false, data: undefined},
  });

  assert.equal(result.mode, "off");
  assert.equal(result.policies.size, 0);
  assert.equal(result.disclosures.length, 0);
});

test("rejects duplicate providers", () => {
  const photo = photography();
  photo.providerId = "caterer123";

  assert.throws(
    () => prepare({rows: [catering(), photo], rollout}),
    /Mixed refund provider identity is invalid/,
  );
});

test("rejects mismatched Photography ownership", () => {
  const photo = photography();
  photo.service.ownerId = "wrongOwner123";

  assert.throws(
    () => prepare({rows: [catering(), photo], rollout}),
    /Marketplace refund linkage is invalid/,
  );
});

test("rejects mismatched Catering package ownership", () => {
  const food = catering();
  food.packageData.providerId = "wrongProvider";

  assert.throws(
    () => prepare({rows: [food, photography()], rollout}),
    /Catering refund linkage is invalid/,
  );
});

test("rejects Catering-only relationships", () => {
  const other = catering();
  other.providerId = "caterer456";
  other.providerOwnerId = "caterOwner456";
  other.providerData.ownerId = "caterOwner456";
  other.resolved.providerId = "caterer456";
  other.packageData.providerId = "caterer456";

  assert.throws(
    () => prepare({rows: [catering(), other], rollout}),
    /requires Catering and an event service/,
  );
});

test("delegates acknowledgements to existing authority", () => {
  const prepared = prepare({
    rows: [catering(), photography()],
    rollout,
  });

  assert.throws(
    () => confirm(prepared, [{providerId: "caterer123"}], "server-time"),
    /Acknowledgements incomplete/,
  );

  const evidence = confirm(
    prepared,
    [{providerId: "caterer123"}, {providerId: "photographer123"}],
    "server-time",
  );

  assert.equal(evidence.size, 2);
});