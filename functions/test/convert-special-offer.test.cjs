const assert = require("node:assert/strict");
const test = require("node:test");
const {initializeApp} = require("firebase-admin/app");
const {Timestamp} = require("firebase-admin/firestore");
initializeApp({projectId: "demo-special-offer"});
const {db} = require("../lib/shared/firestore.js");
const {resolveBookingRefundPolicies, classifyProviderRequestRefundPolicyEvidence} =
  require("../lib/bookings/booking-refund-policy.js");
const {convertSpecialOfferToBooking} = require("../lib/bookings/convert-special-offer.js");
const {checkoutEligibilityReason} = require("../lib/payments/payment-lifecycle.js");
const {requireInitialPaymentHold} = require("../lib/payments/initial-payment-reservation.js");
const {buildProviderRequestFinancialSnapshot} = require("../lib/provider-requests/provider-request-financial-snapshot.js");
const {providerPaymentObligationForChoice} = require("../lib/payments/payment-obligation.js");
const {createPayMongoCheckout} = require("../lib/payments/paymongo-client.js");
const {buildSuccessfulPaymentFinancialAllocation, DEFAULT_PROVIDER_VAT_RATE_BPS, inclusiveTaxComponent} =
  require("../lib/payments/financial-ledger-domain.js");

async function convertFixture(maintenance, deliveryIncluded = false, quotedPricing, refund = {}) {
  const now = Date.now();
  const eventDate = new Date(now + 10 * 86400000).toISOString().slice(0, 10);
  const eventStart = Date.parse(eventDate + "T11:30:00+08:00");
  const reference = db.doc("specialRequests/special_request_test");
  const providerRef = db.doc("providers/provider_test");
  const offer = {version: 1, quantity: 5, subtotalInCentavos: 750000,
    ...(deliveryIncluded ? {deliveryIncluded: true, totalInCentavos: 750000} :
      {feeInCentavos: 50000, totalInCentavos: 800000}), expiresAtMs: now + 3600000};
  if (quotedPricing) offer.pricing = quotedPricing;
  const records = {
    "packages/package_test": {providerId: providerRef.id, isActive: true, isPublished: true,
      serviceCategoryCode: "catering_service", paymentTermsSchemaVersion: 2,
      paymentPolicy: "deposit_then_balance", depositPercentage: 30, downPaymentPercentage: 30,
      balanceDueDaysBeforeEvent: null, balanceDueHoursBeforeEvent: 24},
    "users/provider_owner": {role: "provider", providerId: providerRef.id, accountStatus: "active", isActive: true},
    "providerPaymentAccounts/provider_test": {schemaVersion: 1, providerId: providerRef.id,
      ownerId: "provider_owner", linkedAccountType: "merchant", paymongoAccountId: "org_test",
      setupStatus: "ready", payoutReady: true},
    "maintenanceControls/intake": maintenance,
    "appSettings/refundPolicyBookingAgreement": refund.rollout,
    "serviceCategories/catering_service": {code: "catering_service", name: "Catering", serviceType: "catering", status: "active"},
  };
  const writes = new Map();
  const tx = {
    get: async ref => ref.path ? {id: ref.id, exists: Boolean(records[ref.path]), data: () => records[ref.path]} : {docs: []},
    create: (ref, data) => {assert.ok(!writes.has(ref.path)); writes.set(ref.path, data);},
    update: (ref, data) => writes.set(ref.path, data),
    set: (ref, data) => writes.set(ref.path, data),
  };
  const conversion = convertSpecialOfferToBooking({
    tx, reference, providerRef, now, eventStart,
    policyAcknowledgements: refund.acknowledgements,
    provider: {ownerId: "provider_owner", verificationStatus: "approved", isActive: true,
      refundPolicy: refund.policy,
      providerServiceType: "catering", providerCategory: "catering_service", bookingLeadTimeDays: 0,
      minGuestsPerEvent: 20, maxGuestsPerEvent: 100, maxEventsPerDay: 1,
      operatingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]},
    holds: {[reference.id]: {date: eventDate, expiresAtMs: offer.expiresAtMs}},
    row: {customerId: "customer_test", providerId: providerRef.id, providerName: "Test Catering",
      packageId: "package_test", packageName: "Wedding catering", priceOffer: offer,
      eventDate, eventTime: "11:30", eventEndTime: null, serviceTier: "drop_off", address: "Ormoc City"},
  });
  return {conversion, writes, reference, providerRef, now};
}

test("required refund policy blocks missing or stale consent and captures current consent", async () => {
  const maintenance = {schemaVersion: 1, revision: 1, intake: false, publication: false};
  const rollout = {schemaVersion: 1, isPublic: false, enforcementMode: "required"};
  const policy = {
    schemaVersion: 1, policyVersion: 1, terms: null, effectiveAt: Timestamp.now(),
    rules: ["preparation_not_started", "preparation_started", "service_started"]
      .map((stage, index) => ({stage, refundBasisPoints: 10000 - index * 5000})),
  };
  const providerId = "provider_test";
  const current = resolveBookingRefundPolicies([{
    providerId, providerName: "Test Catering", providerData: {refundPolicy: policy},
  }]).get(providerId).effective.effectivePolicyKey;
  for (const acknowledgements of [undefined, [{providerId, effectivePolicyKey: "stale"}]]) {
    const {conversion, writes} = await convertFixture(maintenance, true, undefined, {rollout, policy, acknowledgements});
    await assert.rejects(conversion, error =>
      ["REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED", "REFUND_POLICY_CHANGED"].includes(error.details?.reason));
    assert.equal(writes.size, 0);
  }
  const {conversion, writes} = await convertFixture(maintenance, true, undefined, {
    rollout, policy, acknowledgements: [{providerId, effectivePolicyKey: current}],
  });
  const {bookingId} = await conversion;
  const booking = writes.get("mainEvents/" + bookingId);
  const request = writes.get("providerRequests/" + booking.providerRequestIds[0]);
  assert.equal(classifyProviderRequestRefundPolicyEvidence(request).status, "policy_backed");
  assert.equal(request.refundPolicyAgreement.policyKey, current);
  assert.equal(request.status, "waiting_for_down_payment");
});

