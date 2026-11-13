"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function loadCompiled(name) {
  const candidates = [
    `../lib/bookings/${name}.js`,
    `../lib/src/bookings/${name}.js`,
    `../dist/bookings/${name}.js`,
    `../dist/src/bookings/${name}.js`,
  ];

  const location = candidates
    .map((candidate) => path.resolve(__dirname, candidate))
    .find((candidate) => fs.existsSync(candidate));

  assert.ok(location, `Compiled module missing: ${name}`);

  return require(location);
}

const {
  resolveMultiProviderPackageCore,
} = loadCompiled("multi-provider-package-resolver");

const {
  validateBookingPackage,
} = loadCompiled("booking-contract");

function validPackage() {
  return {
    providerId: "provider_001",
    name: "Wedding Celebration Package",
    status: "published",
    isPublished: true,
    isActive: true,
    isDeleted: false,
    providerPubliclyVisible: true,
    eventType: "wedding",
    eventTypes: ["wedding"],
    minimumGuests: 25,
    maximumGuests: 200,
    price: 15000,
    foodInclusions: ["Rice", "Chicken"],
    decorInclusions: ["Backdrop", "Flowers"],
    furnitureInclusions: ["Tables", "Chairs"],
    serviceInclusions: [],
    themeOptions: [],
  };
}

function validInput() {
  return {
    entry: {
      providerId: "provider_001",
      packageId: "package_001",
      configuration: {
        selectedFoods: ["Rice"],
        selectedDecorations: ["Backdrop"],
        selectedFurniture: ["Tables"],
        foodChoiceSelections: [],
        selectedEventServices: [],
        selectedAddOns: [],
      },
    },
    packageData: validPackage(),
    eventType: "wedding",
    guestCount: 100,
    verifiedV2: false,
  };
}

function mustReject(input, message) {
  assert.throws(
    () => resolveMultiProviderPackageCore(input),
    (error) => {
      assert.match(error.message, message);
      return true;
    },
  );
}

test("fixture satisfies the existing booking package eligibility rules", () => {
  const input = validInput();

  const validation = validateBookingPackage({
    packageData: input.packageData,
    expectedProviderId: input.entry.providerId,
    submittedEventType: input.eventType,
    guestCount: input.guestCount,
    verifiedV2: false,
  });

  assert.deepEqual(
    validation.valid,
    true,
    `Published fixture rejected: ${JSON.stringify(validation)}`,
  );
});

test("resolves a valid published package and customizations", () => {
  const result = resolveMultiProviderPackageCore(validInput());

  assert.equal(result.providerId, "provider_001");
  assert.equal(result.packageId, "package_001");
  assert.equal(result.packageName, "Wedding Celebration Package");
  assert.equal(result.basePrice, 15000);
  assert.equal(result.verifiedV2, false);
});

test("rejects a food not included in the package", () => {
  const input = validInput();
  input.entry.configuration.selectedFoods = ["Unknown Dish"];

  mustReject(input, /selectedFoods|unavailable package option/i);
});

test("rejects an unavailable decoration", () => {
  const input = validInput();
  input.entry.configuration.selectedDecorations = ["Unknown Decoration"];

  mustReject(input, /selectedDecorations|unavailable package option/i);
});

test("rejects unavailable furniture", () => {
  const input = validInput();
  input.entry.configuration.selectedFurniture = ["Unknown Furniture"];

  mustReject(input, /selectedFurniture|unavailable package option/i);
});

test("rejects duplicate selected foods", () => {
  const input = validInput();
  input.entry.configuration.selectedFoods = ["Rice", "Rice"];

  mustReject(input, /duplicate/i);
});

test("rejects unvalidated event services", () => {
  const input = validInput();
  input.entry.configuration.selectedEventServices = [
    {addonId: "addon_001", price: 100},
  ];

  mustReject(input, /add-on services need updated booking validation/i);
});

test("rejects unvalidated mobile add-ons", () => {
  const input = validInput();
  input.entry.configuration.selectedAddOns = [
    {addonId: "addon_001", price: 100},
  ];

  mustReject(input, /add-on services need updated booking validation/i);
});

test("rejects a legacy package with V2 pricing fields", () => {
  const input = validInput();
  input.packageData.pricingModel = "per_pax";

  mustReject(input, /occasion compatibility|package cannot be booked/i);
});

test("rejects a published package that becomes inactive", () => {
  const input = validInput();
  input.packageData.isActive = false;

  mustReject(input, /package cannot be booked/i);
});

test("rejects a guest count above package capacity", () => {
  const input = validInput();
  input.guestCount = 201;

  mustReject(input, /guest count above maximum|package cannot be booked/i);
});