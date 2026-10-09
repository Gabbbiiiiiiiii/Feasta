const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  buildSuccessfulPaymentFinancialLedgerPlan,
} =
  require(path.resolve(
    __dirname,
    "../lib/payments/financial-ledger.js",
  ));

function financialSnapshot(
  patch = {},
) {
  return {
    schemaVersion: 1,
    currency: "PHP",

    grossAmountInCentavos:
      3000000,

    requiredUpfrontAmountInCentavos:
      900000,

    remainingBalanceInCentavos:
      2100000,

    requiredUpfrontRateBps:
      3000,

    platformCommissionRateBps:
      1000,

    platformTaxStatus:
      "vat_registered",

    platformVatRateBps:
      1200,

    financialPolicyVersion:
      4,

    providerTaxType:
      "vat_registered",

    providerTaxVerificationStatus:
      "verified",

    ...patch,
  };
}

function request(
  patch = {},
) {
  return {
    financialSnapshot:
      financialSnapshot(),

    grossSettledAmountInCentavos:
      0,

    commissionReversedInCentavos:
      0,

    ...patch,
  };
}

function createPlan(
  patch = {},
) {
  return buildSuccessfulPaymentFinancialLedgerPlan({
    paymentId:
      "payment_p8_001",

    mainEventId:
      "event_p8_001",

    providerRequestId:
      "request_p8_001",

    providerId:
      "provider_p8_001",

    customerId:
      "customer_p8_001",

    paymentChoice:
      "full",

    paymentAmountInCentavos:
      3000000,

    providerRequest:
      request(),

    webhookEventId:
      "webhook_p8_001",

    timestamp:
      {kind: "timestamp"},

    ...patch,
  });
}

test(
  "successful payment has deterministic immutable ledger identity",
  () => {
    const plan =
      createPlan();

    assert.equal(
      plan.ledgerEntryId,
      "payment_p8_001",
    );

    assert.equal(
      plan.ledgerRecord.entryType,
      "payment_settled",
    );

    assert.equal(
      plan.ledgerRecord.paymentId,
      "payment_p8_001",
    );

    assert.equal(
      plan.ledgerRecord.source,
      "paymongo_webhook",
    );
  },
);

test(
  "provider request receives cumulative financial projection",
  () => {
    const plan =
      createPlan();

    assert.equal(
      plan
        .providerRequestUpdate
        .commissionAccruedInCentavos,
      300000,
    );

    assert.equal(
      plan
        .providerRequestUpdate
        .commissionEarnedInCentavos,
      300000,
    );

    assert.equal(
      plan
        .providerRequestUpdate
        .commissionReversedInCentavos,
      0,
    );

    assert.equal(
      plan
        .providerRequestUpdate
        .providerVatAccruedInCentavos,
      321429,
    );

    assert.equal(
      plan
        .providerRequestUpdate
        .platformVatAccruedInCentavos,
      36000,
    );

    assert.equal(
      plan
        .providerRequestUpdate
        .withholdingAccruedInCentavos,
      0,
    );
  },
);

test(
  "payment receives its allocation and ledger pointer",
  () => {
    const plan =
      createPlan();

    assert.equal(
      plan
        .paymentUpdate
        .financialLedgerEntryId,
      "payment_p8_001",
    );

    assert.equal(
      plan
        .paymentUpdate
        .commissionAccruedInCentavos,
      300000,
    );

    assert.equal(
      plan
        .paymentUpdate
        .providerVatComponentInCentavos,
      321429,
    );

    assert.equal(
      plan
        .paymentUpdate
        .platformVatInCentavos,
      36000,
    );
  },
);

test(
  "deposit and balance reconcile to full commission",
  () => {
    const deposit =
      buildSuccessfulPaymentFinancialLedgerPlan({
        paymentId:
          "payment_deposit",

        mainEventId:
          "event_p8",

        providerRequestId:
          "request_p8",

        providerId:
          "provider_p8",

        customerId:
          "customer_p8",

        paymentChoice:
          "minimum",

        paymentAmountInCentavos:
          900000,

        providerRequest:
          request(),

        webhookEventId:
          "webhook_deposit",

        timestamp:
          {step: 1},
      });

    const balance =
      buildSuccessfulPaymentFinancialLedgerPlan({
        paymentId:
          "payment_balance",

        mainEventId:
          "event_p8",

        providerRequestId:
          "request_p8",

        providerId:
          "provider_p8",

        customerId:
          "customer_p8",

        paymentChoice:
          "remaining_balance",

        paymentAmountInCentavos:
          2100000,

        providerRequest:
          request({
            grossSettledAmountInCentavos:
              900000,
          }),

        webhookEventId:
          "webhook_balance",

        timestamp:
          {step: 2},
      });

    assert.equal(
      deposit
        .ledgerRecord
        .commissionAccruedInCentavos +
      balance
        .ledgerRecord
        .commissionAccruedInCentavos,
      300000,
    );

    assert.equal(
      balance
        .providerRequestUpdate
        .commissionAccruedInCentavos,
      300000,
    );
  },
);

test(
  "unsupported payment choice fails closed",
  () => {
    assert.throws(
      () =>
        createPlan({
          paymentChoice:
            "custom_amount",
        }),
      /payment choice is invalid/u,
    );
  },
);