test("a five-package offer creates one unpaid booking with its exact price and payment hold", async () => {
  const {conversion, writes, reference, providerRef, now} = await convertFixture({
    schemaVersion: 1, revision: 1, intake: false, publication: false,
  });
  const result = await conversion;
  const booking = writes.get("mainEvents/" + result.bookingId);
  const request = writes.get("providerRequests/" + booking.providerRequestIds[0]);
  assert.equal(writes.get(reference.path).status, "converted_to_booking");
  assert.deepEqual(writes.get(providerRef.path).specialOfferHolds, {});
  assert.equal(booking.status, "waiting_for_down_payment");
  assert.equal(request.status, "waiting_for_down_payment");
  assert.equal(request.confirmedAt, null);
  assert.equal(request.paymentStatus, "unpaid");
  assert.equal(request.acceptedSpecialOffer.quantity, 5);
  assert.equal(request.financialSnapshot.grossAmountInCentavos, 800000);
  assert.equal(request.financialSnapshot.requiredUpfrontAmountInCentavos, 240000);
  assert.equal(checkoutEligibilityReason({providerRequest: request, mainEvent: booking, paymentChoice: "full"}), null);
  assert.doesNotThrow(() => requireInitialPaymentHold(request, new Date(now)));
  assert.throws(() => requireInitialPaymentHold(request, request.expiresAt.toDate()));
});

test("a new quote freezes verified tax and provider commission without changing gateway charges", async t => {
  const pricing = buildProviderRequestFinancialSnapshot({
    providerId: "provider_test", providerOwnerId: "provider_owner",
    providerRequest: {amount: 7500, downPaymentAmount: 7500, remainingBalance: 0},
    platformSettings: {platformCommissionRateBps: 300},
    providerTaxProfile: {providerId: "provider_test", ownerId: "provider_owner",
      verificationStatus: "verified", taxType: "vat_registered"},
  });
  const {conversion, writes} = await convertFixture({
    schemaVersion: 1, revision: 1, intake: false, publication: false,
  }, true, pricing);
  const {bookingId} = await conversion;
  const booking = writes.get("mainEvents/" + bookingId);
  const {financialSnapshot} = writes.get("providerRequests/" + booking.providerRequestIds[0]);
  assert.deepEqual(booking.acceptedSpecialOffer.pricing, pricing);
  assert.equal(financialSnapshot.providerTaxType, "vat_registered");
  assert.equal(financialSnapshot.platformCommissionTotalInCentavos, 22500);
  const gatewayAmounts = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    gatewayAmounts.push(JSON.parse(init.body).data.attributes.line_items[0].amount);
    return Response.json({data: {id: "cs_test", attributes: {checkout_url: "https://checkout.paymongo.com/test"}}});
  });
  for (const paymentChoice of ["minimum", "full"]) {
    const {amountInCentavos} = providerPaymentObligationForChoice({financialSnapshot, paymentChoice});
    await createPayMongoCheckout({
      secretKey: "sk_test_fixture", idempotencyKey: paymentChoice, paymentId: paymentChoice,
      bookingId, providerRequestId: booking.providerRequestIds[0], customerId: "customer_test",
      amountInCentavos, currency: "PHP", description: "Drop-Off catering",
      successUrl: "https://example.com/success", cancelUrl: "https://example.com/cancel",
    });
  }
  assert.deepEqual(gatewayAmounts, [225000, 750000]);
  assert.equal(financialSnapshot.remainingBalanceInCentavos, 525000);
  const allocation = buildSuccessfulPaymentFinancialAllocation({
    providerRequest: {financialSnapshot, grossSettledAmountInCentavos: 0},
    paymentAmountInCentavos: gatewayAmounts[1],
  });
  assert.equal(allocation.providerVatForPaymentInCentavos,
    inclusiveTaxComponent(750000, DEFAULT_PROVIDER_VAT_RATE_BPS));
  assert.equal(allocation.commissionAccruedForPaymentInCentavos, 22500);
});


for (const [name, control] of [
  ["missing", undefined],
  ["paused", {schemaVersion: 1, revision: 1, intake: true, publication: false}],
]) {
  test(`a ${name} intake control blocks offer conversion without booking or hold writes`, async () => {
    const {conversion, writes} = await convertFixture(control);
    await assert.rejects(conversion, error => error.code === "unavailable" &&
      error.details.scope === "intake" && error.message.startsWith("Booking creation is temporarily unavailable."));
    assert.equal(writes.size, 0);
  });
}


test("a new all-inclusive offer converts at the package subtotal without a separate charge", async () => {
  const {conversion, writes} = await convertFixture({
    schemaVersion: 1, revision: 1, intake: false, publication: false,
  }, true);
  const result = await conversion;
  const booking = writes.get("mainEvents/" + result.bookingId);
  assert.equal(booking.totalAmount, 7500);
  assert.equal(booking.acceptedSpecialOffer.deliveryIncluded, true);
  assert.equal(Object.hasOwn(booking.acceptedSpecialOffer, "feeInCentavos"), false);
  assert.equal(booking.status, "waiting_for_down_payment");
});
