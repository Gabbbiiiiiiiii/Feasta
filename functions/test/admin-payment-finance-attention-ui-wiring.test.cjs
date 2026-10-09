const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root =
  path.join(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      ...relativePath.split("/"),
    ),
    "utf8",
  );
}

const page = read(
  "apps/web/src/app/admin/payments/page.tsx",
);

const actions = read(
  "apps/web/src/app/admin/payments/actions.ts",
);

const client = read(
  "apps/web/src/components/admin/payments/payment-monitoring-client.tsx",
);

const attention = read(
  "apps/web/src/components/admin/payments/payment-finance-attention.tsx",
);

test(
  "P11 Admin Payment Monitoring server-loads Finance Attention",
  () => {
    assert.match(
      page,
      /getAdminFinanceAttentionQueue/u,
    );

    assert.match(
      page,
      /initialAttention/u,
    );

    assert.match(
      actions,
      /loadAdminFinanceAttentionQueueAction/u,
    );

    assert.match(
      actions,
      /getAdminFinanceAttentionQueue/u,
    );
  },
);

test(
  "P11 Finance Attention exposes failed payouts and reconciliation cases",
  () => {
    assert.match(
      attention,
      /Provider payout issues/u,
    );

    assert.match(
      attention,
      /Failed Provider payout/u,
    );

    assert.match(
      attention,
      /Payout to review/u,
    );

    assert.match(
      attention,
      /label="Recorded reason" value=\{item\.reason \?\? "No additional reason was recorded\."\}/u,
    );
  },
);

test(
  "P11 Finance Attention opens the existing payment detail workflow",
  () => {
    assert.match(
      attention,
      /View payment details/u,
    );

    assert.match(
      attention,
      /onViewPayment/u,
    );

    assert.match(
      client,
      /onViewPayment=\{[\s\S]*openPaymentDetails/u,
    );
  },
);

test(
  "P11 Finance Attention refreshes independently",
  () => {
    assert.match(
      client,
      /refreshFinanceAttention/u,
    );

    assert.match(
      client,
      /loadAdminFinanceAttentionQueueAction/u,
    );

    assert.match(
      attention,
      /"Refresh"/u,
    );
  },
);

test(
  "P11 Finance Attention stays DTO-only in the client",
  () => {
    assert.doesNotMatch(
      attention,
      /providerPayoutAttempts/u,
    );

    assert.doesNotMatch(
      attention,
      /providerSettlements/u,
    );

    assert.doesNotMatch(
      attention,
      /firebase-admin/u,
    );
  },
);

test(
  "P11 Finance Attention allows only guarded payout setup recovery",
  () => {
    for (const forbidden of [
      "Retry payout",
      "Force reconcile",
      "Mark paid",
      "Release settlement",
      "Send payout",
      "Withdraw payout",
    ]) {
      assert.doesNotMatch(
        attention,
        new RegExp(forbidden, "iu"),
      );
    }

    assert.match(
      attention,
      /ambiguous_payout_setup/u,
    );

    assert.match(
      attention,
      /Repair payout setup/u,
    );

    assert.match(
      attention,
      /onRepairPayoutSetup/u,
    );

    assert.match(
      attention,
      /expectedUpdatedAtMillis/u,
    );

    assert.match(
      attention,
      /item\.recordState\s*===\s*"valid"[\s\S]*item\.providerId[\s\S]*item\.expectedUpdatedAtMillis/u,
    );

    assert.match(
      attention,
      /did not pass validation[\s\S]*Refresh Provider payout issues/u,
    );
  },
);
