const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  buildSuccessfulRefundFinancialLedgerPlan,
} =
  require(path.resolve(
    __dirname,
    "../lib/payments/financial-ledger.js",
  ));

function request(
  patch = {},
) {
  return {
    financialLedgerSchemaVersion:
      1,

    commissionAccruedInCentavos:
      300000,

    commissionReversedInCentavos:
      0,

    commissionEarnedInCentavos:
      300000,

    providerVatAccruedInCentavos:
      321429,

    platformVatAccruedInCentavos:
      36000,

    withholdingAccruedInCentavos:
      0,

    ...patch,
  };
}

function payment(
  patch = {},
) {
  return {
    financialLedgerSchemaVersion:
      1,

    financialLedgerEntryId:
      "payment_p8",

    amountInCentavos:
      3000000,

    commissionAccruedInCentavos:
      300000,

    providerVatComponentInCentavos:
      321429,

    platformVatInCentavos:
      36000,

    withholdingInCentavos:
      0,

    ...patch,
  };
}

function plan(
  patch = {},
) {
  return buildSuccessfulRefundFinancialLedgerPlan({
    paymentId:
      "payment_p8",

    refundOperationId:
      "operation_p8",

    mainEventId:
      "event_p8",

    providerRequestId:
      "request_p8",

    providerId:
      "provider_p8",

    customerId:
      "customer_p8",

    refundAmountInCentavos:
      3000000,

    refundedBeforeInCentavos:
      0,

    payment:
      payment(),

    providerRequest:
      request(),

    source:
      "paymongo_webhook",

    webhookEventId:
      "webhook_refund_p8",

    timestamp:
      {kind: "timestamp"},

    ...patch,
  });
}

test(
  "full refund reverses the exact payment financial allocation",
  () => {
    const result =
      plan();

    assert.equal(
      result
        .paymentUpdate
        .commissionReversedInCentavos,
      300000,
    );

    assert.equal(
      result
        .paymentUpdate
        .providerVatReversedInCentavos,
      321429,
    );

    assert.equal(
      result
        .paymentUpdate
        .platformVatReversedInCentavos,
      36000,
    );

    assert.equal(
      result
        .providerRequestUpdate
        .commissionEarnedInCentavos,
      0,
    );

    assert.equal(
      result
        .providerRequestUpdate
        .withholdingNetInCentavos,
      0,
    );
  },
);

test(
  "partial refunds reconcile cumulatively to the exact full reversal",
  () => {
    const first =
      plan({
        refundOperationId:
          "operation_first",

        refundAmountInCentavos:
          1000000,
      });

    const second =
      plan({
        refundOperationId:
          "operation_second",

        refundAmountInCentavos:
          2000000,

        refundedBeforeInCentavos:
          1000000,

        payment:
          payment({
            commissionReversedInCentavos:
              first
                .paymentUpdate
                .commissionReversedInCentavos,

            providerVatReversedInCentavos:
              first
                .paymentUpdate
                .providerVatReversedInCentavos,

            platformVatReversedInCentavos:
              first
                .paymentUpdate
                .platformVatReversedInCentavos,

            withholdingReversedInCentavos:
              0,
          }),

        providerRequest:
          request({
            commissionReversedInCentavos:
              first
                .providerRequestUpdate
                .commissionReversedInCentavos,

            commissionEarnedInCentavos:
              first
                .providerRequestUpdate
                .commissionEarnedInCentavos,

            providerVatReversedInCentavos:
              first
                .providerRequestUpdate
                .providerVatReversedInCentavos,

            platformVatReversedInCentavos:
              first
                .providerRequestUpdate
                .platformVatReversedInCentavos,
          }),
      });

    assert.equal(
      second
        .paymentUpdate
        .commissionReversedInCentavos,
      300000,
    );

    assert.equal(
      second
        .paymentUpdate
        .providerVatReversedInCentavos,
      321429,
    );

    assert.equal(
      second
        .paymentUpdate
        .platformVatReversedInCentavos,
      36000,
    );

    assert.equal(
      second
        .providerRequestUpdate
        .commissionEarnedInCentavos,
      0,
    );
  },
);

test(
  "refund ledger entry is immutable and deterministic per operation",
  () => {
    const result =
      plan();

    assert.equal(
      result.ledgerEntryId,
      "refund_operation_p8",
    );

    assert.equal(
      result
        .ledgerRecord
        .entryType,
      "refund_completed",
    );

    assert.equal(
      result
        .ledgerRecord
        .originalPaymentLedgerEntryId,
      "payment_p8",
    );

    assert.equal(
      result
        .ledgerRecord
        .calculationSnapshot
        .reversalPolicy,
      "proportional_to_completed_refund_v1",
    );
  },
);

test(
  "withholding remains modeled but unapplied",
  () => {
    const result =
      plan();

    assert.equal(
      result
        .ledgerRecord
        .withholdingReversedInCentavos,
      0,
    );

    assert.throws(
      () =>
        plan({
          payment:
            payment({
              withholdingInCentavos:
                1,
            }),
        }),
      /withholding reversal is not enabled/u,
    );
  },
);

test(
  "stored reversal must match previous refund accounting",
  () => {
    assert.throws(
      () =>
        plan({
          refundAmountInCentavos:
            1000000,

          refundedBeforeInCentavos:
            1000000,

          payment:
            payment({
              commissionReversedInCentavos:
                0,
            }),
        }),
      /does not match previous refund accounting/u,
    );
  },
);