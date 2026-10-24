const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  DEFAULT_PACKAGE_PAYMENT_POLICY_BOUNDS,
  packagePaymentPolicyBoundsFromData,
} =
  require(
    "../lib/packages/package-payment-policy.js",
  );

const root =
  path.join(
    __dirname,
    "..",
  );

function source(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      "src",
      ...relativePath.split("/"),
    ),
    "utf8",
  );
}

test(
  "package payment policy defaults remain 20 to 80 percent and 1 to 30 days",
  () => {
    assert.deepEqual(
      DEFAULT_PACKAGE_PAYMENT_POLICY_BOUNDS,
      {
        minimumDepositRateBps:
          2000,

        maximumDepositRateBps:
          8000,

        minimumBalanceDueDaysBeforeEvent:
          1,

        maximumBalanceDueDaysBeforeEvent:
          30,
      },
    );
  },
);

test(
  "stored Admin payment-term policy is accepted when internally valid",
  () => {
    assert.deepEqual(
      packagePaymentPolicyBoundsFromData(
        {
          minimumDepositRateBps:
            1500,

          maximumDepositRateBps:
            8500,

          minimumBalanceDueDaysBeforeEvent:
            2,

          maximumBalanceDueDaysBeforeEvent:
            45,
        },
      ),
      {
        minimumDepositRateBps:
          1500,

        maximumDepositRateBps:
          8500,

        minimumBalanceDueDaysBeforeEvent:
          2,

        maximumBalanceDueDaysBeforeEvent:
          45,
      },
    );
  },
);

test(
  "missing or malformed Admin policy fails closed to canonical defaults",
  () => {
    for (
      const value of [
        null,
        {},
        {
          minimumDepositRateBps:
            9000,

          maximumDepositRateBps:
            8000,

          minimumBalanceDueDaysBeforeEvent:
            1,

          maximumBalanceDueDaysBeforeEvent:
            30,
        },
        {
          minimumDepositRateBps:
            2000,

          maximumDepositRateBps:
            8000,

          minimumBalanceDueDaysBeforeEvent:
            0,

          maximumBalanceDueDaysBeforeEvent:
            30,
        },
      ]
    ) {
      assert.deepEqual(
        packagePaymentPolicyBoundsFromData(
          value,
        ),
        DEFAULT_PACKAGE_PAYMENT_POLICY_BOUNDS,
      );
    }
  },
);

test(
  "Provider create and edit read appSettings platform inside trusted transactions",
  () => {
    const create =
      source(
        "packages/create-provider-package.ts",
      );

    const update =
      source(
        "packages/update-provider-package.ts",
      );

    for (
      const content of [
        create,
        update,
      ]
    ) {
      assert.match(
        content,
        /packagePaymentPolicySettingsReference/u,
      );

      assert.match(
        content,
        /transaction\.get\(\s*paymentPolicyReference/u,
      );

      assert.match(
        content,
        /packagePaymentPolicyBoundsFromData/u,
      );

      assert.match(
        content,
        /assertPackagePaymentTermsWithinPolicy/u,
      );
    }
  },
);

test(
  "package publication does not reapply today's Admin policy",
  () => {
    const publish =
      source(
        "packages/publish-provider-package.ts",
      );

    assert.doesNotMatch(
      publish,
      /packagePaymentPolicySettingsReference/u,
    );

    assert.doesNotMatch(
      publish,
      /assertPackagePaymentTermsWithinPolicy/u,
    );
  },
);

test(
  "booking payment-term snapshots do not depend on current appSettings policy",
  () => {
    const terms =
      source(
        "payments/package-payment-terms.ts",
      );

    assert.doesNotMatch(
      terms,
      /appSettings/u,
    );

    assert.match(
      terms,
      /MAX_CANONICAL_BALANCE_DUE_DAYS[\s\S]*365/u,
    );
  },
);