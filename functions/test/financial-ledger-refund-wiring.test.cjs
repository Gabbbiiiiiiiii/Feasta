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

const source =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/refunds/refund-execution.ts",
    ),
    "utf8",
  );

test(
  "completed canonical refund builds proportional financial reversal",
  () => {
    assert.match(
      source,
      /buildSuccessfulRefundFinancialLedgerPlan/u,
    );

    assert.match(
      source,
      /financialLedgerSchemaVersion[\s\S]*?===\s*[\s\S]*?1/u,
    );

    assert.match(
      source,
      /refundAmountInCentavos:[\s\S]*?amount/u,
    );
  },
);

test(
  "completed refund creates immutable financial ledger entry",
  () => {
    assert.match(
      source,
      /financialLedgerEntries/u,
    );

    assert.match(
      source,
      /transaction\.create\([\s\S]*?refundFinancialLedgerReference/u,
    );
  },
);

test(
  "refund projections update payment and provider request",
  () => {
    assert.match(
      source,
      /refundFinancialLedgerPlan[\s\S]*?paymentUpdate/u,
    );

    assert.match(
      source,
      /refundFinancialLedgerPlan[\s\S]*?providerRequestUpdate/u,
    );
  },
);