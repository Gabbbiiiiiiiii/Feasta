const assert = require("node:assert/strict");
const {test} = require("node:test");
const {readFileSync} = require("node:fs");
const {runInNewContext} = require("node:vm");
const {transpile} = require("typescript");
const {HttpsError} = require("firebase-functions/v2/https");
const {parseCanonicalPackageWrite, assertPackagePublishable} = require("../lib/packages/package-domain.js");
const {parsePackageClassification} = require("../lib/packages/package-classification.js");

const input = {
  name: "Busog Na Set - Bilao Package", description: "Eight included dishes for a birthday gathering.",
  offerStructure: "fixed", packageStyle: "Bilao Package", pricingModel: "per_bundle",
  eventType: "birthday", serviceCategoryCode: "catering_service", price: 1850,
  minimumGuests: 8, maximumGuests: 10, paymentPolicy: "full_payment", depositPercentage: 100,
  serviceOptions: {drop_off: {price: 1850, includedServices: ["Delivery"]}}, themeOptions: [],
  imageUrl: "", foodInclusions: ["Pasta/Noodles: Bam-e guisado", "Pork: Breaded porkchop",
    "Fish/Seafood: Calamari", "Fish/Seafood: Boneless bangus", "Appetizers: Shanghai rolls",
    "Chicken: Buffalo wings", "Chicken: Buttered chicken", "Desserts: 2 mango tapioca desserts"],
  decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
};

test("canonical Bilao draft preserves exact bundle price, capacity, categorized menu and terms", () => {
  const parsed = parseCanonicalPackageWrite(input);
  assert.deepEqual(parsePackageClassification(input), {offerStructure: "fixed", packageStyle: "Bilao Package"});
  assert.equal(parsed.price, 1850);
  assert.equal(parsed.pricingModel, "per_bundle");
  assert.equal(parsed.minimumGuests, 8);
  assert.equal(parsed.maximumGuests, 10);
  assert.deepEqual(parsed.foodInclusions, input.foodInclusions);
  assert.deepEqual(parsed.serviceOptions, input.serviceOptions);
  assert.equal(parsed.paymentPolicy, "full_payment");
  assert.equal(parsed.depositPercentage, 100);
  assert.throws(() => assertPackagePublishable(input), /draft-only/);
});

test("existing Per Pax writes retain their explicit pricing model", () => {
  const parsed = parseCanonicalPackageWrite({...input, pricingModel: "per_pax", price: 185.50,
    serviceOptions: {drop_off: {price: 185.50, includedServices: []}}});
  assert.equal(parsed.price, 185.50);
  assert.equal(parsed.pricingModel, "per_pax");
});

for (const operation of ["create", "update"]) {
  test(`${operation} accepts the exact legacy payload and rejects client lifecycle and V2 fields`, () => {
    const source = readFileSync(`${__dirname}/../src/packages/${operation}-provider-package.ts`, "utf8");
    // Execute the actual allowlist/rejection helper without initializing callable services.
    const allowed = source.match(/const ALLOWED_FIELDS = (\[[\s\S]*?\]) as const;/)[1];
    const helper = transpile(source.slice(source.indexOf("function rejectUnknownFields(")));
    const reject = runInNewContext(`${helper}\n(input) => rejectUnknownFields(input, ${allowed})`, {HttpsError});
    const payload = {...input, ...(operation === "update" ? {packageId: "bilao"} : {})};
    assert.doesNotThrow(() => reject(payload));
    for (const field of ["foodChoiceGroups", "status", "isPublished", "providerId", "occasionIds", "unknown"]) {
      assert.throws(() => reject({...payload, [field]: true}), (error) => error.code === "invalid-argument");
    }
    assert.match(source, /status: "draft"/);
    assert.match(source, /isActive: false/);
    assert.match(source, /isPublished: false/);
    assert.match(source, /providerPubliclyVisible:\s*false/);
  });
}
