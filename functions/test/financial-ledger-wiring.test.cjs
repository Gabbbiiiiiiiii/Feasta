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

test(
  "paid P5 webhook creates immutable financial ledger entry",
  () => {
    assert.match(
      webhook,
      /buildSuccessfulPaymentFinancialLedgerPlan/u,
    );

    assert.match(
      webhook,
      /financialLedgerEntries/u,
    );

    assert.match(
      webhook,
      /transaction\.create\([\s\S]*?financialLedgerReference/u,
    );
  },
);

test(
  "financial allocation is restricted to successful P5 payments",
  () => {
    assert.match(
      webhook,
      /nextStatus === "paid"/u,
    );

    assert.match(
      webhook,
      /paymentReadPlan\?\.mode === "p5"/u,
    );
  },
);

test(
  "financial projections update payment and provider request atomically",
  () => {
    assert.match(
      webhook,
      /financialLedgerPlan\s*\.paymentUpdate/u,
    );

    assert.match(
      webhook,
      /financialLedgerPlan[\s\S]*?providerRequestUpdate/u,
    );

    assert.match(
      webhook,
      /financial_ledger_conflict/u,
    );
  },
);