const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const libRoot = process.env.FEASTA_FUNCTIONS_LIB_DIR ??
  path.resolve(__dirname, "../lib");

require(path.join(libRoot, "shared/firebase-admin.js"));

const {
  buildSandboxCheckoutUrl,
  getPaymentGatewayMode,
  isSandboxMockPaymentMode,
  isValidSandboxCheckoutUrl,
} = require(path.join(libRoot, "payments/payment-gateway-mode.js"));

const {
  validStoredCheckoutReason,
} = require(path.join(libRoot, "payments/payment-lifecycle.js"));

const {
  parsePayMongoWebhookEvent,
  statusForPayMongoEvent,
} = require(path.join(libRoot, "payments/payment-security.js"));

const {
  createPayMongoRefund,
  retrievePayMongoRefund,
} = require(path.join(libRoot, "payments/paymongo-client.js"));

const {
  buildSyntheticSandboxWebhookPayload,
  completeSandboxMockCheckoutForCustomer,
  createSandboxMockCheckout,
} = require(path.join(libRoot, "payments/sandbox-mock-checkout.js"));

const {
  isPartialRefundCapabilityConfirmed,
} = require(path.join(libRoot, "refunds/refund-execution.js"));

function withGatewayMode(mode, fn) {
  const previous = process.env.PAYMENT_GATEWAY_MODE;
  if (mode === undefined) {
    delete process.env.PAYMENT_GATEWAY_MODE;
  } else {
    process.env.PAYMENT_GATEWAY_MODE = mode;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) {
        delete process.env.PAYMENT_GATEWAY_MODE;
      } else {
        process.env.PAYMENT_GATEWAY_MODE = previous;
      }
    });
}

test("PAYMENT_GATEWAY_MODE defaults strictly to paymongo and switches cleanly to sandbox_mock", async () => {
  await withGatewayMode(undefined, () => {
    assert.equal(getPaymentGatewayMode(), "paymongo");
    assert.equal(isSandboxMockPaymentMode(), false);
  });
  await withGatewayMode("paymongo", () => {
    assert.equal(getPaymentGatewayMode(), "paymongo");
    assert.equal(isSandboxMockPaymentMode(), false);
  });
  await withGatewayMode("sandbox_mock", () => {
    assert.equal(getPaymentGatewayMode(), "sandbox_mock");
    assert.equal(isSandboxMockPaymentMode(), true);
  });
  await withGatewayMode("  SANDBOX_MOCK  ", () => {
    assert.equal(getPaymentGatewayMode(), "sandbox_mock");
    assert.equal(isSandboxMockPaymentMode(), true);
  });
  await withGatewayMode("other", () => {
    assert.equal(getPaymentGatewayMode(), "paymongo");
    assert.equal(isSandboxMockPaymentMode(), false);
  });
});

test("sandbox checkout URL validation enforces exact FEASTA origin, path, and safe IDs", () => {
  const url = buildSandboxCheckoutUrl({
    paymentId: "payment_0378199916d5d0718e38879dc1580f7b",
    checkoutAttemptId: "a1e568ae-e5d6-41f8-96e0-eb036fb17140",
  });
  assert.equal(
    url,
    "https://feasta-web.vercel.app/customer/payments/sandbox-checkout?paymentId=payment_0378199916d5d0718e38879dc1580f7b&attemptId=a1e568ae-e5d6-41f8-96e0-eb036fb17140",
  );
  assert.equal(isValidSandboxCheckoutUrl(url), true);

  for (const invalid of [
    "http://feasta-web.vercel.app/customer/payments/sandbox-checkout?paymentId=payment_12345678",
    "https://evil.example/customer/payments/sandbox-checkout?paymentId=payment_12345678",
    "https://feasta-web.vercel.app/customer/payments?paymentId=payment_12345678",
    "https://feasta-web.vercel.app/customer/payments/sandbox-checkout",
    "https://feasta-web.vercel.app/customer/payments/sandbox-checkout?paymentId=bad",
    "https://user:pass@feasta-web.vercel.app/customer/payments/sandbox-checkout?paymentId=payment_12345678",
  ]) {
    assert.equal(isValidSandboxCheckoutUrl(invalid), false, `expected invalid: ${invalid}`);
  }
});

