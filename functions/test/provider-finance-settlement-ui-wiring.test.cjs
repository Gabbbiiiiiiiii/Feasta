const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const repoRoot =
  path.join(
    __dirname,
    "..",
    "..",
  );

function read(
  relativePath,
) {
  return fs.readFileSync(
    path.join(
      repoRoot,
      ...relativePath.split("/"),
    ),
    "utf8",
  );
}

test(
  "Provider finance projection reads Provider settlements server-side",
  () => {
    const source =
      read(
        "apps/web/src/lib/provider/payments/provider-finance-service.ts",
      );

    assert.match(
      source,
      /collection\(\s*"providerSettlements"\s*,?\s*\)/su,
    );

    assert.match(
      source,
      /\.where\(\s*"providerId"\s*,\s*"=="\s*,\s*providerId\s*,?\s*\)/su,
    );

    assert.match(
      source,
      /normalizeSettlement/u,
    );

    assert.match(
      source,
      /reconciliationRequired/u,
    );
  },
);

test(
  "Provider finance types separate earning truth from settlement truth",
  () => {
    const source =
      read(
        "apps/web/src/lib/provider/payments/provider-finance-types.ts",
      );

    assert.match(
      source,
      /ProviderEarningSummary/u,
    );

    assert.match(
      source,
      /ProviderSettlementSummary/u,
    );

    assert.match(
      source,
      /"awaiting_availability"/u,
    );

    assert.match(
      source,
      /"reconciliation_required"/u,
    );

    assert.match(
      source,
      /settlementTransportReady/u,
    );
  },
);

test(
  "Provider finance UI never equates linked-account readiness with payout transport",
  () => {
    const source =
      read(
        "apps/web/src/app/provider/payments/provider-finance-panel.tsx",
      );

    assert.match(
      source,
      /settlementTransportReady/u,
    );

    assert.match(
      source,
      /Settlement transport verified/u,
    );

    assert.doesNotMatch(
      source,
      />\s*Ready for payouts\s*</u,
    );
  },
);

test(
  "Provider settlement UI exposes reconciliation without payout controls",
  () => {
    const source =
      read(
        "apps/web/src/app/provider/payments/provider-finance-panel.tsx",
      );

    assert.match(
      source,
      /Provider settlements/u,
    );

    assert.match(
      source,
      /Review required/u,
    );

    assert.match(
      source,
      /reservedAmountInCentavos/u,
    );

    assert.match(
      source,
      /paidOutAmountInCentavos/u,
    );

    assert.doesNotMatch(
      source,
      /Withdraw/u,
    );

    assert.doesNotMatch(
      source,
      /Send payout/u,
    );
  },
);

test(
  "Provider settlement collections remain backend-only",
  () => {
    const source =
      read(
        "firebase/firestore.rules",
      );

    assert.match(
      source,
      /match \/providerSettlements\/\{settlementId\}[\s\S]*?allow read, write:\s*if false;/u,
    );

    assert.match(
      source,
      /match \/providerPayoutAttempts\/\{attemptId\}[\s\S]*?allow read, write:\s*if false;/u,
    );
  },
);