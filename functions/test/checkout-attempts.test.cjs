const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const root = process.env.FEASTA_FUNCTIONS_LIB_DIR ?? path.resolve(__dirname, "../lib");
const domain = require(path.join(root, "payments/checkout-attempt-domain.js"));
const {parsePayMongoPaymentEvent} = require(path.join(root, "payments/payment-security.js"));
const {retrievePayMongoCheckout} = require(path.join(root, "payments/paymongo-client.js"));

function payment(paidAt) {
  return {id: "pay_one", type: "payment", attributes: {amount: 10000, currency: "PHP",
    status: "paid", payment_intent_id: "pi_one", paid_at: paidAt,
    created_at: 1700000000, metadata: {payment_id: "logical", feasta_checkout_attempt_id: "attempt"}}};
}
function parse(resource, type = "payment.paid") {
  return parsePayMongoPaymentEvent(Buffer.from(JSON.stringify({data: {id: "evt_one",
    attributes: {type, data: resource}}})));
}
test("attempt keys are deterministic per attempt, distinct across attempts/payments", () => {
  assert.equal(domain.checkoutAttemptKey("p", "a"), domain.checkoutAttemptKey("p", "a"));
  assert.notEqual(domain.checkoutAttemptKey("p", "a"), domain.checkoutAttemptKey("p", "b"));
  assert.notEqual(domain.checkoutAttemptKey("p", "a"), domain.checkoutAttemptKey("q", "a"));
});
test("dispatch retry window is bounded and never renews", () => {
  const first = 1700000000000;
  assert.equal(domain.canRetryCheckout(first, first + 22 * 3600000), true);
  assert.equal(domain.canRetryCheckout(first, first + 23 * 3600000), false);
  assert.equal(domain.canRetryCheckout(first, first - 1), false);
  assert.equal(domain.canRetryCheckout(NaN, first), false);
});

test("terminal labels require a bound, exhaustive trusted settlement attestation", () => {
  const attempt = {paymentId: "logical", attemptId: "attempt", resolution: "expired",
    paymongoCheckoutId: "cs_one", paymongoPaymentIntentIds: ["pi_one"],
    paymongoPaymentIds: ["pay_one"]};
  // Synthetic trusted issuer fixture. No production adapter currently issues proof.
  const proof = {schemaVersion: 1, authority: "paymongo", outcome: "terminal_unsuccessful",
    irreversible: true, exhaustive: true, evidenceReference: "test-authoritative-settlement",
    paymentId: "logical", attemptId: "attempt", checkoutId: "cs_one",
    paymentIntentIds: ["pi_one"], paymentIds: ["pay_one"]};
  const terminal = domain.isAuthoritativelyTerminalUnsuccessful;
  for (const resolution of ["failed", "expired"]) {
    assert.equal(terminal({...attempt, resolution}), false);
    assert.equal(terminal({...attempt, resolution, terminalEvidence: proof}), true);
  }
  for (const terminalEvidence of [null, "test-authoritative-settlement", [], {},
    {...proof, schemaVersion: "1"}, {...proof, authority: "local"},
    {...proof, outcome: "expired"}, {...proof, irreversible: false},
    {...proof, exhaustive: false}, {...proof, evidenceReference: ""},
    {...proof, paymentId: "other"}, {...proof, attemptId: "other"},
    {...proof, checkoutId: "cs_other"}, {...proof, paymentIntentIds: []},
    {...proof, paymentIds: undefined}, {...proof, paymentIds: ["pay_one", "pay_one"]}]) {
    assert.equal(terminal({...attempt, terminalEvidence}), false);
  }
  assert.equal(terminal({...attempt, terminalEvidence: proof,
    paymongoPaymentIds: ["pay_one", "pay_newly_discovered"]}), false);
  for (const resolution of ["success", "outstanding", "unresolved"]) {
    assert.equal(terminal({...attempt, resolution, terminalEvidence: proof}), false);
  }
});

test("checkout expiration accepts absent or unexpanded intent without success evidence", () => {
  for (const intent of [undefined, null, {id: "pi_one"}, "pi_one"]) {
    const resource = {id: "cs_one", type: "checkout_session", attributes: {
      amount: 10000, currency: "PHP", metadata: payment().attributes.metadata,
      payment_intent: intent}};
    const event = parse(resource, "checkout_session.expired");
    assert.equal(event.amountInCentavos, 10000);
    assert.equal(event.currency, "PHP");
    assert.deepEqual(event.successfulPayments, []);
    assert.equal(event.paymentIntentId, intent ? "pi_one" : null);
    assert.throws(() => parse(resource, "checkout_session.payment.paid"));
    resource.attributes.payments = [payment(1700000010)];
    resource.attributes.payments[0].attributes.status = "failed";
    assert.throws(() => parse(resource, "checkout_session.payment.paid"));
    resource.attributes.payments[0].attributes.status = "paid";
    assert.deepEqual(parse(resource, "checkout_session.expired").successfulPayments, []);
    resource.attributes.payments[0].attributes.amount = "10000";
    assert.throws(() => parse(resource, "checkout_session.payment.paid"));
    delete resource.attributes.amount;
    assert.throws(() => parse(resource, "checkout_session.expired"));
  }
});

