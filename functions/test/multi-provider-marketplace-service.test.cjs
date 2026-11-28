"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(
  __dirname,
  "../src/bookings/multi-provider-marketplace-service.ts",
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
  result.diagnostics.filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
);

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(result.outputText, filename);

const {resolveTrustedMarketplaceService} = compiled.exports;

function valid() {
  return {
    serviceId: "service123",
    providerId: "provider123",
    ownerId: "owner12345",
    providerData: {
      ownerId: "owner12345",
      businessName: "Photography Studio",
      providerServiceType: "addon",
    },
    serviceData: {
      providerId: "provider123",
      ownerId: "owner12345",
      name: "Event Photography",
      category: "photography",
      status: "published",
      isPublished: true,
      isActive: true,
      isAvailable: true,
      isDeleted: false,
      pricingType: "fixed",
      price: 2500.50,
    },
  };
}

function rejects(update, message) {
  const input = valid();
  update(input);

  assert.throws(
    () => resolveTrustedMarketplaceService(input),
    message,
  );
}

test("accepts a valid published fixed-price service", () => {
  const resolved = resolveTrustedMarketplaceService(valid());

  assert.equal(resolved.providerId, "provider123");
  assert.equal(resolved.serviceId, "service123");
  assert.equal(resolved.name, "Event Photography");
  assert.equal(resolved.category, "photography");
  assert.equal(resolved.priceInCentavos, 250050);
});

test("rejects mismatched service ownership", () => {
  rejects(
    (input) => { input.serviceData.ownerId = "otherOwner"; },
    /ownership is invalid/,
  );
});

test("rejects mismatched provider identity", () => {
  rejects(
    (input) => { input.serviceData.providerId = "otherProvider"; },
    /ownership is invalid/,
  );
});

test("rejects mismatched provider owner", () => {
  rejects(
    (input) => { input.providerData.ownerId = "otherOwner"; },
    /ownership is invalid/,
  );
});

test("rejects unpublished service", () => {
  rejects(
    (input) => { input.serviceData.isPublished = false; },
    /unavailable/,
  );
});

test("rejects inactive service", () => {
  rejects(
    (input) => { input.serviceData.isActive = false; },
    /unavailable/,
  );
});

test("rejects unavailable service", () => {
  rejects(
    (input) => { input.serviceData.isAvailable = false; },
    /unavailable/,
  );
});

test("rejects deleted service", () => {
  rejects(
    (input) => { input.serviceData.isDeleted = true; },
    /unavailable/,
  );
});

test("rejects draft status", () => {
  rejects(
    (input) => { input.serviceData.status = "draft"; },
    /unavailable/,
  );
});

test("rejects custom-quote pricing", () => {
  rejects(
    (input) => {
      input.serviceData.pricingType = "custom_quote";
      input.serviceData.price = null;
    },
    /pricing model is not supported/,
  );
});

test("rejects per-hour pricing without calculation", () => {
  rejects(
    (input) => { input.serviceData.pricingType = "per_hour"; },
    /pricing model is not supported/,
  );
});

test("rejects per-unit pricing without quantity", () => {
  rejects(
    (input) => { input.serviceData.pricingType = "per_unit"; },
    /pricing model is not supported/,
  );
});

test("rejects zero price", () => {
  rejects(
    (input) => { input.serviceData.price = 0; },
    /price is invalid/,
  );
});

test("rejects negative price", () => {
  rejects(
    (input) => { input.serviceData.price = -100; },
    /price is invalid/,
  );
});

test("rejects excessive price", () => {
  rejects(
    (input) => { input.serviceData.price = 100000001; },
    /price is invalid/,
  );
});

test("rejects unsupported fractional-centavo price", () => {
  rejects(
    (input) => { input.serviceData.price = 100.005; },
    /precision is invalid/,
  );
});

test("rejects invalid service ID", () => {
  rejects(
    (input) => { input.serviceId = "../invalid"; },
    /identity is invalid/,
  );
});

test("rejects blank service category", () => {
  rejects(
    (input) => { input.serviceData.category = "  "; },
    /details are invalid/,
  );
});