const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const libRoot = process.env.FEASTA_FUNCTIONS_LIB_DIR ??
  path.resolve(__dirname, "../lib");
const paymongo = require(path.join(libRoot, "payments/paymongo-client.js"));
const security = require(path.join(libRoot, "payments/payment-security.js"));
const accounting = require(path.join(
  libRoot,
  "refunds/refund-accounting-domain.js",
));

test("gateway refund identity is stable and does not expose operation material", () => {
  const operationId = `refund_${"a".repeat(40)}`;
  const key = accounting.gatewayRefundIdempotencyKey(operationId);
  assert.equal(key, accounting.gatewayRefundIdempotencyKey(operationId));
  assert.equal(key, `feasta-policy-${operationId}`);
  assert.throws(() => accounting.gatewayRefundIdempotencyKey("client-id"));
});

test("PayMongo refund parser accepts bounded partial-refund resources", () => {
  assert.deepEqual(paymongo.parsePayMongoRefundResource(refundResource({
    amount: 51,
    status: "processing",
  })), {
    id: "refund_gateway_one",
    amountInCentavos: 51,
    currency: "PHP",
    gatewayPaymentId: "pay_gateway_one",
    status: "processing",
    metadata: {
      feasta_payment_id: "payment_one",
      feasta_refund_operation_id: `refund_${"a".repeat(40)}`,
    },
  });
  assert.throws(() => paymongo.parsePayMongoRefundResource(refundResource({
    amount: 0,
  })));
  assert.throws(() => paymongo.parsePayMongoRefundResource(refundResource({
    status: "unknown",
  })));
});

test("refund webhook parser derives canonical routing only from bounded metadata", () => {
  const payload = {
    data: {
      id: "event_refund_one",
      attributes: {
        type: "refund.succeeded",
        data: refundResource({status: "succeeded"}).data,
      },
    },
  };
  const parsed = security.parsePayMongoWebhookEvent(
    Buffer.from(JSON.stringify(payload)),
  );
  assert.equal(parsed.kind, "refund");
  assert.equal(parsed.paymentId, "payment_one");
  assert.equal(parsed.refundOperationId, `refund_${"a".repeat(40)}`);
  assert.equal(parsed.refund.amountInCentavos, 51);

  delete payload.data.attributes.data.attributes.metadata
    .feasta_refund_operation_id;
  assert.throws(() => security.parsePayMongoWebhookEvent(
    Buffer.from(JSON.stringify(payload)),
  ));
});

test("createPayMongoRefund sends server amount and stable idempotency metadata", async () => {
  const originalFetch = global.fetch;
  let observed;
  global.fetch = async (url, init) => {
    observed = {url, init};
    return new Response(JSON.stringify(refundResource({
      amount: 75_000,
      status: "pending",
    })), {
      status: 200,
      headers: {"content-type": "application/json"},
    });
  };
  try {
    const result = await paymongo.createPayMongoRefund({
      secretKey: "sk_test_authoritative",
      idempotencyKey: "feasta-policy-refund-operation",
      gatewayPaymentId: "pay_gateway_one",
      amountInCentavos: 75_000,
      reason: "others",
      metadata: {
        feasta_payment_id: "payment_one",
        feasta_refund_operation_id: `refund_${"a".repeat(40)}`,
      },
    });
    assert.equal(result.amountInCentavos, 75_000);
    assert.equal(observed.url, "https://api.paymongo.com/v1/refunds");
    assert.equal(observed.init.headers["Idempotency-Key"],
      "feasta-policy-refund-operation");
    const body = JSON.parse(observed.init.body);
    assert.equal(body.data.attributes.amount, 75_000);
    assert.equal(body.data.attributes.payment_id, "pay_gateway_one");
    assert.equal(body.data.attributes.metadata.feasta_payment_id,
      "payment_one");
  } finally {
    global.fetch = originalFetch;
  }
});

test("PayMongo failures preserve certainty for safe retry decisions", async () => {
  assert.equal(paymongo.payMongoFailureCertainty(new Error("unknown")),
    "ambiguous");
  await assert.rejects(paymongo.createPayMongoRefund({
    secretKey: "missing",
    idempotencyKey: "key",
    gatewayPaymentId: "pay_gateway_one",
    amountInCentavos: 100,
    reason: "others",
  }), (error) => paymongo.payMongoFailureCertainty(error) === "not_sent");

  let called = false;
  const minimumFetch = global.fetch;
  global.fetch = async () => {
    called = true;
    throw new Error("must not be called");
  };
  try {
    await assert.rejects(paymongo.createPayMongoRefund({
      secretKey: "sk_test_authoritative",
      idempotencyKey: "key",
      gatewayPaymentId: "pay_gateway_one",
      amountInCentavos: 1,
      reason: "others",
    }), (error) => paymongo.payMongoFailureCertainty(error) === "not_sent");
    assert.equal(called, false);
  } finally {
    global.fetch = minimumFetch;
  }

  const originalFetch = global.fetch;
  global.fetch = async () => new Response("{}", {status: 422});
  try {
    await assert.rejects(paymongo.createPayMongoRefund({
      secretKey: "sk_test_authoritative",
      idempotencyKey: "key",
      gatewayPaymentId: "pay_gateway_one",
      amountInCentavos: 100,
      reason: "others",
    }), (error) => paymongo.payMongoFailureCertainty(error) ===
      "gateway_rejected");
  } finally {
    global.fetch = originalFetch;
  }
});

function refundResource(overrides = {}) {
  return {
    data: {
      id: "refund_gateway_one",
      type: "refund",
      attributes: {
        amount: 51,
        currency: "PHP",
        payment_id: "pay_gateway_one",
        status: "processing",
        metadata: {
          feasta_payment_id: "payment_one",
          feasta_refund_operation_id: `refund_${"a".repeat(40)}`,
        },
        ...overrides,
      },
    },
  };
}
