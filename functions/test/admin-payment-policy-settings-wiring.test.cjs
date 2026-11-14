const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

const types = read(
  "apps/web/src/lib/admin/settings/admin-settings-types.ts",
);

const validation = read(
  "apps/web/src/lib/admin/settings/admin-settings-validation.ts",
);

const service = read(
  "apps/web/src/lib/admin/settings/admin-settings-service.ts",
);

const client = read(
  "apps/web/src/components/admin/settings/admin-financial-policy-client.tsx",
);

const rules = read(
  "firebase/firestore.rules",
);

const fields = [
  "minimumDepositRateBps",
  "maximumDepositRateBps",
  "minimumBalanceDueDaysBeforeEvent",
  "maximumBalanceDueDaysBeforeEvent",
];

test(
  "P11-C1 exposes canonical payment-term policy fields through Admin settings",
  () => {
    for (const field of fields) {
      assert.match(
        types,
        new RegExp(field, "u"),
      );

      assert.match(
        validation,
        new RegExp(field, "u"),
      );

      assert.match(
        service,
        new RegExp(field, "u"),
      );
    }
  },
);

test(
  "P11-C1 reuses canonical shared payment defaults",
  () => {
    for (const constant of [
      "MIN_DEPOSIT_RATE_BPS",
      "MAX_DEPOSIT_RATE_BPS",
      "MIN_BALANCE_DUE_DAYS_BEFORE_EVENT",
      "MAX_BALANCE_DUE_DAYS_BEFORE_EVENT",
    ]) {
      assert.match(
        service,
        new RegExp(
          constant,
          "u",
        ),
      );
    }
  },
);

test(
  "P11-C1 persists and audits payment-term bounds in the same financial policy",
  () => {
    assert.match(
      service,
      /financialFields/u,
    );

    assert.match(
      service,
      /financialAuditSnapshot/u,
    );

    for (const field of fields) {
      assert.match(
        service,
        new RegExp(field, "u"),
      );
    }

    assert.match(
      service,
      /financialPolicyVersion/u,
    );

    assert.doesNotMatch(
      service,
      /paymentPolicyVersion|depositPolicyVersion|balancePolicyVersion/u,
    );
  },
);

test(
  "P11-C1 Admin UI exposes deposit controls, fixed balance deadline, and immutable-history copy",
  () => {
    for (const label of [
      "Minimum deposit (%)",
      "Maximum deposit (%)",
    ]) {
      assert.match(
        client,
        new RegExp(
          label.replace(
            /[()[\].+*?^$|{}\\]/gu,
            "\\$&",
          ),
          "u",
        ),
      );
    }

    assert.match(
      client,
      /Remaining balance deadline/u,
    );

    assert.match(
      client,
      /24 hours before scheduled event start/u,
    );

    assert.match(
      client,
      /Existing booking financial[\s\S]*snapshots are not recalculated/u,
    );
  },
);

test(
  "P11-C1 keeps platform settings server-write-only for client mutations",
  () => {
    const start =
      rules.indexOf(
        "match /appSettings/{settingId}",
      );

    assert.ok(start >= 0);

    const block =
      rules.slice(
        start,
        start + 1000,
      );

    assert.match(
      block,
      /settingId != 'platform'/u,
    );

    assert.match(
      block,
      /allow delete: if false/u,
    );
  },
);

test(
  "P11-C1 Admin settings do not mutate historical finance truth",
  () => {
    for (const collection of [
      "payments",
      "providerEarnings",
      "providerSettlements",
      "providerPayoutAttempts",
      "financialLedgerEntries",
      "providerRequests",
      "mainEvents",
    ]) {
      assert.doesNotMatch(
        service,
        new RegExp(
          `\\.collection\\(\\s*["']${collection}["']`,
          "u",
        ),
      );
    }
  },
);