const assert = require("node:assert/strict");
const test = require("node:test");
const {Timestamp} = require("firebase-admin/firestore");
const {cancellationPaymentState} = require("../lib/cancellations/cancellation-payment-state.js");

const request = {status: "confirmed", paymentStatus: "paid", downPaymentAmount: 500};
const payment = {status: "paid", paidAt: Timestamp.now()};

test("paid cancellations require a settled trusted payment and timestamp", () => {
  assert.equal(cancellationPaymentState(request, payment), "ready");
  for (const invalid of [null, {status: "paid"}, {status: "failed"}, {status: "processing"}]) {
    assert.throws(() => cancellationPaymentState(request, invalid),
      (error) => error.details?.reason === "CANCELLATION_PAYMENT_RESOLUTION_REQUIRED");
  }
});

test("refunded and reserved payments cannot open another cancellation", () => {
  for (const fields of [
    {status: "refunded"}, {status: "partially_refunded"},
    {refundReservedAmountInCentavos: 1}, {refundedAmountInCentavos: 1},
    {refundStatus: "processing"}, {refundStatus: "requested"},
    {refundStatus: "completed"}, {refundExecutionLock: "operation"},
  ]) {
    assert.equal(cancellationPaymentState(request, {...payment, ...fields}), "refund_ineligible");
  }
});

test("in-flight checkout remains a payment-resolution cancellation request", () => {
  assert.equal(cancellationPaymentState({status: "payment_processing"}, {status: "processing"}),
    "awaiting_payment_resolution");
  assert.equal(cancellationPaymentState({status: "waiting_for_down_payment"}, {status: "pending"}),
    "awaiting_payment_resolution");
  assert.throws(() => cancellationPaymentState({status: "payment_processing"}, null));
  assert.equal(cancellationPaymentState({status: "waiting_for_down_payment"}, null), "ready");
});
