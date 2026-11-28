import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {isPublishablePackageV2} =
  require("../dist/customer-package-v2.cjs");

const description =
  "Enjoy our Filipino bilao package for family gatherings.\n\n" +
  "Includes selected dishes for 8-10 guests.\n\n" +
  "A convenient food-sharing experience.";

function packageFixture(overrides = {}) {
  const image =
    "https://res.cloudinary.com/demo/image/upload/sample.png";

  return {
    sharedContractVersion: 2,
    offerSchemaVersion: 2,
    occasionSchemaVersion: 2,
    offerStructure: "fixed",
    name: "Busog Na Set - Bilao Package",
    description: "A complete Filipino catering package.",
    foodInclusions: [
      "Pasta/Noodles: Bam-e guisado",
      "Chicken: Buttered chicken"
    ],
    pricingModel: "per_bundle",
    price: 1850,
    serviceOptions: {
      drop_off: {
        price: 1850,
        includedServices: []
      }
    },
    paymentTermsSchemaVersion: 2,
    paymentPolicy: "deposit_then_balance",
    depositPercentage: 50,
    balanceDueDaysBeforeEvent: null,
    balanceDueHoursBeforeEvent: 24,
    imageUrl: image,
    imageUrls: [image],
    themeOptions: [],
    ...overrides
  };
}

test("valid Fixed Per Bundle baseline is publishable", () => {
  assert.equal(isPublishablePackageV2(packageFixture(), 4), true);
});

test("LF multiline description is publishable and preserved", () => {
  const saved = packageFixture({description});
  const before = saved.description;

  assert.equal(isPublishablePackageV2(saved, 4), true);
  assert.equal(saved.description, before);
});

test("CRLF multiline description is publishable and preserved", () => {
  const value = description.replace(/\n/gu, "\r\n");
  const saved = packageFixture({description: value});

  assert.equal(isPublishablePackageV2(saved, 4), true);
  assert.equal(saved.description, value);
});

test("standalone carriage return remains rejected", () => {
  const saved = packageFixture({
    description: "First paragraph.\rSecond paragraph."
  });

  assert.equal(isPublishablePackageV2(saved, 4), false);
});

test("tab control remains rejected", () => {
  const saved = packageFixture({
    description: "First paragraph.\tSecond paragraph."
  });

  assert.equal(isPublishablePackageV2(saved, 4), false);
});

test("zero-width format character remains rejected", () => {
  const saved = packageFixture({
    description: "First paragraph.\u200BSecond paragraph."
  });

  assert.equal(isPublishablePackageV2(saved, 4), false);
});

test("malformed surrogate remains rejected", () => {
  const saved = packageFixture({
    description: "First paragraph.\uD800Second paragraph."
  });

  assert.equal(isPublishablePackageV2(saved, 4), false);
});

test("newlines in package names remain rejected", () => {
  const saved = packageFixture({
    name: "Busog Na Set\nBilao Package"
  });

  assert.equal(isPublishablePackageV2(saved, 4), false);
});

test("missing description remains rejected", () => {
  const saved = packageFixture({description: undefined});

  assert.equal(isPublishablePackageV2(saved, 4), false);
});

test("overlong description remains rejected", () => {
  const saved = packageFixture({description: "A".repeat(5001)});

  assert.equal(isPublishablePackageV2(saved, 4), false);
});

test("Individual Food publication remains unsupported", () => {
  const saved = packageFixture({offerStructure: "individual"});

  assert.equal(isPublishablePackageV2(saved, 4), false);
});

test("missing food inclusions remains blocked", () => {
  const saved = packageFixture({foodInclusions: []});

  assert.equal(isPublishablePackageV2(saved, 4), false);
});