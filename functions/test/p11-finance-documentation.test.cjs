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

const business =
  read(
    "docs/domain/payment-business-contract.md",
  );

const finance =
  read(
    "docs/domain/provider-finance-and-payouts.md",
  );

const payments =
  read(
    "docs/domain/payments.md",
  );

const schema =
  read(
    "docs/domain/payment-schema.md",
  );

test(
  "P11 docs describe package limits as versioned policy rather than permanent fixed business rules",
  () => {
    assert.match(
      business,
      /current versioned FEASTA payment-term policy/u,
    );

    assert.match(
      business,
      /initial\/default deposit range is 20% to 80%/u,
    );

    assert.match(
      business,
      /initial\/default remaining-balance deadline range is 1 to 30 days/u,
    );

    assert.match(
      business,
      /financialPolicyVersion/u,
    );

    assert.doesNotMatch(
      business,
      /rate will later be versioned\/configurable/u,
    );

    assert.doesNotMatch(
      business,
      /tax status and VAT rate must later be versioned configuration/u,
    );
  },
);

test(
  "P11 finance docs preserve Customer collection and Provider settlement as separate truths",
  () => {
    assert.match(
      finance,
      /## P11 Admin Payment Monitoring and Payment Settings/u,
    );

    assert.match(
      finance,
      /failed Provider payout attempts/u,
    );

    assert.match(
      finance,
      /reconciliation_required/u,
    );

    assert.match(
      payments,
      /Customer payment success does not imply Provider payout success/u,
    );
  },
);

test(
  "P11 docs record one versioned financial policy",
  () => {
    for (
      const field of [
        "platformCommissionRateBps",
        "platformTaxStatus",
        "platformVatRateBps",
        "minimumDepositRateBps",
        "maximumDepositRateBps",
        "minimumBalanceDueDaysBeforeEvent",
        "maximumBalanceDueDaysBeforeEvent",
        "financialPolicyVersion",
      ]
    ) {
      assert.match(
        schema,
        new RegExp(
          field,
          "u",
        ),
      );
    }

    assert.match(
      schema,
      /single financial-policy version/u,
    );

    assert.doesNotMatch(
      schema,
      /paymentPolicyVersion|depositPolicyVersion|balancePolicyVersion/u,
    );
  },
);

test(
  "P11 docs state that Admin policy changes are prospective",
  () => {
    assert.match(
      finance,
      /future Provider package create\/edit\s+operations/u,
    );

    assert.match(
      business,
      /does not recalculate or rewrite existing packages/u,
    );

    assert.match(
      payments,
      /Existing\s+saved\s+package\s+terms\s+and\s+frozen\s+booking\s+financial\s+snapshots\s+are\s+not\s+recalculated/u,
    );
  },
);

test(
  "P11 docs preserve trusted server authority and fail-closed payout transport",
  () => {
    assert.match(
      finance,
      /Trusted Provider package create\/update Functions independently read/u,
    );

    assert.match(
      finance,
      /Direct browser mutation of `appSettings\/platform` is denied/u,
    );

    assert.match(
      finance,
      /does not enable PayMongo `\/v2\/batch_transfers` dispatch/u,
    );

    assert.match(
      payments,
      /does\s+not\s+dispatch\s+PayMongo\s+batch\s+transfers/u,
    );
  },
);