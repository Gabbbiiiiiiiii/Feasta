const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  buildProviderRequestFinancialSnapshot,
} = require(
  "../lib/provider-requests/provider-request-financial-snapshot.js",
);

const {
  providerPaymentObligationForChoice,
} = require(
  "../lib/payments/payment-obligation.js",
);

const canonicalFullPaymentTerms = {
  schemaVersion:
    1,

  source:
    "canonical_package",

  paymentPolicy:
    "full_payment",

  depositRateBps:
    10_000,

  balanceDueDaysBeforeEvent:
    null,

  usesLegacyPaymentTerms:
    false,
};

const legacyDepositTerms = {
  schemaVersion:
    1,

  source:
    "canonical_package",

  paymentPolicy:
    "deposit_then_balance",

  depositRateBps:
    3_000,

  balanceDueDaysBeforeEvent:
    7,

  usesLegacyPaymentTerms:
    false,
};

function buildSnapshot({
  packagePaymentTerms =
    canonicalFullPaymentTerms,

  amount =
    30_000,

  downPaymentAmount =
    30_000,

  remainingBalance =
    0,
} = {}) {
  return buildProviderRequestFinancialSnapshot({
    providerId:
      "provider_test",

    providerOwnerId:
      "owner_test",

    providerRequest: {
      amount,
      downPaymentAmount,
      remainingBalance,
      packagePaymentTerms,
    },

    platformSettings:
      null,

    providerTaxProfile:
      null,
  });
}

test(
  "P13-C full-payment request freezes full upfront and zero remaining balance",
  () => {
    const snapshot =
      buildSnapshot();

    assert.equal(
      snapshot.grossAmountInCentavos,
      3_000_000,
    );

    assert.equal(
      snapshot.requiredUpfrontAmountInCentavos,
      3_000_000,
    );

    assert.equal(
      snapshot.remainingBalanceInCentavos,
      0,
    );

    assert.equal(
      snapshot.requiredUpfrontRateBps,
      10_000,
    );

    assert.deepEqual(
      snapshot.packagePaymentTerms,
      canonicalFullPaymentTerms,
    );
  },
);

test(
  "P13-C full is the only available checkout obligation for a new full-payment request",
  () => {
    const snapshot =
      buildSnapshot();

    const full =
      providerPaymentObligationForChoice({
        financialSnapshot:
          snapshot,

        paymentChoice:
          "full",
      });

    assert.equal(
      full.paymentChoice,
      "full",
    );

    assert.equal(
      full.obligationKey,
      "initial_full",
    );

    assert.equal(
      full.amountInCentavos,
      3_000_000,
    );

    assert.throws(
      () =>
        providerPaymentObligationForChoice({
          financialSnapshot:
            snapshot,

          paymentChoice:
            "minimum",
        }),
      {
        code:
          "failed-precondition",
      },
    );

    assert.throws(
      () =>
        providerPaymentObligationForChoice({
          financialSnapshot:
            snapshot,

          paymentChoice:
            "remaining_balance",
        }),
      {
        code:
          "failed-precondition",
      },
    );
  },
);

test(
  "P13-C add-on requests also expose only full payment",
  () => {
    const snapshot =
      buildSnapshot({
        packagePaymentTerms:
          null,

        amount:
          5_000,

        downPaymentAmount:
          5_000,

        remainingBalance:
          0,
      });

    assert.equal(
      snapshot.packagePaymentTerms,
      null,
    );

    assert.equal(
      snapshot.grossAmountInCentavos,
      500_000,
    );

    assert.equal(
      snapshot.requiredUpfrontAmountInCentavos,
      500_000,
    );

    assert.equal(
      snapshot.remainingBalanceInCentavos,
      0,
    );

    assert.equal(
      providerPaymentObligationForChoice({
        financialSnapshot:
          snapshot,

        paymentChoice:
          "full",
      }).amountInCentavos,
      500_000,
    );

    for (
      const paymentChoice of [
        "minimum",
        "remaining_balance",
      ]
    ) {
      assert.throws(
        () =>
          providerPaymentObligationForChoice({
            financialSnapshot:
              snapshot,

            paymentChoice,
          }),
        {
          code:
            "failed-precondition",
        },
      );
    }
  },
);

test(
  "historical deposit obligations remain readable and payable",
  () => {
    const snapshot =
      buildSnapshot({
        packagePaymentTerms:
          legacyDepositTerms,

        amount:
          30_000,

        downPaymentAmount:
          9_000,

        remainingBalance:
          21_000,
      });

    const minimum =
      providerPaymentObligationForChoice({
        financialSnapshot:
          snapshot,

        paymentChoice:
          "minimum",
      });

    const full =
      providerPaymentObligationForChoice({
        financialSnapshot:
          snapshot,

        paymentChoice:
          "full",
      });

    const balance =
      providerPaymentObligationForChoice({
        financialSnapshot:
          snapshot,

        paymentChoice:
          "remaining_balance",
      });

    assert.equal(
      minimum.amountInCentavos,
      900_000,
    );

    assert.equal(
      minimum.paymentType,
      "provider_down_payment",
    );

    assert.equal(
      full.amountInCentavos,
      3_000_000,
    );

    assert.equal(
      balance.amountInCentavos,
      2_100_000,
    );

    assert.equal(
      balance.paymentType,
      "provider_balance",
    );
  },
);

test(
  "acceptance and checkout remain wired through trusted financial authority",
  () => {
    const root =
      path.resolve(
        __dirname,
        "..",
      );

    const acceptanceSource =
      fs.readFileSync(
        path.join(
          root,
          "src/provider-requests/accept-provider-request.ts",
        ),
        "utf8",
      );

    const checkoutSource =
      fs.readFileSync(
        path.join(
          root,
          "src/payments/create-payment-session.ts",
        ),
        "utf8",
      );

    assert.match(
      acceptanceSource,
      /buildProviderRequestFinancialSnapshot/u,
    );

    assert.match(
      acceptanceSource,
      /providerRequest:\s*authorized\.requestData/u,
    );

    assert.match(
      acceptanceSource,
      /financialSnapshot,/u,
    );

    assert.match(
      checkoutSource,
      /providerPaymentObligationForChoice\s*\(/u,
    );

    assert.match(
      checkoutSource,
      /financialSnapshot:\s*providerRequest\s*\.financialSnapshot/u,
    );
  },
);
