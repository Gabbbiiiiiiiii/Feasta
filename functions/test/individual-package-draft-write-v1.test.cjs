const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseIndividualPackageDraftPricingWriteV1: parse,
} = require("../lib/packages/individual-package-draft-write-v1.js");

function valid() {
  return {
    draftPricingContractVersion: 1,
    individualFoodItems: [
      {
        id: "pancit",
        name: "Pancit Bilao",
        servingOptions: [
          {
            id: "family",
            name: "Family Size",
            minimumServings: 8,
            maximumServings: 10,
            priceCentavos: 185000,
            minimumQuantity: 1,
            maximumQuantity: 3,
          },
          {
            id: "party",
            name: "Party Size",
            minimumServings: 15,
            maximumServings: 20,
            priceCentavos: 295050,
            minimumQuantity: 1,
            maximumQuantity: 2,
          },
        ],
      },
    ],
  };
}

test("validates and preserves serving-size prices", () => {
  const result = parse(valid());

  assert.equal(result.draftPricingContractVersion, 1);
  assert.equal(result.pricing.offerStructure, "individual");
  assert.equal(result.pricing.pricingSchemaVersion, 1);

  const options = result.pricing.individualFoodItems[0].servingOptions;

  assert.equal(options[0].priceCentavos, 185000);
  assert.equal(options[1].priceCentavos, 295050);
  assert.equal(options[0].maximumQuantity, 3);
  assert.equal(options[1].maximumServings, 20);
});

test("does not invent a scalar package price", () => {
  const result = parse(valid());

  assert.equal(Object.hasOwn(result, "price"), false);
  assert.equal(Object.hasOwn(result, "pricingModel"), false);
  assert.equal(Object.hasOwn(result.pricing, "price"), false);
  assert.equal(Object.hasOwn(result.pricing, "pricingModel"), false);
});

test("does not mutate source pricing data", () => {
  const source = valid();
  const result = parse(source);

  source.individualFoodItems[0].servingOptions[0].priceCentavos = 1;

  assert.equal(
    result.pricing.individualFoodItems[0].servingOptions[0].priceCentavos,
    185000
  );
});

test("rejects package-level pricing fields", () => {
  for (const field of [
    "price",
    "pricingModel",
    "serviceOptions",
    "unitPrice",
    "totalPrice",
    "bookingPrice",
    "amount",
    "amountCentavos",
    "isPublished",
    "isActive",
    "providerPubliclyVisible",
  ]) {
    const value = valid();
    value[field] = field === "price" ? 1850 : "unsafe";

    assert.throws(
      () => parse(value),
      /INVALID_INDIVIDUAL_PACKAGE_DRAFT/,
      field
    );
  }
});

test("rejects unsupported schema versions", () => {
  const value = valid();
  value.draftPricingContractVersion = 2;

  assert.throws(
    () => parse(value),
    /INVALID_INDIVIDUAL_PACKAGE_DRAFT/
  );
});

test("rejects missing or extra fields", () => {
  const missing = valid();
  delete missing.individualFoodItems;

  const extra = {...valid(), unexpected: true};

  assert.throws(
    () => parse(missing),
    /INVALID_INDIVIDUAL_PACKAGE_DRAFT/
  );

  assert.throws(
    () => parse(extra),
    /INVALID_INDIVIDUAL_PACKAGE_DRAFT/
  );
});

test("rejects malformed serving prices and quantities", () => {
  const badPrice = valid();
  badPrice.individualFoodItems[0].servingOptions[0].priceCentavos = 99.5;

  const badQuantity = valid();
  badQuantity.individualFoodItems[0].servingOptions[0].minimumQuantity = 5;

  assert.throws(() => parse(badPrice));
  assert.throws(() => parse(badQuantity));
});

test("rejects an empty individual product", () => {
  const value = valid();
  value.individualFoodItems = [];

  assert.throws(() => parse(value));
});

test("rejects unsafe object shapes and accessors", () => {
  assert.throws(() => parse(null));
  assert.throws(() => parse([]));

  const value = valid();
  Object.defineProperty(value, "price", {
    enumerable: true,
    get() {
      throw new Error("GETTER_EXECUTED");
    },
  });

  assert.throws(
    () => parse(value),
    /INVALID_INDIVIDUAL_PACKAGE_DRAFT/
  );
});