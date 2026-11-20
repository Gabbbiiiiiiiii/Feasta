const test = require("node:test");
const assert = require("node:assert/strict");

// Import only the Firebase-free pricing contract.
// Do not initialize Firebase Admin or import callable entrypoints.
const {
  individualCanonicalPricingFromProgress: convert,
} = require("../lib/packages/individual-package-draft-write-v1.js");

function progress() {
  return {
    offerStructure: "individual",
    individualFoodDraft: {
      id: "pancit",
      name: "Pancit Bilao",
      servingOptions: [
        {
          id: "family",
          name: "Family Size",
          minimumServingsText: "8",
          maximumServingsText: "10",
          priceText: "1850.00",
          minimumQuantityText: "1",
          maximumQuantityText: "3",
        },
        {
          id: "party",
          name: "Party Size",
          minimumServingsText: "15",
          maximumServingsText: "20",
          priceText: "2950.50",
          minimumQuantityText: "1",
          maximumQuantityText: "2",
        },
      ],
    },
  };
}

test("preserves exact centavos from private editor text", () => {
  const result = convert(progress());

  assert.equal(result.offerStructure, "individual");
  assert.equal(result.pricingSchemaVersion, 1);
  assert.equal(result.individualFoodItems.length, 1);

  const options = result.individualFoodItems[0].servingOptions;

  assert.equal(options[0].priceCentavos, 185000);
  assert.equal(options[1].priceCentavos, 295050);
  assert.equal(options[0].maximumQuantity, 3);
  assert.equal(options[1].maximumServings, 20);

  assert.equal(Object.hasOwn(result, "price"), false);
  assert.equal(Object.hasOwn(result, "pricingModel"), false);
});

test("rejects fractional-centavo price", () => {
  const input = progress();
  input.individualFoodDraft.servingOptions[0].priceText = "1850.001";

  assert.throws(
    () => convert(input),
    /INVALID_INDIVIDUAL_PACKAGE_DRAFT/
  );
});

test("rejects invalid quantity range", () => {
  const input = progress();
  input.individualFoodDraft.servingOptions[0].minimumQuantityText = "4";

  assert.throws(() => convert(input));
});

test("rejects reversed serving range", () => {
  const input = progress();
  input.individualFoodDraft.servingOptions[0].maximumServingsText = "2";

  assert.throws(() => convert(input));
});

test("rejects incomplete serving options", () => {
  const input = progress();
  input.individualFoodDraft.servingOptions = [];

  assert.throws(() => convert(input));
});

test("accepts validated individualFoodItems", () => {
  const original = convert(progress());

  const restored = convert({
    offerStructure: "individual",
    individualFoodItems: original.individualFoodItems,
  });

  assert.deepEqual(restored, original);
});

test("rejects conflicting pricing representations", () => {
  const input = progress();
  input.individualFoodItems = convert(input).individualFoodItems;

  assert.throws(() => convert(input));
});

test("rejects non-individual progress", () => {
  const input = progress();
  input.offerStructure = "fixed";

  assert.throws(() => convert(input));
});

test("rejects invalid text numbers", () => {
  const input = progress();
  input.individualFoodDraft.servingOptions[0].priceText = "1e3";

  assert.throws(() => convert(input));
});

test("rejects accessor-based progress", () => {
  const input = progress();
  Object.defineProperty(input, "individualFoodDraft", {
    enumerable: true,
    get() {
      throw new Error("GETTER_EXECUTED");
    },
  });

  assert.throws(
    () => convert(input),
    /INVALID_INDIVIDUAL_PACKAGE_DRAFT/
  );
});