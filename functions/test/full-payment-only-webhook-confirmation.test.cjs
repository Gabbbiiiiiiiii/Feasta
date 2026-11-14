const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  statusForPayMongoEvent,
  validateTrustedPaymentUpdate,
} = require(
  "../lib/payments/payment-security.js",
);

const {
  paymentIdForProviderRequestChoice,
} = require(
  "../lib/payments/payment-obligation.js",
);

const {
  providerRequestSettlementUpdateForPaymentOutcome,
} = require(
  "../lib/payments/payment-settlement.js",
);

const PROVIDER_REQUEST_ID =
  "provider_request_p13_c4";

const GROSS =
  3_000_000;

function fullPaymentRequest() {
  const paymentId =
    paymentIdForProviderRequestChoice(
      PROVIDER_REQUEST_ID,
      "full",
    );

  return {
    providerRequestId:
      PROVIDER_REQUEST_ID,

    financialSnapshot: {
      schemaVersion:
        1,

      currency:
        "PHP",

      grossAmountInCentavos:
        GROSS,

      requiredUpfrontAmountInCentavos:
        GROSS,

      remainingBalanceInCentavos:
        0,
    },

    initialPaymentChoice:
      "full",

    initialPaymentId:
      paymentId,

    paymentId,
  };
}

test(
  "P13-C trusted PayMongo success maps to paid",
  () => {
    assert.equal(
      statusForPayMongoEvent(
        "payment.paid",
      ),
      "paid",
    );

    assert.equal(
      statusForPayMongoEvent(
        "checkout_session.payment.paid",
      ),
      "paid",
    );

    assert.equal(
      statusForPayMongoEvent(
        "checkout_session.created",
      ),
      null,
    );
  },
);

test(
  "P13-C trusted paid confirmation requires the exact frozen amount and PHP currency",
  () => {
    const trusted = {
      currentStatus:
        "processing",

      nextStatus:
        "paid",

      expectedAmountInCentavos:
        GROSS,

      actualAmountInCentavos:
        GROSS,

      expectedCurrency:
        "PHP",

      actualCurrency:
        "PHP",
    };

    assert.equal(
      validateTrustedPaymentUpdate(
        trusted,
      ),
      null,
    );

    assert.equal(
      validateTrustedPaymentUpdate({
        ...trusted,

        actualAmountInCentavos:
          GROSS - 1,
      }),
      "amount_mismatch",
    );

    assert.equal(
      validateTrustedPaymentUpdate({
        ...trusted,

        actualAmountInCentavos:
          GROSS + 1,
      }),
      "amount_mismatch",
    );

    assert.equal(
      validateTrustedPaymentUpdate({
        ...trusted,

        actualCurrency:
          "USD",
      }),
      "currency_mismatch",
    );
  },
);

test(
  "P13-C trusted full payment settles the complete frozen provider-request gross",
  () => {
    const providerRequest =
      fullPaymentRequest();

    const update =
      providerRequestSettlementUpdateForPaymentOutcome({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        paymentId:
          providerRequest.paymentId,

        paymentStatus:
          "paid",

        timestamp:
          "trusted-paid-at",
      });

    assert.equal(
      update.settlementStatus,
      "fully_settled",
    );

    assert.equal(
      update
        .grossSettledAmountInCentavos,
      GROSS,
    );

    assert.equal(
      update
        .outstandingAmountInCentavos,
      0,
    );

    assert.equal(
      update.settlementUpdatedAt,
      "trusted-paid-at",
    );
  },
);

test(
  "P13-C unsuccessful full-payment outcomes never produce a settled request",
  () => {
    for (
      const paymentStatus of [
        "processing",
        "failed",
        "expired",
      ]
    ) {
      const providerRequest =
        fullPaymentRequest();

      const update =
        providerRequestSettlementUpdateForPaymentOutcome({
          providerRequestId:
            PROVIDER_REQUEST_ID,

          providerRequest,

          paymentId:
            providerRequest.paymentId,

          paymentStatus,

          timestamp:
            `${paymentStatus}-at`,
        });

      assert.notEqual(
        update.settlementStatus,
        "fully_settled",
      );

      assert.equal(
        update
          .grossSettledAmountInCentavos,
        0,
      );

      assert.equal(
        update
          .outstandingAmountInCentavos,
        GROSS,
      );
    }
  },
);

test(
  "PayMongo webhook verifies signature before processing financial events",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "../src/payments/paymongo-webhook.ts",
        ),
        "utf8",
      );

    const signatureCall =
      source.search(
        /verifyPayMongoSignature\s*\(\s*\{/u,
      );

    const processingCall =
      source.search(
        /await\s+processPayMongoWebhook\s*\(/u,
      );

    assert.ok(
      signatureCall >= 0,
      "Webhook signature verification must exist.",
    );

    assert.ok(
      processingCall >= 0,
      "Webhook processing call must exist.",
    );

    assert.ok(
      signatureCall <
        processingCall,
      "Webhook processing must occur only after signature verification.",
    );

    assert.match(
      source,
      /if\s*\(\s*!valid\s*\)[\s\S]*?status\(401\)/u,
    );
  },
);

test(
  "trusted gateway validation occurs before provider-request confirmation",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "../src/payments/process-webhook.ts",
        ),
        "utf8",
      );

    const trustedValidation =
      source.search(
        /const validationReason\s*=\s*validateTrustedPaymentUpdate\s*\(/u,
      );

    const requestUpdate =
      source.search(
        /const requestPaymentUpdate\s*=\s*createProviderRequestPaymentUpdate\s*\(/u,
      );

    assert.ok(
      trustedValidation >= 0,
      "Trusted payment validation must exist.",
    );

    assert.ok(
      requestUpdate >= 0,
      "Provider-request payment update must exist.",
    );

    assert.ok(
      trustedValidation <
        requestUpdate,
      "Provider request must not be updated before trusted payment validation.",
    );

    assert.match(
      source,
      /providerRequestSettlementUpdateForPaymentOutcome\s*\(/u,
    );

    assert.match(
      source,
      /if\s*\(\s*status === "paid"\s*\)[\s\S]*?statusOverride:\s*"confirmed"/u,
    );
  },
);
