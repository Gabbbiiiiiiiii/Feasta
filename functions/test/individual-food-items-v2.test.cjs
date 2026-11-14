const {test} = require("node:test");
const assert = require("node:assert/strict");

const {parseIndividualFoodItemsV2: parse} =
  require("../lib/packages/individual-food-items-v2.js");

function valid() {
  return [{
    id: "pancit",
    name: "Pancit Canton Bilao",
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
        priceCentavos: 295000,
        minimumQuantity: 1,
        maximumQuantity: 2,
      },
    ],
  }];
}

test("accepts valid serving sizes", () => {
  const result = parse(valid());
  assert.equal(result[0].servingOptions.length, 2);
  assert.equal(result[0].servingOptions[0].priceCentavos, 185000);
});

test("accepts an empty collection", () => {
  assert.deepEqual(parse([]), []);
});

test("rejects missing serving options", () => {
  const data = valid();
  data[0].servingOptions = [];
  assert.throws(() => parse(data));
});

test("rejects reversed serving range", () => {
  const data = valid();
  data[0].servingOptions[0].minimumServings = 11;
  assert.throws(() => parse(data));
});

test("rejects invalid quantities", () => {
  for (const n of [0, -1, 1.5, 101, NaN]) {
    const data = valid();
    data[0].servingOptions[0].maximumQuantity = n;
    assert.throws(() => parse(data));
  }
});

test("rejects invalid centavo prices", () => {
  for (const n of [0, -1, 10.5, Infinity, 1000000001]) {
    const data = valid();
    data[0].servingOptions[0].priceCentavos = n;
    assert.throws(() => parse(data));
  }
});

test("rejects duplicate serving names", () => {
  const data = valid();
  data[0].servingOptions[1].name = " family size ";
  assert.throws(() => parse(data));
});

test("rejects duplicate item names", () => {
  const data = valid();
  data.push({
    ...data[0],
    id: "different",
    servingOptions: structuredClone(data[0].servingOptions),
  });
  assert.throws(() => parse(data));
});

test("rejects unknown fields", () => {
  const data = valid();
  data[0].servingOptions[0].clientPrice = 1;
  assert.throws(() => parse(data));
});

test("rejects oversized quantity subtotal", () => {
  const data = valid();
  data[0].servingOptions[0].priceCentavos = 900000000;
  assert.throws(() => parse(data));
});

test("rejects malformed IDs and labels", () => {
  const data = valid();
  data[0].id = "../other";
  assert.throws(() => parse(data));
  const second = valid();
  second[0].name = "Bad\nName";
  assert.throws(() => parse(second));
});

test("rejects corrupt object shapes", () => {
  assert.throws(() => parse(null));
  assert.throws(() => parse({}));
  const data = valid();
  data[0] = Object.create({id: "inherited"});
  assert.throws(() => parse(data));
});