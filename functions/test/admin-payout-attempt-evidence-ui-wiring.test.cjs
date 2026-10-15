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
  "Admin payout attempt type matches the canonical P10 status contract",
  () => {
    const types =
      read(
        "apps/web/src/lib/admin/payments/admin-payment-types.ts",
      );

    for (
      const status of [
        "reserved",
        "dispatching",
        "submitted",
        "processing",
        "succeeded",
        "failed",
        "ambiguous",
      ]
    ) {
      assert.match(
        types,
        new RegExp(
          `"${status}"`,
          "u",
        ),
      );
    }

    assert.match(
      types,
      /gatewayResourceId/u,
    );

    assert.match(
      types,
      /failureCode/u,
    );

    assert.match(
      types,
      /failureMessage/u,
    );

    assert.match(
      types,
      /submittedAt/u,
    );

    assert.match(
      types,
      /completedAt/u,
    );
  },
);

test(
  "Admin payout attempt evidence uses canonical settlement references",
  () => {
    const service =
      read(
        "apps/web/src/lib/admin/payments/admin-payment-service.ts",
      );

    assert.match(
      service,
      /activePayoutAttemptId/u,
    );

    assert.match(
      service,
      /lastPayoutAttemptId/u,
    );

    assert.match(
      service,
      /loadAdminProviderPayoutAttempts/u,
    );
  },
);

test(
  "Admin payout evidence uses direct bounded document reads instead of collection scans",
  () => {
    const service =
      read(
        "apps/web/src/lib/admin/payments/admin-payment-service.ts",
      );

    const start =
      service.indexOf(
        "async function loadAdminProviderPayoutAttempts",
      );

    const end =
      service.indexOf(
        "function mapAdminProviderPayoutAttempt",
        start,
      );

    assert.ok(
      start >= 0 &&
      end > start,
    );

    const loader =
      service.slice(
        start,
        end,
      );

    assert.match(
      loader,
      /"providerPayoutAttempts"/u,
    );

    assert.match(
      loader,
      /\.doc\(attemptId\)/u,
    );

    assert.doesNotMatch(
      loader,
      /\.where\(/u,
    );
  },
);

test(
  "Admin payout attempt validation fails closed on canonical linkage",
  () => {
    const service =
      read(
        "apps/web/src/lib/admin/payments/admin-payment-service.ts",
      );

    assert.match(
      service,
      /payoutAttemptId !==\s*expectedAttemptId/u,
    );

    assert.match(
      service,
      /settlementId !==\s*settlement\.settlementId/u,
    );

    assert.match(
      service,
      /earningId !==\s*settlement\.earningId/u,
    );

    assert.match(
      service,
      /providerId !==\s*payment\.providerId/u,
    );

    assert.match(
      service,
      /data\.gateway !== "paymongo"/u,
    );

    assert.match(
      service,
      /data\.currency !== "PHP"/u,
    );
  },
);

test(
  "Admin drawer exposes exact read-only payout reconciliation evidence",
  () => {
    const drawer =
      read(
        "apps/web/src/components/admin/payments/payment-details-drawer.tsx",
      );

    for (
      const label of [
        "Payout attempt evidence",
        "Active payout attempt",
        "Last payout attempt",
        "Payment service reference",
        "Failure code",
        "Failure message",
        "Submitted",
        "Completed",
      ]
    ) {
      assert.match(
        drawer,
        new RegExp(
          label,
          "u",
        ),
      );
    }

    assert.match(
      drawer,
      /This information is read-only\./u,
    );
  },
);

test(
  "E3B does not add settlement or payout mutation controls",
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

    const rules =
      read(
        "firebase/firestore.rules",
      );

    const attemptRule =
      rules.indexOf(
        "match /providerPayoutAttempts/",
      );

    assert.notEqual(
      attemptRule,
      -1,
    );

    assert.match(
      rules.slice(
        attemptRule,
        attemptRule + 250,
      ),
      /allow read, write: if false;/u,
    );
  },
);