test("validStoredCheckoutReason only permits sandbox checkout URLs while sandbox_mock mode is enabled", async () => {
  const sandboxCheckout = {
    paymongoCheckoutId: "cs_sandbox_1234567890abcdef12345678",
    checkoutUrl: buildSandboxCheckoutUrl({
      paymentId: "payment_0378199916d5d0718e38879dc1580f7b",
      checkoutAttemptId: "a1e568ae-e5d6-41f8-96e0-eb036fb17140",
    }),
  };

  await withGatewayMode("paymongo", () => {
    assert.equal(validStoredCheckoutReason(sandboxCheckout), "checkout_url_invalid");
    assert.equal(
      validStoredCheckoutReason({
        paymongoCheckoutId: "cs_test_live123456",
        checkoutUrl: "https://checkout.paymongo.com/session/test",
      }),
      null,
    );
  });

  await withGatewayMode("sandbox_mock", () => {
    assert.equal(validStoredCheckoutReason(sandboxCheckout), null);
    assert.equal(
      validStoredCheckoutReason({
        paymongoCheckoutId: "cs_sandbox_1234567890abcdef12345678",
        checkoutUrl: "https://evil.example/checkout",
      }),
      "checkout_url_invalid",
    );
    assert.equal(
      validStoredCheckoutReason({
        paymongoCheckoutId: "cs_live_not_sandbox",
        checkoutUrl: sandboxCheckout.checkoutUrl,
      }),
      "checkout_url_invalid",
    );
  });
});

test("createSandboxMockCheckout generates deterministic cs_sandbox session IDs and trusted URLs", async () => {
  const input = {
    secretKey: "sk_sandbox_mock",
    idempotencyKey: "attempt-key-001",
    paymentId: "payment_0378199916d5d0718e38879dc1580f7b",
    checkoutAttemptId: "a1e568ae-e5d6-41f8-96e0-eb036fb17140",
    bookingId: "c979810d47890f6fb0f87b2a931108771eb3a725",
    providerRequestId: "ce5c572baa7ab951d396ac37968d9ac8ac89e30c",
    customerId: "customer_12345678",
    amountInCentavos: 511020,
    currency: "PHP",
    description: "FEASTA Lechon Belly Package",
    successUrl: "https://feasta-web.vercel.app/customer/payments?payment=success",
    cancelUrl: "https://feasta-web.vercel.app/customer/payments?payment=cancelled",
  };

  const first = await createSandboxMockCheckout(input);
  const second = await createSandboxMockCheckout(input);

  assert.equal(first.id, second.id);
  assert.equal(first.checkoutUrl, second.checkoutUrl);
  assert.ok(first.id.startsWith("cs_sandbox_"));
  assert.equal(isValidSandboxCheckoutUrl(first.checkoutUrl), true);
});

test("synthetic sandbox webhook payloads parse cleanly through PayMongo webhook parser", () => {
  const paidPayload = buildSyntheticSandboxWebhookPayload({
    paymentId: "payment_0378199916d5d0718e38879dc1580f7b",
    bookingId: "c979810d47890f6fb0f87b2a931108771eb3a725",
    providerRequestId: "ce5c572baa7ab951d396ac37968d9ac8ac89e30c",
    customerId: "customer_12345678",
    checkoutId: "cs_sandbox_1234567890abcdef12345678",
    checkoutAttemptId: "a1e568ae-e5d6-41f8-96e0-eb036fb17140",
    amountInCentavos: 511020,
    outcome: "paid",
    paymentMethod: "gcash",
  });

  const paidEvent = parsePayMongoWebhookEvent(
    Buffer.from(JSON.stringify(paidPayload), "utf8"),
  );
  assert.equal(paidEvent.kind, "payment");
  assert.equal(paidEvent.eventType, "checkout_session.payment.paid");
  assert.equal(statusForPayMongoEvent(paidEvent.eventType), "paid");
  assert.equal(paidEvent.paymentId, "payment_0378199916d5d0718e38879dc1580f7b");
  assert.equal(paidEvent.checkoutId, "cs_sandbox_1234567890abcdef12345678");
  assert.equal(paidEvent.checkoutAttemptId, "a1e568ae-e5d6-41f8-96e0-eb036fb17140");
  assert.equal(paidEvent.amountInCentavos, 511020);
  assert.equal(paidEvent.currency, "PHP");
  assert.equal(paidEvent.successfulPayments.length, 1);
  assert.ok(paidEvent.successfulPayments[0].id.startsWith("pay_sandbox_"));
  assert.equal(paidEvent.gatewayFeeInCentavos, 0);
  assert.equal(paidEvent.paymentMethodType, "gcash");

  const cardPayload = buildSyntheticSandboxWebhookPayload({
    paymentId: "payment_0378199916d5d0718e38879dc1580f7b",
    bookingId: "c979810d47890f6fb0f87b2a931108771eb3a725",
    providerRequestId: "ce5c572baa7ab951d396ac37968d9ac8ac89e30c",
    customerId: "customer_12345678",
    checkoutId: "cs_sandbox_1234567890abcdef12345678",
    checkoutAttemptId: "a1e568ae-e5d6-41f8-96e0-eb036fb17140",
    amountInCentavos: 511020,
    outcome: "paid",
    paymentMethod: "card",
  });
  const cardEvent = parsePayMongoWebhookEvent(
    Buffer.from(JSON.stringify(cardPayload), "utf8"),
  );
  assert.equal(cardEvent.paymentMethodType, "card");

  const failedPayload = buildSyntheticSandboxWebhookPayload({
    paymentId: "payment_0378199916d5d0718e38879dc1580f7b",
    bookingId: "c979810d47890f6fb0f87b2a931108771eb3a725",
    providerRequestId: "ce5c572baa7ab951d396ac37968d9ac8ac89e30c",
    customerId: "customer_12345678",
    checkoutId: "cs_sandbox_1234567890abcdef12345678",
    checkoutAttemptId: "a1e568ae-e5d6-41f8-96e0-eb036fb17140",
    amountInCentavos: 511020,
    outcome: "failed",
    paymentMethod: "card",
  });

  const failedEvent = parsePayMongoWebhookEvent(
    Buffer.from(JSON.stringify(failedPayload), "utf8"),
  );
  assert.equal(failedEvent.kind, "payment");
  assert.equal(failedEvent.eventType, "payment.failed");
  assert.equal(statusForPayMongoEvent(failedEvent.eventType), "failed");
  assert.equal(failedEvent.paymentId, "payment_0378199916d5d0718e38879dc1580f7b");
  assert.equal(failedEvent.checkoutAttemptId, "a1e568ae-e5d6-41f8-96e0-eb036fb17140");
  assert.equal(failedEvent.amountInCentavos, 511020);
  assert.equal(failedEvent.successfulPayments.length, 0);
});

