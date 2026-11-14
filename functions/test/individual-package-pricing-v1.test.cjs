const test = require("node:test");
const assert = require("node:assert/strict");

const {
  prepareIndividualPackagePricingSnapshotV1: prepare,
} = require("../lib/packages/individual-package-pricing-v1.js");

function product() {
  return {
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
  };
}

test("preserves complete individual-item centavo pricing", () => {
  const original = product();
  const result = prepare([original]);

  assert.equal(result.pricingSchemaVersion, 1);
  assert.equal(result.offerStructure, "individual");
  assert.deepEqual(result.individualFoodItems, [original]);
  assert.equal(
    result.individualFoodItems[0].servingOptions[1].priceCentavos,
    295050
  );
  assert.equal(Object.hasOwn(result, "price"), false);
  assert.equal(Object.hasOwn(result, "pricingModel"), false);
});

test("produces a detached normalized pricing snapshot", () => {
  const source = [product()];
  const result = prepare(source);

  source[0].servingOptions[0].priceCentavos = 999;

  assert.equal(
    result.individualFoodItems[0].servingOptions[0].priceCentavos,
    185000
  );
});

test("rejects zero or multiple products", () => {
  assert.throws(
    () => prepare([]),
    /INVALID_INDIVIDUAL_FOOD_ITEMS/
  );
  assert.throws(
    () => prepare([product(), {...product(), id: "second", name: "Second"}]),
    /INVALID_INDIVIDUAL_FOOD_ITEMS/
  );
});

test("rejects incomplete serving information", () => {
  const input = product();
  input.servingOptions = [];

  assert.throws(
    () => prepare([input]),
    /INVALID_INDIVIDUAL_FOOD_ITEMS/
  );
});

test("rejects an invalid centavo price", () => {
  const input = product();
  input.servingOptions[0].priceCentavos = 100.5;

  assert.throws(
    () => prepare([input]),
    /INVALID_INDIVIDUAL_FOOD_ITEMS/
  );
});

test("rejects a quantity subtotal exceeding the existing limit", () => {
  const input = product();
  input.servingOptions[0].priceCentavos = 1000000000;
  input.servingOptions[0].maximumQuantity = 2;

  assert.throws(
    () => prepare([input]),
    /INVALID_INDIVIDUAL_FOOD_ITEMS/
  );
});

test("rejects malformed or extra fields", () => {
  const input = product();
  input.servingOptions[0].unexpected = "unsafe";

  assert.throws(
    () => prepare([input]),
    /INVALID_INDIVIDUAL_FOOD_ITEMS/
  );
});

test("rejects missing individual-item data", () => {
  assert.throws(
    () => prepare(undefined),
    /INVALID_INDIVIDUAL_FOOD_ITEMS/
  );
});