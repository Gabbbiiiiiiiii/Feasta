const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBookingPaymentAgreement,
  bookingPaymentAgreementDisclosure,
  assertBookingPaymentAgreementAcknowledgements,
} = require(
  "../lib/bookings/booking-payment-agreement.js",
);
const {rejectClientBookingFinancialAuthority} = require("../lib/bookings/booking-package-offer.js");
const base = () => ({customerId: "customer_test", providerId: "provider_test", providerName: "Maria's Catering", serviceNames: [
  "Birthday Buffet Package",
],
serviceTierLabel:
  "Buffet Setup",
  selection: {packageId: "package_test", serviceTier: "buffet_setup"}, eventStartAt: new Date("2026-10-16T18:00:00+08:00"),
  eventEndTime: "20:00", grossAmountInCentavos: 1000000, requiredUpfrontAmountInCentavos: 500000,
  depositEligible: true, paymentPolicy: {policyKey: "current", schemaVersion: 3}, refundPolicy: {policyKey: "refund_current"}});
const ack = agreement => ({providerId: agreement.providerId, agreementKey: agreement.agreementKey});
test("server agreement discloses exact timing, deposit and default allocation", () => {
  const agreement = buildBookingPaymentAgreement(base());
  assert.equal(
  agreement.depositEligibilityCutoffAt,
  "2026-10-13T10:00:00.000Z",
);

assert.deepEqual(
  agreement.serviceNames,
  ["Birthday Buffet Package"],
);

assert.equal(
  agreement.serviceTierLabel,
  "Buffet Setup",
);
  assert.equal(agreement.schemaVersion, 1);
  assert.equal(agreement.remainingBalanceDueAt, "2026-10-14T10:00:00.000Z");
  assert.equal(agreement.hardPaymentDeadlineAt, "2026-10-15T10:00:00.000Z");
  assert.equal(agreement.preparationStartsAt, agreement.hardPaymentDeadlineAt);
  assert.equal(agreement.paymentDefaultAllocation.customerDefaultRefundAmountInCentavos, 350000);
  assert.equal(agreement.paymentDefaultAllocation.providerReservationCompAmountInCentavos, 100000);
  assert.equal(agreement.paymentDefaultAllocation.feastaCancellationFeeAmountInCentavos, 50000);
  assert.deepEqual(buildBookingPaymentAgreement(base()), agreement);
});
test("full-only disclosure contains no unpaid balance or hypothetical default refund", () => {
  const agreement = buildBookingPaymentAgreement({...base(), depositEligible: false});
  assert.equal(agreement.requiredUpfrontAmountInCentavos, 1000000);
  assert.equal(agreement.remainingBalanceInCentavos, 0);
  assert.equal(agreement.paymentDefaultAllocation, null);
});
test("odd centavo allocation matches backend and balances exactly", () => {
  const agreement = buildBookingPaymentAgreement({...base(), requiredUpfrontAmountInCentavos: 500001});
  const allocation = agreement.paymentDefaultAllocation;
  assert.equal(allocation.customerDefaultRefundAmountInCentavos + allocation.providerReservationCompAmountInCentavos +
    allocation.feastaCancellationFeeAmountInCentavos, 500001);
});
test("acknowledgement required and cannot carry authoritative values", () => {
  const agreement = buildBookingPaymentAgreement(base());
  for (const value of [undefined, [], [{...ack(agreement), customerRefundRateBps: 10000}]]) {
    assert.throws(() => assertBookingPaymentAgreementAcknowledgements([agreement], value), error => error.details.reason === "BOOKING_PAYMENT_AGREEMENT_REQUIRED");
  }
  assert.doesNotThrow(() => assertBookingPaymentAgreementAcknowledgements([agreement], [ack(agreement)]));
});
test("material price, schedule, service, provider, eligibility and policy changes invalidate key", () => {
  const old = buildBookingPaymentAgreement(base());
  for (const patch of [{grossAmountInCentavos: 1000100}, {eventStartAt: new Date("2026-10-17T18:00:00+08:00")},
    {providerId: "provider_other"}, {selection: {packageId: "another_package"}}, {depositEligible: false},
    {paymentPolicy: {policyKey: "new"}}, {refundPolicy: {policyKey: "new"}}]) {
    const current = buildBookingPaymentAgreement({...base(), ...patch});
    assert.notEqual(old.agreementKey, current.agreementKey);
    assert.throws(() => assertBookingPaymentAgreementAcknowledgements([current], [ack(old)]), error => error.details.reason === "BOOKING_PAYMENT_AGREEMENT_CHANGED");
  }
});
test("every independent provider agreement is required exactly once", () => {
  const agreements = [buildBookingPaymentAgreement(base()), buildBookingPaymentAgreement({...base(), providerId: "provider_addon", depositEligible: false})];
  assert.doesNotThrow(() => assertBookingPaymentAgreementAcknowledgements(agreements, agreements.map(ack).reverse()));
  assert.throws(() => assertBookingPaymentAgreementAcknowledgements(agreements, [ack(agreements[0]), ack(agreements[0])]));
});
test("browser financial authority injection remains rejected", () => {
  for (const field of ["customerRefundRateBps", "providerReservationCompRateBps", "feastaCancellationFeeRateBps", "customerDefaultRefundAmountInCentavos",
    "hardPaymentDeadlineAt", "remainingBalanceDueAt", "preparationStartsAt", "depositEligible", "financialSnapshot", "bookingPaymentAgreement"]) {
    assert.throws(() => rejectClientBookingFinancialAuthority({[field]: 1}));
  }
});
test(
  "customer disclosure excludes internal agreement authority",
  () => {
    const agreement =
      buildBookingPaymentAgreement(
        base(),
      );

    const disclosure =
      bookingPaymentAgreementDisclosure(
        agreement,
      );

    assert.equal(
      disclosure.depositEligibilityCutoffAt,
      "2026-10-13T10:00:00.000Z",
    );

    assert.deepEqual(
      disclosure.serviceNames,
      [
        "Birthday Buffet Package",
      ],
    );

    assert.equal(
      disclosure.serviceTierLabel,
      "Buffet Setup",
    );

    for (const field of [
      "customerId",
      "selection",
      "paymentPolicy",
      "refundPolicy",
      "lifecyclePolicy",
      "eventEndTime",
      "channel",
    ]) {
      assert.equal(
        field in disclosure,
        false,
      );
    }
  },
);
