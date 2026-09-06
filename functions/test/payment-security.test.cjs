const assert = require("node:assert/strict");
const {createHmac} = require("node:crypto");
const path = require("node:path");
const test = require("node:test");

const libRoot = process.env.FEASTA_FUNCTIONS_LIB_DIR ??
  path.resolve(__dirname, "../lib");

const {
  parsePayMongoPaymentEvent,
  validateTrustedPaymentUpdate,
  verifyPayMongoSignature,
} = require(path.join(libRoot, "payments/payment-security.js"));

const {
  canonicalPaymentLinkageReason,
  checkoutEligibilityReason,
  paymentIdForProviderRequest,
  validStoredCheckoutReason,
  webhookLifecycleConflictReason,
} = require(path.join(libRoot, "payments/payment-lifecycle.js"));
const {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_TRANSITIONS,
} = require(path.join(libRoot, "shared/constants.js"));

test("payment lifecycle includes partial-refund semantics", () => {
  assert.equal(PAYMENT_STATUSES.includes("partially_refunded"), true);
  assert.deepEqual(
    PAYMENT_STATUS_TRANSITIONS.paid,
    ["partially_refunded", "refunded"],
  );
  assert.deepEqual(
    PAYMENT_STATUS_TRANSITIONS.partially_refunded,
    ["refunded"],
  );
});

test("PayMongo signatures reject invalid, stale, and missing values", () => {
  const secret = "unit-test-webhook-secret";
  const rawBody = Buffer.from('{"data":{"id":"evt_1"}}');
  const timestamp = 1_800_000_000;
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  assert.equal(verifyPayMongoSignature({
    rawBody,
    signatureHeader: `t=${timestamp},te=${digest}`,
    secret,
    nowSeconds: timestamp,
  }), true);
  assert.equal(verifyPayMongoSignature({
    rawBody,
    signatureHeader: `t=${timestamp},te=invalid`,
    secret,
    nowSeconds: timestamp,
  }), false);
  assert.equal(verifyPayMongoSignature({
    rawBody,
    signatureHeader: `t=${timestamp},te=${digest}`,
    secret,
    nowSeconds: timestamp + 301,
  }), false);
});

test("trusted payment validation rejects amount, currency, and transition mismatches", () => {
  const base = {
    currentStatus: "processing",
    nextStatus: "paid",
    expectedAmountInCentavos: 1350000,
    actualAmountInCentavos: 1350000,
    expectedCurrency: "PHP",
    actualCurrency: "PHP",
  };
  assert.equal(validateTrustedPaymentUpdate(base), null);
  assert.equal(validateTrustedPaymentUpdate({...base, actualAmountInCentavos: 1}), "amount_mismatch");
  assert.equal(validateTrustedPaymentUpdate({...base, actualCurrency: "USD"}), "currency_mismatch");
  assert.equal(validateTrustedPaymentUpdate({...base, currentStatus: "paid", nextStatus: "failed"}), "invalid_transition");
});

test("failed-to-paid recovery is narrowly opt-in and still validates gateway facts", () => {
  const recovery = {
    currentStatus: "failed",
    nextStatus: "paid",
    expectedAmountInCentavos: 1350000,
    actualAmountInCentavos: 1350000,
    expectedCurrency: "PHP",
    actualCurrency: "PHP",
  };
  assert.equal(validateTrustedPaymentUpdate(recovery), "invalid_transition");
  assert.equal(validateTrustedPaymentUpdate({
    ...recovery,
    allowFailedToPaidRecovery: true,
  }), null);
  assert.equal(validateTrustedPaymentUpdate({
    ...recovery,
    actualAmountInCentavos: 1,
    allowFailedToPaidRecovery: true,
  }), "amount_mismatch");
  assert.equal(validateTrustedPaymentUpdate({
    ...recovery,
    actualCurrency: "USD",
    allowFailedToPaidRecovery: true,
  }), "currency_mismatch");
  assert.equal(validateTrustedPaymentUpdate({
    ...recovery,
    currentStatus: "expired",
    allowFailedToPaidRecovery: true,
  }), "invalid_transition");
});