test("expanded intent remains an optional amount/currency fallback for non-success", () => {
  const event = parse({id: "cs_one", type: "checkout_session", attributes: {
    metadata: payment().attributes.metadata,
    payment_intent: {id: "pi_one", attributes: {amount: 10000, currency: "PHP"}}}},
  "checkout_session.expired");
  assert.equal(event.amountInCentavos, 10000);
  assert.deepEqual(event.successfulPayments, []);
});
test("only explicit paid_at becomes gateway completion evidence", () => {
  assert.equal(parse(payment(1700000010)).successfulPayments[0].gatewayPaidAtMs, 1700000010000);
  for (const value of [undefined, null, "1700000010", -1, 0, 1.25, 1e15]) {
    assert.equal(parse(payment(value)).successfulPayments[0].gatewayPaidAtMs, null);
  }
  const pending = payment(1700000010);
  pending.attributes.status = "pending";
  assert.throws(() => parse(pending), /success status/);
});
test("checkout payment IDs and multiple intents stay in one checkout attempt", () => {
  const second = payment(1700000020);
  second.id = "pay_two";
  second.attributes.payment_intent_id = "pi_two";
  const resource = {id: "cs_one", type: "checkout_session", attributes: {
    metadata: payment().attributes.metadata, payment_intent: {id: "pi_two"},
    payments: [payment(1700000010), second]}};
  const event = parse(resource, "checkout_session.payment.paid");
  assert.equal(event.checkoutAttemptId, "attempt");
  assert.equal(event.checkoutId, "cs_one");
  assert.deepEqual(event.successfulPayments.map(p => p.paymentIntentId), ["pi_one", "pi_two"]);
  assert.deepEqual(event.successfulPayments.map(p => p.id), ["pay_one", "pay_two"]);
  second.attributes.amount = 1;
  assert.throws(() => parse(resource, "checkout_session.payment.paid"), /relationship/);
});
test("all attempts and history completeness determine logical resolution", () => {
  const resolve = domain.resolveLogicalPayment;
  assert.equal(resolve(["unresolved", "expired"], true), "unresolved");
  assert.equal(resolve(["failed", "expired"], true), "definitely_unpaid");
  assert.equal(resolve(["failed", "expired"], false), "unresolved");
  assert.equal(resolve(["outstanding"], true), "unresolved");
  assert.equal(resolve([], true), "unresolved");
  assert.equal(resolve(["success", "expired"], false), "success");
});
test("event aggregation preserves uncertainty and excludes no-down-payment providers", () => {
  const aggregate = values => domain.aggregateRequiredPayments(values.map(resolution =>
    ({required: true, resolution})));
  assert.equal(aggregate(["success", "success"]), "fully_paid");
  assert.equal(aggregate(["success", "definitely_unpaid"]), "partially_paid");
  assert.equal(aggregate(["definitely_unpaid"]), "unpaid");
  assert.equal(aggregate(["success", "unresolved"]), "unresolved");
  assert.equal(domain.aggregateRequiredPayments([{required: false, resolution: "unresolved"}]),
    "fully_paid");
});
test("retrieval uses secret authorization server-side and no creation idempotency header", async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, init) => {
      assert.equal(url, "https://api.paymongo.com/v1/checkout_sessions/cs_one");
      assert.equal(init.method, "GET");
      const headers = new Headers(init.headers);
      assert.equal(headers.get("authorization"), `Basic ${Buffer.from("sk_test_secret:").toString("base64")}`);
      assert.equal(headers.get("idempotency-key"), null);
      return new Response(JSON.stringify({data: {id: "cs_one"}}), {status: 200});
    };
    assert.deepEqual(await retrievePayMongoCheckout("sk_test_secret", "cs_one"), {data: {id: "cs_one"}});
    await assert.rejects(retrievePayMongoCheckout("sk_test_secret", "../../secrets"));
    global.fetch = async () => {throw new Error("network");};
    await assert.rejects(retrievePayMongoCheckout("sk_test_secret", "cs_one"));
  } finally {global.fetch = original;}
});
