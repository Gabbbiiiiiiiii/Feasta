const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root =
  path.join(
    __dirname,
    "..",
    "src",
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8",
  );
}

test(
  "successful payment creates Provider settlement from canonical earning",
  () => {
    const source =
      read(
        "payments/process-webhook.ts",
      );

    assert.match(
      source,
      /buildProviderSettlementPlan/u,
    );

    assert.match(
      source,
      /\.collection\("providerSettlements"\)/u,
    );

    assert.match(
      source,
      /providerEarningPlan\s*\.earningRecord/su,
    );

    assert.match(
      source,
      /providerSettlementPlan\s*\.settlementRecord/su,
    );
  },
);

test(
  "settlement conflict fails closed before duplicate finance creation",
  () => {
    const source =
      read(
        "payments/process-webhook.ts",
      );

    assert.match(
      source,
      /provider_settlement_conflict/u,
    );

    const conflictCheck =
      source.indexOf(
        "providerSettlementSnapshot?.exists",
      );

    const normalCreate =
      source.lastIndexOf(
        "transaction.create(\n" +
        "          providerSettlementReference",
      );

    assert.ok(
      conflictCheck >= 0,
    );

    assert.ok(
      normalCreate > conflictCheck,
      "Settlement conflict check must precede creation.",
    );
  },
);

test(
  "settlement is persisted on lifecycle conflict",
  () => {
    const source =
      read(
        "payments/process-webhook.ts",
      );

    const conflictStart =
      source.indexOf(
        "if (conflictReason) {",
      );

    const normalStart =
      source.indexOf(
        "const requestPaymentUpdate",
      );

    assert.ok(
      conflictStart >= 0 &&
      normalStart > conflictStart,
    );

    const block =
      source.slice(
        conflictStart,
        normalStart,
      );

    assert.match(
      block,
      /providerSettlementReference/u,
    );

    assert.match(
      block,
      /settlementRecord/u,
    );
  },
);

test(
  "payment webhook never claims Provider payout completion",
  () => {
    const source =
      read(
        "payments/process-webhook.ts",
      );

    assert.doesNotMatch(
      source,
      /providerPaidOut\s*:\s*true/u,
    );
  },
);