test("checkout reuse requires compatible lifecycle and PayMongo URL structure", () => {
  const mainEvent = {status: "waiting_for_down_payment"};
  const request = {
    status: "payment_processing",
    paymentStatus: "processing",
  };
  const payment = {status: "processing"};
  assert.equal(checkoutEligibilityReason({
    providerRequest: request,
    mainEvent,
    payment,
  }), null);
  assert.equal(checkoutEligibilityReason({
    providerRequest: {...request, status: "cancelled"},
    mainEvent,
    payment,
  }), "provider_request_not_payment_eligible");
  assert.equal(checkoutEligibilityReason({
    providerRequest: request,
    mainEvent: {status: "cancelled"},
    payment,
  }), "main_event_not_payment_eligible");
  assert.equal(validStoredCheckoutReason({
    paymongoCheckoutId: "cs_test_checkout",
    checkoutUrl: "https://checkout.paymongo.com/session/test",
  }), null);
  assert.equal(validStoredCheckoutReason({
    paymongoCheckoutId: "cs_test_checkout",
    checkoutUrl: "https://example.com/session/test",
  }), "checkout_url_invalid");
});

test("canonical payment linkage binds one deterministic payment to one request", () => {
  const providerRequestId = "provider-request-canonical";
  const mainEventId = "main-event-canonical";
  const paymentId = paymentIdForProviderRequest(providerRequestId);
  const providerRequest = {
    providerRequestId,
    mainEventId,
    bookingId: mainEventId,
    customerId: "customer-canonical",
    providerId: "provider-canonical",
    downPaymentAmount: 13500,
  };
  const mainEvent = {
    mainEventId,
    bookingId: mainEventId,
    customerId: "customer-canonical",
    providerRequestIds: [providerRequestId],
  };
  const payment = {
    paymentId,
    providerRequestId,
    mainEventId,
    bookingId: mainEventId,
    customerId: "customer-canonical",
    providerId: "provider-canonical",
    amount: 13500,
    amountInCentavos: 1350000,
    currency: "PHP",
    paymentType: "provider_down_payment",
    gateway: "paymongo",
  };
  const base = {
    paymentId,
    providerRequestId,
    mainEventId,
    customerId: "customer-canonical",
    providerId: "provider-canonical",
    payment,
    providerRequest,
    mainEvent,
  };
  assert.equal(canonicalPaymentLinkageReason(base), null);
  assert.equal(canonicalPaymentLinkageReason({
    ...base,
    payment: {...payment, providerId: "provider-forged"},
  }), "canonical_linkage_mismatch");
  assert.equal(canonicalPaymentLinkageReason({
    ...base,
    payment: {...payment, amountInCentavos: 1},
  }), "authoritative_amount_mismatch");
});

test("webhook lifecycle guards reject booking resurrection", () => {
  assert.equal(webhookLifecycleConflictReason({
    providerRequestStatus: "payment_processing",
    mainEventStatus: "waiting_for_down_payment",
    nextPaymentStatus: "paid",
  }), null);
  assert.equal(webhookLifecycleConflictReason({
    providerRequestStatus: "cancelled",
    mainEventStatus: "waiting_for_down_payment",
    nextPaymentStatus: "paid",
  }), "provider_request_lifecycle_conflict");
  assert.equal(webhookLifecycleConflictReason({
    providerRequestStatus: "payment_processing",
    mainEventStatus: "cancelled",
    nextPaymentStatus: "paid",
  }), "main_event_lifecycle_conflict");
});

test("webhook parsing requires server-issued payment metadata", () => {
  const event = eventBody({eventId: "evt_ok", paymentId: "payment_one"});
  assert.equal(parsePayMongoPaymentEvent(event).paymentId, "payment_one");
  const parsed = JSON.parse(event.toString());
  delete parsed.data.attributes.data.attributes.metadata;
  assert.throws(() => parsePayMongoPaymentEvent(Buffer.from(JSON.stringify(parsed))));
});

function eventBody({eventId, paymentId}) {
  return Buffer.from(JSON.stringify({data: {
    id: eventId,
    type: "event",
    attributes: {
      type: "payment.paid",
      data: {id: "pay_gateway", type: "payment", attributes: {
        amount: 1350000,
        currency: "PHP",
        metadata: {payment_id: paymentId},
      }},
    },
  }}));
}
