const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  buildPackagePaymentTermsSnapshot,
  parsePackagePaymentTermsSnapshot,
} =
  require(
    "../lib/payments/package-payment-terms.js",
  );

function canonicalDeposit(
  patch = {},
) {
  return {
    paymentPolicy:
      "deposit_then_balance",

    depositPercentage: 30,

    balanceDueDaysBeforeEvent:
      7,

    downPaymentPercentage:
      30,

    ...patch,
  };
}

test(
  "canonical deposit package becomes an immutable payment-term snapshot",
  () => {
    assert.deepEqual(
      buildPackagePaymentTermsSnapshot(
        canonicalDeposit(),
      ),
      {
        schemaVersion: 1,

        source:
          "canonical_package",

        paymentPolicy:
          "deposit_then_balance",

        depositRateBps:
          3000,

        balanceDueDaysBeforeEvent:
          7,

        usesLegacyPaymentTerms:
          false,
      },
    );
  },
);

test(
  "full-payment package snapshots 100 percent with no balance deadline",
  () => {
    assert.deepEqual(
      buildPackagePaymentTermsSnapshot(
        {
          paymentPolicy:
            "full_payment",

          depositPercentage:
            100,

          balanceDueDaysBeforeEvent:
            null,

          downPaymentPercentage:
            100,
        },
      ),
      {
        schemaVersion: 1,

        source:
          "canonical_package",

        paymentPolicy:
          "full_payment",

        depositRateBps:
          10000,

        balanceDueDaysBeforeEvent:
          null,

        usesLegacyPaymentTerms:
          false,
      },
    );
  },
);

test(
  "legacy package remains compatible without inventing canonical terms",
  () => {
    assert.deepEqual(
      buildPackagePaymentTermsSnapshot(
        {
          downPaymentPercentage:
            0,
        },
      ),
      {
        schemaVersion: 1,

        source:
          "legacy_package",

        paymentPolicy:
          null,

        depositRateBps:
          0,

        balanceDueDaysBeforeEvent:
          null,

        usesLegacyPaymentTerms:
          true,
      },
    );
  },
);

test(
  "canonical terms cannot contradict the compatibility percentage",
  () => {
    assert.throws(
      () =>
        buildPackagePaymentTermsSnapshot(
          canonicalDeposit({
            downPaymentPercentage:
              40,
          }),
        ),

      {
        code:
          "failed-precondition",
      },
    );
  },
);

test(
  "canonical deposit terms enforce the agreed boundaries",
  () => {
    for (
      const patch of [
        {
          depositPercentage:
            19.99,
          downPaymentPercentage:
            19.99,
        },
        {
          depositPercentage:
            80.01,
          downPaymentPercentage:
            80.01,
        },
        {
          balanceDueDaysBeforeEvent:
            0,
        },
        {
          balanceDueDaysBeforeEvent:
            31,
        },
      ]
    ) {
      assert.throws(
        () =>
          buildPackagePaymentTermsSnapshot(
            canonicalDeposit(
              patch,
            ),
          ),

        {
          code:
            "failed-precondition",
        },
      );
    }
  },
);

test(
  "stored snapshot parser rejects contradictory structures",
  () => {
    const valid =
      buildPackagePaymentTermsSnapshot(
        canonicalDeposit(),
      );

    assert.deepEqual(
      parsePackagePaymentTermsSnapshot(
        valid,
      ),
      valid,
    );

    assert.equal(
      parsePackagePaymentTermsSnapshot(
        null,
      ),
      null,
    );

    assert.throws(
      () =>
        parsePackagePaymentTermsSnapshot(
          {
            ...valid,

            paymentPolicy:
              "full_payment",
          },
        ),

      {
        code:
          "failed-precondition",
      },
    );
  },
);

test(
  "booking submission snapshots canonical terms instead of trusting only the legacy percentage",
  () => {
    const root =
      path.resolve(
        __dirname,
        "..",
      );

    const source =
      fs.readFileSync(
        path.join(
          root,
          "src/bookings/submit-booking-request.ts",
        ),
        "utf8",
      );

    assert.match(
      source,
      /buildPackagePaymentTermsSnapshot/u,
    );

    assert.match(
      source,
      /const packagePaymentTerms/u,
    );

    assert.match(
      source,
      /packagePaymentTerms\s*\.depositRateBps/u,
    );

    assert.match(
      source,
      /packagePaymentTerms,/u,
    );

    assert.match(
      source,
      /packagePaymentTerms:\s*null/u,
    );
  },
);
