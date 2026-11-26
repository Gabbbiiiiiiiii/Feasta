"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(
  __dirname,
  "../src/bookings/multi-provider-mixed-financial-preparation.ts",
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

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));

const originalRequire = compiled.require.bind(compiled);

compiled.require = function(specifier) {
  if (specifier === "../payments/package-payment-terms.js") {
    return {
      buildPackagePaymentTermsSnapshot: data => ({
        paymentPolicy: data.paymentPolicy,
        depositRateBps: data.depositRateBps,
      }),
    };
  }

  if (specifier === "./canonical-booking-payment-policy.js") {
    return {
      requireNewBookingCanonicalPaymentTerms: terms => {
        if (!terms.paymentPolicy) {
          throw new Error("Invalid canonical Catering terms");
        }
        return terms;
      },
    };
  }

  if (specifier === "../payments/platform-commission-policy.js") {
    return require(path.resolve(
      __dirname,
      "../lib/payments/platform-commission-policy.js",
    ));
  }

  return originalRequire(specifier);
};

compiled._compile(transpiled.outputText, filename);

const {prepareMixedProviderFinancials: prepare} = compiled.exports;

function catering() {
  return {
    kind: "catering_package",
    providerId: "caterer123",
    providerOwnerId: "caterOwner123",
    providerData: {},
    packageData: {
      providerId: "caterer123",
      paymentPolicy: "deposit",
      depositRateBps: 3000,
    },
    resolved: {
      providerId: "caterer123",
      packageId: "package123",
      basePrice: 10000.50,
    },
  };
}

function photography() {
  return {
    kind: "marketplace_service",
    providerId: "photographer123",
    providerOwnerId: "photoOwner123",
    providerData: {},
    service: {
      serviceId: "service123",
      providerId: "photographer123",
      ownerId: "photoOwner123",
      priceInCentavos: 250025,
      serviceData: {},
    },
  };
}

test("calculates separate Catering and Photography totals", () => {
  const result = prepare([catering(), photography()]);
  assert.equal(result.cateringSubtotalInCentavos, 1000050);
  assert.equal(result.marketplaceSubtotalInCentavos, 250025);
  assert.equal(result.totalGrossAmountInCentavos, 1250075);
});

test("preserves Catering package terms", () => {
  const result = prepare([catering(), photography()]);
  assert.equal(result.items[0].kind, "catering_package");
  assert.equal(result.items[0].packagePaymentTerms.depositRateBps, 3000);
});

test("requires full upfront Photography payment", () => {
  const result = prepare([catering(), photography()]);
  const photo = result.items[1];
  assert.equal(photo.paymentPolicy, "full_payment");
  assert.equal(
    photo.requiredUpfrontAmountInCentavos,
    photo.grossAmountInCentavos,
  );
  assert.equal(photo.packagePaymentTerms, null);
});

test("preserves marketplace-first order", () => {
  const result = prepare([photography(), catering()]);
  assert.equal(result.items[0].kind, "marketplace_service");
  assert.equal(result.items[1].kind, "catering_package");
});

test("rejects duplicate provider identities", () => {
  const photo = photography();
  photo.providerId = "caterer123";
  assert.throws(
    () => prepare([catering(), photo]),
    /provider identity is invalid/,
  );
});

test("rejects malformed Catering financial identity", () => {
  const food = catering();
  food.packageData.providerId = "anotherProvider";
  assert.throws(
    () => prepare([food, photography()]),
    /Catering financial linkage is invalid/,
  );
});

test("rejects invalid Photography ownership", () => {
  const photo = photography();
  photo.service.ownerId = "anotherOwner";
  assert.throws(
    () => prepare([catering(), photo]),
    /Marketplace financial linkage is invalid/,
  );
});

test("rejects zero Photography price", () => {
  const photo = photography();
  photo.service.priceInCentavos = 0;
  assert.throws(
    () => prepare([catering(), photo]),
    /Marketplace financial linkage is invalid/,
  );
});

test("rejects unsupported Catering price precision", () => {
  const food = catering();
  food.resolved.basePrice = 100.005;
  assert.throws(
    () => prepare([food, photography()]),
    /financial precision is invalid/,
  );
});

test("rejects Catering-only selections", () => {
  const food2 = catering();
  food2.providerId = "caterer456";
  food2.packageData.providerId = "caterer456";
  food2.resolved.providerId = "caterer456";
  assert.throws(
    () => prepare([catering(), food2]),
    /requires Catering and an event service/,
  );
});