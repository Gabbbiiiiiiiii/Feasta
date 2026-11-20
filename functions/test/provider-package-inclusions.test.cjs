const assert = require("node:assert/strict");
const test = require("node:test");
const {parsePackageInput, assertPackagePublishable} = require("../lib/packages/package-domain.js");

const input = {
  name: "Birthday package", description: "A birthday celebration package.",
  eventType: "birthday", price: 10000, downPaymentPercentage: 20,
  minimumGuests: 10, maximumGuests: 50, imageUrl: "",
  foodInclusions: [], decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
};

test("empty inclusion groups are publishable and remain empty arrays", () => {
  assert.doesNotThrow(() => assertPackagePublishable(input));
  for (const field of ["foodInclusions", "decorInclusions", "furnitureInclusions", "serviceInclusions"]) {
    assert.deepEqual(parsePackageInput(input)[field], []);
    assert.deepEqual(parsePackageInput({...input, [field]: undefined})[field], []);
  }
});

for (const field of ["foodInclusions", "decorInclusions", "furnitureInclusions", "serviceInclusions"]) {
  test(`${field} retains normalization and publish-time validation`, () => {
    const populated = {...input, [field]: ["  Included item  ", "Included item", "Another item"]};
    assert.doesNotThrow(() => assertPackagePublishable(populated));
    assert.deepEqual(parsePackageInput(populated)[field], ["Included item", "Another item"]);
    assert.doesNotThrow(() => assertPackagePublishable({...input, [field]: ["x".repeat(160)]}));
    assert.doesNotThrow(() => assertPackagePublishable({...input, [field]: Array.from({length: 50}, (_, i) => `Item ${i}`)}));
    for (const invalid of ["not an array", {}, [123], [null], [" "], ["x".repeat(161)], Array(51).fill("Item")]) {
      assert.throws(() => assertPackagePublishable({...input, [field]: invalid}), {code: "invalid-argument"});
    }
  });
}

test("optional inclusions do not bypass required package field validation", () => {
  for (const invalid of [
    {name: ""}, {description: "short"}, {eventType: "unsupported"},
    {price: -1}, {price: NaN}, {downPaymentPercentage: 101},
    {minimumGuests: 0}, {maximumGuests: 0}, {minimumGuests: 51},
    {maximumGuests: 10.5},
  ]) assert.throws(() => assertPackagePublishable({...input, ...invalid}), {code: "invalid-argument"});
});
