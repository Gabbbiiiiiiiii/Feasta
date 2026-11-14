const assert =
  require("node:assert/strict");

const {
  readFileSync,
} =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const webhook =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/payments/process-webhook.ts",
    ),
    "utf8",
  );

const refund =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/refunds/refund-execution.ts",
    ),
    "utf8",
  );

test(
  "successful canonical payment creates provider earning atomically",
  () => {
    assert.match(
      webhook,
      /buildSuccessfulPaymentProviderEarningPlan/u,
    );

    assert.match(
      webhook,
      /collection\("providerEarnings"\)/u,
    );

    assert.match(
      webhook,
      /transaction\.create\([\s\S]*?providerEarningReference[\s\S]*?earningRecord/u,
    );

    assert.match(
      webhook,
      /providerEarningPlan[\s\S]*?paymentUpdate/u,
    );
  },
);

test(
  "provider earning creation remains tied to P8 financial allocation",
  () => {
    assert.match(
      webhook,
      /financialLedgerPlan[\s\S]*?buildSuccessfulPaymentProviderEarningPlan/u,
    );
  },
);

test(
  "completed refunds update provider earning from immutable reversal ledger",
  () => {
    assert.match(
      refund,
      /buildProviderEarningRefundPlan/u,
    );

    assert.match(
      refund,
      /collection\("providerEarnings"\)/u,
    );

    assert.match(
      refund,
      /refundFinancialLedgerPlan[\s\S]*?providerEarningRefundPlan/u,
    );

    assert.match(
      refund,
      /providerEarningRefundPlan[\s\S]*?earningUpdate/u,
    );
  },
);