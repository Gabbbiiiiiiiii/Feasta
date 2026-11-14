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

const canonicalDepositTerms = {
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
  "canonical deposit packages expose minimum, full and remaining-balance obligations",
  () => {
    const snapshot =
      buildSnapshot({
        packagePaymentTerms:
          canonicalDepositTerms,

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


test("canonical fractional deposit plus full-upfront add-on freezes aggregate money and independent terms", () => {
  const {buildPackagePaymentTermsSnapshot} = require("../lib/payments/package-payment-terms.js");
  const {requireNewBookingCanonicalPaymentTerms} = require("../lib/bookings/canonical-booking-payment-policy.js");
  const {resolveBookingPackageOffer} = require("../lib/bookings/booking-package-offer.js");
  const packageData = {
    paymentPolicy: "deposit_then_balance", depositPercentage: 50.5,
    downPaymentPercentage: 50.5, balanceDueDaysBeforeEvent: 7,
    price: 10000, serviceOptions: {drop_off: {price: 20000, includedServices: []}}, themeOptions: [],
  };
  const terms = requireNewBookingCanonicalPaymentTerms(buildPackagePaymentTermsSnapshot(packageData));
  const price = resolveBookingPackageOffer({packageData, serviceTier: "drop_off", packageThemeId: null}).basePrice;
  const packageUpfront = Math.round(price * terms.depositRateBps / 10000 * 100) / 100;
  const addonPrice = 2000;
  const snapshot = buildSnapshot({packagePaymentTerms: terms, amount: price + addonPrice,
    downPaymentAmount: packageUpfront + addonPrice, remainingBalance: price - packageUpfront});
  assert.equal(packageUpfront, 10100);
  assert.equal(snapshot.grossAmountInCentavos, 2200000);
  assert.equal(snapshot.requiredUpfrontAmountInCentavos, 1210000);
  assert.equal(snapshot.remainingBalanceInCentavos, 990000);
  assert.equal(snapshot.requiredUpfrontRateBps, 5500);
  assert.equal(snapshot.packagePaymentTerms.depositRateBps, 5050, "aggregate rate cannot replace package rate");
  for (const [paymentChoice, expected] of [["minimum", 1210000], ["full", 2200000], ["remaining_balance", 990000]]) {
    assert.equal(providerPaymentObligationForChoice({financialSnapshot: snapshot, paymentChoice}).amountInCentavos, expected);
  }
  packageData.depositPercentage = 75;
  packageData.downPaymentPercentage = 75;
  packageData.balanceDueDaysBeforeEvent = 1;
  assert.equal(snapshot.packagePaymentTerms.depositRateBps, 5050);
  assert.equal(snapshot.packagePaymentTerms.balanceDueHoursBeforeEvent, 24);
  const {canonicalBalanceTiming} = require("../lib/payments/canonical-balance-timing.js");
  const timing = canonicalBalanceTiming(new Date("2027-06-18T00:00:00+08:00"), "10:00");
  assert.equal(timing.dueAt.toISOString(), "2027-06-17T02:00:00.000Z");
});

test("custom-menu full-upfront money remains separate from deposit package obligations", () => {
  const snapshot = buildSnapshot({amount: 12500, downPaymentAmount: 12500, remainingBalance: 0});
  assert.equal(snapshot.remainingBalanceInCentavos, 0);
  assert.equal(providerPaymentObligationForChoice({financialSnapshot: snapshot, paymentChoice: "full"}).amountInCentavos, 1250000);
  assert.throws(() => providerPaymentObligationForChoice({financialSnapshot: snapshot, paymentChoice: "minimum"}), {code: "failed-precondition"});
});
