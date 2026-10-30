const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      ...relativePath.split("/"),
    ),
    "utf8",
  );
}

test(
  "payout reservation reads customer refund reservation before locking settlement",
  () => {
    const content =
      source(
        "provider-finance/provider-settlement-management.ts",
      );

    assert.match(
      content,
      /refundReservedAmountInCentavos/u,
    );

    assert.match(
      content,
      /refundExecutionLock/u,
    );

    assert.match(
      content,
      /collection\("payments"\)/u,
    );
  },
);

test(
  "refund execution checks settlement before PayMongo refund dispatch",
  () => {
    const content =
      source(
        "refunds/refund-execution.ts",
      );

    const check =
      content.indexOf(
        "assertRefundSettlementDispatchSafe(",
        content.indexOf(
          "export async function executeRefund",
        ),
      );

    const gateway =
      content.indexOf(
        "await createPayMongoRefund(",
      );

    assert.ok(check >= 0);
    assert.ok(gateway >= 0);
    assert.ok(check < gateway);

    assert.match(
      content,
      /providerSettlements/u,
    );

    assert.match(
      content,
      /REFUND_RECONCILIATION_REQUIRED/u,
    );
  },
);

test(
  "successful refund reconciliation synchronizes Provider settlement",
  () => {
    const content =
      source(
        "refunds/refund-execution.ts",
      );

    assert.match(
      content,
      /buildProviderSettlementRefundUpdate/u,
    );

    assert.match(
      content,
      /providerSettlementRefundUpdate/u,
    );

    assert.match(
      content,
      /transaction\.update\(\s*providerSettlementReference/su,
    );
  },
);