const {test} = require("node:test");
const assert = require("node:assert/strict");
require("firebase-admin/app").initializeApp({projectId: "demo-feasta-return-guards"});
const {correlatedReturnUrl, trustedRedirectUrl, createPaymentSession} = require("../lib/payments/create-payment-session.js");
const {assertScheduledEventStartReached} = require("../lib/provider-requests/update-provider-booking-lifecycle.js");

test("return correlation preserves trusted destination and encodes identifiers", () => {
  const url = new URL(correlatedReturnUrl("https://feasta.example/customer/payments?payment=success", "payment_abc", "request_abc", "booking_abc"));
  assert.equal(url.origin, "https://feasta.example");
  assert.equal(url.searchParams.get("ref"), "payment_abc");
  assert.equal(url.searchParams.get("payment"), "success");
  assert.equal(url.searchParams.has("providerRequestId"), false);
  assert.equal(url.searchParams.has("bookingId"), false);
});
test("correlation cannot replace the return origin", () => {
  const url = new URL(correlatedReturnUrl("https://feasta.example/customer/payments?payment=cancelled", "https://evil.example", "request_abc", "booking_abc"));
  assert.equal(url.origin, "https://feasta.example");
  assert.equal(url.searchParams.get("payment"), "cancelled");
});
test("future scheduled event start is refused regardless of payment", () => {
  assert.throws(() => assertScheduledEventStartReached(new Date("2026-10-16T00:00:00+08:00"), "07:21", new Date("2026-10-08T00:00:00+08:00")), /has not been reached/);
});
test("scheduled start boundary is allowed", () => {
  assert.doesNotThrow(() => assertScheduledEventStartReached(new Date("2026-10-16T00:00:00+08:00"), "07:21", new Date("2026-10-16T07:21:00+08:00")));
});
test("malformed schedule fails closed", () => {
  assert.throws(() => assertScheduledEventStartReached(new Date(NaN), "07:21"), /invalid/);
});


test("caller-controlled success and cancel destinations are rejected before gateway dispatch", async () => {
  const auth = require("../lib/shared/auth.js");
  const roles = require("../lib/shared/authorization.js");
  const rate = require("../lib/shared/rate-limit.js");
  const gateway = require("../lib/payments/paymongo-client.js");
  const saved = [auth.requireAuth, roles.requireRole, rate.enforceCallableRateLimit, gateway.createPayMongoCheckout];
  let dispatched = 0;
  auth.requireAuth = () => ({uid: "customer_test"});
  roles.requireRole = async () => {};
  rate.enforceCallableRateLimit = async () => {};
  gateway.createPayMongoCheckout = async () => { dispatched++; throw Error("unexpected gateway call"); };
  try {
    for (const field of ["successUrl", "cancelUrl"]) {
      await assert.rejects(createPaymentSession.run({data: {
        providerRequestId: "request_test", paymentChoice: "minimum", idempotencyKey: "client_test",
        [field]: "https://evil.example",
      }}), {code: "invalid-argument"});
    }
    assert.equal(dispatched, 0);
  } finally {
    [auth.requireAuth, roles.requireRole, rate.enforceCallableRateLimit, gateway.createPayMongoCheckout] = saved;
  }
});

test("production configuration rejects external and localhost return destinations", () => {
  const saved = [process.env.PAYMENT_SUCCESS_URL, process.env.FUNCTIONS_EMULATOR];
  try {
    delete process.env.FUNCTIONS_EMULATOR;
    for (const base of ["https://evil.example", "http://localhost:3000", "https://feasta-web.vercel.app.evil.example"]) {
      process.env.PAYMENT_SUCCESS_URL = base + "/customer/payments?payment=success";
      assert.throws(() => trustedRedirectUrl("PAYMENT_SUCCESS_URL"), /trusted FEASTA origin/);
    }
    process.env.PAYMENT_SUCCESS_URL = "https://feasta-web.vercel.app/customer/payments?payment=success";
    assert.equal(new URL(trustedRedirectUrl("PAYMENT_SUCCESS_URL")).origin, "https://feasta-web.vercel.app");
    process.env.FUNCTIONS_EMULATOR = "true";
    process.env.PAYMENT_SUCCESS_URL = "http://localhost:3000/customer/payments?payment=success";
    assert.equal(new URL(trustedRedirectUrl("PAYMENT_SUCCESS_URL")).hostname, "localhost");
    process.env.PAYMENT_SUCCESS_URL = "https://evil.example/customer/payments";
    assert.throws(() => trustedRedirectUrl("PAYMENT_SUCCESS_URL"), /trusted FEASTA origin/);
  } finally {
    for (const [index, key] of ["PAYMENT_SUCCESS_URL", "FUNCTIONS_EMULATOR"].entries()) {
      if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index];
    }
  }
});

test("service start requires zero outstanding, valid canonical evidence, and fully-settled status", () => {
  const {assertProviderRequestFullySettledForServiceStart: check} = require("../lib/provider-finance/provider-settlement-management.js");
  const full = {settlementSchemaVersion: 1, settlementStatus: "fully_settled", initialPaymentChoice: "full",
    initialPaymentId: "payment_full", financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 500000, remainingBalanceInCentavos: 0},
    grossSettledAmountInCentavos: 500000, outstandingAmountInCentavos: 0};
  assert.doesNotThrow(() => check(full));
  for (const overrides of [
    {settlementStatus: "deposit_settled", grossSettledAmountInCentavos: 250000, outstandingAmountInCentavos: 250000},
    {settlementStatus: "deposit_settled"}, {settlementSchemaVersion: 2}, {settlementSchemaVersion: undefined},
    {outstandingAmountInCentavos: NaN}, {grossSettledAmountInCentavos: 499999},
  ]) assert.throws(() => check({...full, ...overrides}), {code: "failed-precondition"});
});
