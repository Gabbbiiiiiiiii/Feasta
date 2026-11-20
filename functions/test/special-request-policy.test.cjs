const assert = require("node:assert/strict");
const test = require("node:test");

const {
  nextSpecialRequestStatus,
  specialRequestPackageSubtotal,
  dropOffSpecialRequestUnitPrice, isDropOffSpecialRequest, specialOfferTotalIsValid,
} = require("../lib/bookings/special-request-policy.js");

test("only the correct actor can advance a request to the next status", () => {
  assert.equal(nextSpecialRequestStatus("pending_review", "provider", "sendQuotation", 1), "quotation_sent");
  assert.equal(nextSpecialRequestStatus("pending_review", "customer", "sendQuotation", 1), null);
  assert.equal(nextSpecialRequestStatus("pending_review", "provider", "__proto__", 1), null);
  assert.equal(nextSpecialRequestStatus("quotation_accepted", "system", "convert", 1), "converted_to_booking");
  assert.equal(nextSpecialRequestStatus("converted_to_booking", "system", "convert", 1), null);
});

test("customer quotation responses require the latest unexpired version", () => {
  const quote = {latest: 2, submitted: 2, expiresAtMs: 100};
  assert.equal(nextSpecialRequestStatus("quotation_sent", "customer", "accept", 99, quote), "quotation_accepted");
  assert.equal(nextSpecialRequestStatus("quotation_sent", "customer", "accept", 100, quote), null);
  assert.equal(nextSpecialRequestStatus("quotation_sent", "customer", "accept", 99, {...quote, submitted: 1}), null);
  assert.equal(nextSpecialRequestStatus("quotation_sent", "customer", "requestRevision", 99, quote), "revision_requested");
  assert.equal(nextSpecialRequestStatus("quotation_sent", "customer", "decline", 99, quote), "declined");
});

test("package estimates use whole quantities and integer centavos", () => {
  assert.equal(specialRequestPackageSubtotal(150000, 10), 1500000);
  for (const invalid of [0, -1, 1.5, "10", 101, NaN]) {
    assert.equal(specialRequestPackageSubtotal(150000, invalid), null);
  }
  assert.equal(specialRequestPackageSubtotal(Number.MAX_SAFE_INTEGER, 2), null);
});

test("special requests require a priced Drop-Off catering option and a delivery address", () => {
  const pkg = {serviceOptions: {drop_off: {price: 1500}, full_service: {price: 2000}}};
  assert.equal(dropOffSpecialRequestUnitPrice(pkg, "catering"), 150000);
  assert.equal(dropOffSpecialRequestUnitPrice(pkg, "addon"), null);
  assert.equal(dropOffSpecialRequestUnitPrice({serviceOptions: {full_service: {price: 2000}}}, "catering"), null);
  assert.equal(dropOffSpecialRequestUnitPrice({serviceOptions: {drop_off: {price: 1500, enabled: false}}}, "catering"), null);
  const request = {serviceTier: "drop_off", eventEndTime: null, address: "Ormoc City"};
  assert.ok(isDropOffSpecialRequest(request));
  assert.ok(isDropOffSpecialRequest({...request, fulfillment: "delivery"}));
  assert.ok(!isDropOffSpecialRequest({...request, fulfillment: "pickup"}));
  assert.ok(!isDropOffSpecialRequest({...request, serviceTier: "buffet_setup"}));
  assert.ok(!isDropOffSpecialRequest({...request, address: " "}));
});

test("new offer totals include delivery and historical fee-bearing totals remain valid", () => {
  const subtotal = specialRequestPackageSubtotal(150000, 7);
  assert.equal(subtotal, 1050000);
  const current = {subtotalInCentavos: subtotal, totalInCentavos: subtotal, deliveryIncluded: true};
  assert.ok(specialOfferTotalIsValid(current));
  assert.ok(!specialOfferTotalIsValid({...current, feeInCentavos: 50000, totalInCentavos: 1100000}));
  assert.ok(specialOfferTotalIsValid({subtotalInCentavos: subtotal, feeInCentavos: 50000, totalInCentavos: 1100000}));
});
