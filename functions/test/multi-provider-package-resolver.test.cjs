"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const candidates = [
  "../lib/bookings/multi-provider-package-resolver.js",
  "../lib/src/bookings/multi-provider-package-resolver.js",
  "../dist/bookings/multi-provider-package-resolver.js",
  "../dist/src/bookings/multi-provider-package-resolver.js",
];

const compiled = candidates
  .map((item) => path.resolve(__dirname, item))
  .find((item) => fs.existsSync(item));

assert.ok(compiled, "Compiled resolver not found.");

const {resolveMultiProviderPackageCore} = require(compiled);

assert.equal(typeof resolveMultiProviderPackageCore, "function");

function input(overrides = {}) {
  return {
    entry: {
      providerId: "provider_001",
      packageId: "package_001",
      configuration: {
        selectedFoods: [],
        selectedDecorations: [],
        selectedFurniture: [],
        selectedEventServices: [],
        selectedAddOns: [],
      },
    },
    packageData: {},
    eventType: "wedding",
    guestCount: 100,
    verifiedV2: false,
    ...overrides,
  };
}

function assertRejected(operation, code, message) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, code);
    assert.match(error.message, message);
    return true;
  });
}

test("rejects an invalid guest count", () => {
  assertRejected(
    () => resolveMultiProviderPackageCore(
      input({guestCount: 0}),
    ),
    "invalid-argument",
    /guest count/i,
  );
});

test("rejects incomplete V2 revision metadata", () => {
  const value = input();
  value.entry.configuration.sharedContractVersion = 2;

  assertRejected(
    () => resolveMultiProviderPackageCore(value),
    "invalid-argument",
    /revision|version/i,
  );
});

test("rejects invalid V2 revision values", () => {
  const value = input();
  value.entry.configuration.sharedContractVersion = 2;
  value.entry.configuration.expectedPackageRevision = 0;

  assertRejected(
    () => resolveMultiProviderPackageCore(value),
    "invalid-argument",
    /revision/i,
  );
});

test("rejects V2 packages without verified admission", () => {
  const value = input({
    packageData: {
      occasionSchemaVersion: 2,
      revision: 7,
    },
    verifiedV2: false,
  });

  assertRejected(
    () => resolveMultiProviderPackageCore(value),
    "failed-precondition",
    /verified package metadata/i,
  );
});

test("rejects stale V2 package revisions", () => {
  const value = input({
    packageData: {
      occasionSchemaVersion: 2,
      revision: 7,
    },
    verifiedV2: true,
  });

  value.entry.configuration.sharedContractVersion = 2;
  value.entry.configuration.expectedPackageRevision = 6;

  assertRejected(
    () => resolveMultiProviderPackageCore(value),
    "aborted",
    /package changed/i,
  );
});