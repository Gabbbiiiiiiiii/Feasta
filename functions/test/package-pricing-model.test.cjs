const assert = require("node:assert/strict");
const test = require("node:test");
const {calculatePackageSubtotal, resolveBookingPackageOffer, rejectClientBookingFinancialAuthority} = require("../lib/bookings/booking-package-offer.js");
const {parsePackageInput, assertPackagePublishable} = require("../lib/packages/package-domain.js");
const {validateBookingPackage} = require("../lib/bookings/booking-contract.js");
const {buildPackagePaymentTermsSnapshot} = require("../lib/payments/package-payment-terms.js");
const {buildProviderRequestFinancialSnapshot} = require("../lib/provider-requests/provider-request-financial-snapshot.js");
const base = {
  name: "Celebration catering", description: "Complete celebration catering menu", eventType: "birthday",
  price: 100.25, minimumGuests: 10, maximumGuests: 100,
  paymentPolicy: "full_payment", depositPercentage: 100,
  foodInclusions: ["Chicken: Provider dish"],
};
test("per pax uses integer centavos across validated guest range", () => {
  const data = {...base, pricingModel: "per_pax"};
  assert.equal(calculatePackageSubtotal(data, 100.25, 10), 1002.5);
  assert.equal(calculatePackageSubtotal(data, 100.25, 100), 10025);
  for (const count of [9, 101, 10.5, undefined, NaN]) assert.throws(() => calculatePackageSubtotal(data, 100.25, count));
  assert.throws(() => calculatePackageSubtotal(data, 1.001, 10));
  assert.throws(() => calculatePackageSubtotal(data, 10_000_000, 10));
});
test("bundle is fixed throughout capacity, legacy remains fixed without guest count", () => {
  for (const count of [10, 50, 100]) assert.equal(calculatePackageSubtotal({...base, pricingModel: "per_bundle"}, 100.25, count), 100.25);
  assert.equal(calculatePackageSubtotal(base, 100.25), 100.25);
  assert.throws(() => calculatePackageSubtotal({...base, pricingModel: "other"}, 100.25, 10));
});
test("trusted selected service tier determines per pax subtotal", () => {
  const data = {...base, pricingModel: "per_pax", serviceOptions: {
    drop_off: {price: 100.25, includedServices: ["Delivery"]},
    full_service: {price: 200.55, includedServices: ["Staff"]},
  }};
  for (const [serviceTier, expected] of [["drop_off", 1002.5], ["full_service", 2005.5]]) {
    assert.equal(resolveBookingPackageOffer({packageData: data, serviceTier, guestCount: 10, packageThemeId: null}).basePrice, expected);
  }
  assert.throws(() => resolveBookingPackageOffer({packageData: data, serviceTier: "buffet_setup", guestCount: 10, packageThemeId: null}));
  assert.throws(() => rejectClientBookingFinancialAuthority({total: 1}));
});
test("model validation, inclusions, and publication compatibility gate", () => {
  for (const pricingModel of ["per_pax", "per_bundle"]) {
    assert.equal(parsePackageInput({...base, pricingModel}).pricingModel, pricingModel);
    assert.deepEqual(parsePackageInput({...base, pricingModel}).foodInclusions, base.foodInclusions);
    assert.throws(() => assertPackagePublishable({...base, pricingModel}), /draft-only/);
  }
  assert.equal(parsePackageInput(base).pricingModel, undefined);
  assert.doesNotThrow(() => assertPackagePublishable(base));
  for (const pricingModel of [null, "", "PER_PAX", 10]) assert.throws(() => parsePackageInput({...base, pricingModel}));
  assert.throws(() => parsePackageInput({...base, pricingModel: "per_pax", price: 1.001}));
});

test("publication compatibility gate also rejects direct bookings", () => {
  const packageData = {...base, providerId: "provider", status: "published", isActive: true,
    isPublished: true, providerPubliclyVisible: true};
  for (const pricingModel of ["per_pax", "per_bundle"]) {
    assert.equal(validateBookingPackage({packageData: {...packageData, pricingModel},
      expectedProviderId: "provider", submittedEventType: "birthday", guestCount: 10}).valid, false);
  }
  assert.equal(validateBookingPackage({packageData, expectedProviderId: "provider",
    submittedEventType: "birthday", guestCount: 10}).valid, true);
});

test("calculated package amounts preserve deposit and full-payment financial snapshots", () => {
  for (const pricingModel of ["per_pax", "per_bundle"]) {
    const amount = calculatePackageSubtotal({...base, pricingModel}, 100.25, 10);
    for (const percentage of [30, 100]) {
      const terms = buildPackagePaymentTermsSnapshot({paymentPolicy: percentage === 100 ? "full_payment" : "deposit_then_balance",
        depositPercentage: percentage, downPaymentPercentage: percentage,
        balanceDueDaysBeforeEvent: percentage === 100 ? null : 7});
      const upfrontCents = Math.round(Math.round(amount * 100) * percentage / 100);
      const remainingCents = Math.round(amount * 100) - upfrontCents;
      const snapshot = buildProviderRequestFinancialSnapshot({providerId: "provider", providerOwnerId: "owner",
        providerRequest: {amount, downPaymentAmount: upfrontCents / 100,
          remainingBalance: remainingCents / 100, packagePaymentTerms: terms},
        platformSettings: null, providerTaxProfile: null});
      assert.equal(snapshot.grossAmountInCentavos, Math.round(amount * 100));
      assert.equal(snapshot.requiredUpfrontAmountInCentavos, upfrontCents);
      assert.equal(snapshot.remainingBalanceInCentavos, remainingCents);
    }
  }
});
