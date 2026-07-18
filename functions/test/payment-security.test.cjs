const assert = require("node:assert/strict");
const {createHmac} = require("node:crypto");
const test = require("node:test");

const {
  parsePayMongoPaymentEvent,
  validateTrustedPaymentUpdate,
  verifyPayMongoSignature,
} = require("../lib/payments/payment-security.js");

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
