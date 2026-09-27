const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  buildProviderEarningRefundPlan,
  buildSuccessfulPaymentProviderEarningPlan,
  providerEarningIdForPayment,
} =
  require(path.resolve(
    __dirname,
    "../lib/provider-finance/provider-earning-domain.js",
  ));

function paymentLedger(
  patch = {},
) {
  return {
    schemaVersion: 1,
    entryType:
      "payment_settled",

    ledgerEntryId:
      "payment_p9",

    paymentId:
      "payment_p9",

    mainEventId:
      "event_p9",

    providerRequestId:
      "request_p9",

    providerId:
      "provider_p9",

    customerId:
      "customer_p9",

    currency:
      "PHP",

    grossAmountInCentavos:
      3000000,

    commissionAccruedInCentavos:
      300000,

    providerVatInCentavos:
      321429,

    platformVatInCentavos:
      36000,

    withholdingInCentavos:
      0,

    ...patch,
  };
}

function pendingPlan(
  patch = {},
) {
  return buildSuccessfulPaymentProviderEarningPlan({
    paymentId:
      "payment_p9",

    mainEventId:
      "event_p9",

    providerRequestId:
      "request_p9",

    providerId:
      "provider_p9",

    customerId:
      "customer_p9",

    financialLedgerRecord:
      paymentLedger(),

    timestamp:
      {kind: "timestamp"},

    ...patch,
  });
}

function refundLedger(
  patch = {},
) {
  return {
    schemaVersion: 1,

    entryType:
      "refund_completed",

    ledgerEntryId:
      "refund_operation_p9",

    paymentId:
      "payment_p9",

    currency:
      "PHP",

    refundAmountInCentavos:
      1000000,

    commissionReversedInCentavos:
      100000,

    withholdingReversedInCentavos:
      0,

    ...patch,
  };
}

test(
  "provider earning uses gross minus commission and withholding",
  () => {
    const result =
      pendingPlan();

    assert.equal(
      result.earningId,
      "payment_p9",
    );

    assert.equal(
      result
        .earningRecord
        .earningAmountInCentavos,
      2700000,
    );

    assert.equal(
      result
        .earningRecord
        .pendingAmountInCentavos,
      2700000,
    );

    assert.equal(
      result
        .earningRecord
        .status,
      "pending",
    );
  },
);

test(
  "provider VAT remains informational and is not deducted from earnings",
  () => {
    const withVat =
      pendingPlan();

    const withoutVat =
      pendingPlan({
        financialLedgerRecord:
          paymentLedger({
            providerVatInCentavos:
              0,
          }),
      });

    assert.equal(
      withVat
        .earningRecord
        .earningAmountInCentavos,
      withoutVat
        .earningRecord
        .earningAmountInCentavos,
    );

    assert.equal(
      withVat
        .earningRecord
        .providerVatComponentInCentavos,
      321429,
    );
  },
);

test(
  "platform VAT is not silently deducted from provider earnings",
  () => {
    const result =
      pendingPlan();

    assert.equal(
      result
        .earningRecord
        .platformVatOnCommissionInCentavos,
      36000,
    );

    assert.equal(
      result
        .earningRecord
        .earningAmountInCentavos,
      2700000,
    );
  },
);

test(
  "partial refund reverses only the provider economic share",
  () => {
    const created =
      pendingPlan();

    const reversal =
      buildProviderEarningRefundPlan({
        paymentId:
          "payment_p9",

        earningId:
          "payment_p9",

        earning:
          created.earningRecord,

        refundFinancialLedgerRecord:
          refundLedger(),

        timestamp:
          {kind: "refund"},
      });

    assert.equal(
      reversal
        .earningUpdate
        .reversedAmountInCentavos,
      900000,
    );

    assert.equal(
      reversal
        .earningUpdate
        .pendingAmountInCentavos,
      1800000,
    );

    assert.equal(
      reversal
        .earningUpdate
        .netEarningAmountInCentavos,
      1800000,
    );

    assert.equal(
      reversal
        .earningUpdate
        .status,
      "pending",
    );
  },
);

test(
  "full refund changes a pending earning to reversed",
  () => {
    const created =
      pendingPlan();

    const reversal =
      buildProviderEarningRefundPlan({
        paymentId:
          "payment_p9",

        earningId:
          "payment_p9",

        earning:
          created.earningRecord,

        refundFinancialLedgerRecord:
          refundLedger({
            refundAmountInCentavos:
              3000000,

            commissionReversedInCentavos:
              300000,
          }),

        timestamp:
          {kind: "refund"},
      });

    assert.equal(
      reversal
        .earningUpdate
        .reversedAmountInCentavos,
      2700000,
    );

    assert.equal(
      reversal
        .earningUpdate
        .pendingAmountInCentavos,
      0,
    );

    assert.equal(
      reversal
        .earningUpdate
        .netEarningAmountInCentavos,
      0,
    );

    assert.equal(
      reversal
        .earningUpdate
        .status,
      "reversed",
    );
  },
);

test(
  "refund cannot silently rewrite already paid provider earnings",
  () => {
    const created =
      pendingPlan();

    const paid =
      {
        ...created.earningRecord,

        status:
          "paid",

        pendingAmountInCentavos:
          0,

        paidAmountInCentavos:
          2700000,
      };

    assert.throws(
      () =>
        buildProviderEarningRefundPlan({
          paymentId:
            "payment_p9",

          earningId:
            "payment_p9",

          earning:
            paid,

          refundFinancialLedgerRecord:
            refundLedger(),

          timestamp:
            {kind: "refund"},
        }),
      /requires payout reconciliation/u,
    );
  },
);

test(
  "successful payment ledger linkage fails closed",
  () => {
    assert.throws(
      () =>
        pendingPlan({
          financialLedgerRecord:
            paymentLedger({
              providerId:
                "provider_wrong",
            }),
        }),
      /financial ledger linkage is invalid/u,
    );
  },
);

test(
  "earning identity is deterministic from payment identity",
  () => {
    assert.equal(
      providerEarningIdForPayment(
        "payment_abc_123",
      ),
      "payment_abc_123",
    );
  },
);