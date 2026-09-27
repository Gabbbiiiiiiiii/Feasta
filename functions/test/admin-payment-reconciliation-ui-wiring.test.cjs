const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const root =
  path.join(
    __dirname,
    "..",
    "..",
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      ...relativePath.split("/"),
    ),
    "utf8",
  );
}

test(
  "Admin payment details expose Provider earning and settlement truth",
  () => {
    const types =
      read(
        "apps/web/src/lib/admin/payments/admin-payment-types.ts",
      );

    assert.match(
      types,
      /providerFinance:\s*AdminPaymentProviderFinance/u,
    );

    assert.match(
      types,
      /availableAmountInCentavos/u,
    );

    assert.match(
      types,
      /paidOutAmountInCentavos/u,
    );

    assert.match(
      types,
      /reconciliationRequired/u,
    );

    assert.match(
      types,
      /activePayoutAttemptId/u,
    );

    assert.match(
      types,
      /lastPayoutAttemptId/u,
    );
  },
);

test(
  "Provider finance enrichment runs only for Admin payment details",
  () => {
    const service =
      read(
        "apps/web/src/lib/admin/payments/admin-payment-service.ts",
      );

    const pageStart =
      service.indexOf(
        "export async function getAdminPaymentPage",
      );

    const detailsStart =
      service.indexOf(
        "export async function getAdminPaymentDetails",
      );

    assert.ok(
      pageStart >= 0 &&
      detailsStart > pageStart,
    );

    const pageSource =
      service.slice(
        pageStart,
        detailsStart,
      );

    assert.doesNotMatch(
      pageSource,
      /providerEarnings/u,
    );

    assert.doesNotMatch(
      pageSource,
      /providerSettlements/u,
    );

    const detailsSource =
      service.slice(
        detailsStart,
      );

    assert.match(
      detailsSource,
      /loadAdminPaymentProviderFinance\(payment\)/u,
    );

    assert.match(
      detailsSource,
      /"providerEarnings"/u,
    );

    assert.match(
      detailsSource,
      /"providerSettlements"/u,
    );
  },
);

test(
  "Admin reconciliation reads are bounded and server-side",
  () => {
    const service =
      read(
        "apps/web/src/lib/admin/payments/admin-payment-service.ts",
      );

    assert.match(
      service,
      /\.where\(\s*"paymentId"/u,
    );

    assert.match(
      service,
      /\.limit\(2\)/u,
    );

    assert.match(
      service,
      /\.limit\(3\)/u,
    );

    const client =
      read(
        "apps/web/src/components/admin/payments/payment-monitoring-client.tsx",
      );

    const drawer =
      read(
        "apps/web/src/components/admin/payments/payment-details-drawer.tsx",
      );

    assert.doesNotMatch(
      client,
      /providerEarnings|providerSettlements/u,
    );

    assert.doesNotMatch(
      drawer,
      /collection\(|getFirestore|firebase\/firestore/u,
    );
  },
);

test(
  "Admin UI separates Customer collection from Provider settlement",
  () => {
    const drawer =
      read(
        "apps/web/src/components/admin/payments/payment-details-drawer.tsx",
      );

    assert.match(
      drawer,
      /Provider earning/u,
    );

    assert.match(
      drawer,
      /Available for settlement/u,
    );

    assert.match(
      drawer,
      /Provider settlement/u,
    );

    assert.match(
      drawer,
      /Reconciliation required/u,
    );

    assert.match(
      drawer,
      /does not by itself mean the Provider\s+has been paid/u,
    );
  },
);

test(
  "E3A exposes reconciliation without Provider payout mutation controls",
  () => {
    const drawer =
      read(
        "apps/web/src/components/admin/payments/payment-details-drawer.tsx",
      );

    for (
      const forbidden of [
        "Retry payout",
        "Force reconcile",
        "Mark paid",
        "Release settlement",
        "Send payout",
        "Withdraw",
      ]
    ) {
      assert.doesNotMatch(
        drawer,
        new RegExp(
          forbidden,
          "u",
        ),
      );
    }
  },
);

test(
  "P10 Provider finance collections remain backend-only",
  () => {
    const rules =
      read(
        "firebase/firestore.rules",
      );

    for (
      const collection of [
        "providerPaymentAccounts",
        "providerEarnings",
        "providerSettlements",
        "providerPayoutAttempts",
      ]
    ) {
      const matchIndex =
        rules.indexOf(
          `match /${collection}/`,
        );

      assert.notEqual(
        matchIndex,
        -1,
        `${collection} rules are missing`,
      );

      const section =
        rules.slice(
          matchIndex,
          matchIndex + 300,
        );

      assert.match(
        section,
        /allow read, write: if false;/u,
      );
    }
  },
);