test("completeSandboxMockCheckoutForCustomer refuses to run in paymongo mode", async () => {
  await withGatewayMode("paymongo", async () => {
    await assert.rejects(
      () =>
        completeSandboxMockCheckoutForCustomer({
          customerId: "customer_12345678",
          paymentId: "payment_0378199916d5d0718e38879dc1580f7b",
          outcome: "paid",
          paymentMethod: "gcash",
        }),
      (error) => error?.code === "failed-precondition",
    );
  });
});

test("createPayMongoRefund succeeds deterministically in sandbox_mock mode without network calls", async () => {
  await withGatewayMode("sandbox_mock", async () => {
    const refund = await createPayMongoRefund({
      secretKey: "sk_sandbox_mock",
      idempotencyKey: "refund-op-001",
      gatewayPaymentId: "pay_sandbox_abcdef1234567890",
      amountInCentavos: 250000,
      reason: "requested_by_customer",
      metadata: {
        feasta_payment_id: "payment_0378199916d5d0718e38879dc1580f7b",
        feasta_refund_operation_id: "refund_op_001",
      },
    });

    assert.ok(refund.id.startsWith("ref_sandbox_"));
    assert.equal(refund.status, "succeeded");
    assert.equal(refund.amountInCentavos, 250000);
    assert.equal(refund.currency, "PHP");
    assert.equal(refund.gatewayPaymentId, "pay_sandbox_abcdef1234567890");
    assert.equal(refund.metadata.feasta_refund_operation_id, "refund_op_001");

    await assert.rejects(
      () =>
        createPayMongoRefund({
          secretKey: "sk_sandbox_mock",
          idempotencyKey: "refund-op-small",
          gatewayPaymentId: "pay_sandbox_abcdef1234567890",
          amountInCentavos: 50,
          reason: "requested_by_customer",
        }),
      (error) => error?.certainty === "not_sent",
    );

    await assert.rejects(
      () => retrievePayMongoRefund("sk_sandbox_mock", refund.id),
      (error) => error?.certainty === "not_sent",
    );
  });
});

test("isPartialRefundCapabilityConfirmed permits sandbox_mock partial refunds while keeping paymongo strict", async () => {
  await withGatewayMode("sandbox_mock", () => {
    assert.equal(
      isPartialRefundCapabilityConfirmed({
        amountInCentavos: 35000,
        originalAmountInCentavos: 50000,
        paymentMethodType: null,
      }),
      true,
    );
    assert.equal(
      isPartialRefundCapabilityConfirmed({
        amountInCentavos: 35000,
        originalAmountInCentavos: 50000,
        paymentMethodType: "paymaya",
      }),
      true,
    );
  });

  await withGatewayMode("paymongo", () => {
    assert.equal(
      isPartialRefundCapabilityConfirmed({
        amountInCentavos: 50000,
        originalAmountInCentavos: 50000,
        paymentMethodType: null,
      }),
      true,
    );
    assert.equal(
      isPartialRefundCapabilityConfirmed({
        amountInCentavos: 35000,
        originalAmountInCentavos: 50000,
        paymentMethodType: "gcash",
      }),
      true,
    );
    assert.equal(
      isPartialRefundCapabilityConfirmed({
        amountInCentavos: 35000,
        originalAmountInCentavos: 50000,
        paymentMethodType: "card",
      }),
      true,
    );
    assert.equal(
      isPartialRefundCapabilityConfirmed({
        amountInCentavos: 35000,
        originalAmountInCentavos: 50000,
        paymentMethodType: "paymaya",
      }),
      false,
    );
    assert.equal(
      isPartialRefundCapabilityConfirmed({
        amountInCentavos: 35000,
        originalAmountInCentavos: 50000,
        paymentMethodType: null,
      }),
      false,
    );
  });
});
