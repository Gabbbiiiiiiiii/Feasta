const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  FULL_PAYMENT_PERCENTAGE,
  requireNewBookingFullPaymentTerms,
} = require(
  "../lib/bookings/full-payment-booking-policy.js",
);

const {
  buildPackagePaymentTermsSnapshot,
} = require(
  "../lib/payments/package-payment-terms.js",
);

test(
  "P13-C accepts canonical full-payment booking terms",
  () => {
    const terms =
      requireNewBookingFullPaymentTerms(
        buildPackagePaymentTermsSnapshot({
          paymentPolicy:
            "full_payment",

          depositPercentage:
            100,

          downPaymentPercentage:
            100,

          balanceDueDaysBeforeEvent:
            null,
        }),
      );

    assert.equal(
      terms.depositRateBps,
      10000,
    );

    assert.equal(
      terms.balanceDueDaysBeforeEvent,
      null,
    );

    assert.equal(
      FULL_PAYMENT_PERCENTAGE,
      100,
    );
  },
);

test(
  "P13-C rejects deposit terms for newly submitted bookings",
  () => {
    const terms =
      buildPackagePaymentTermsSnapshot({
        paymentPolicy:
          "deposit_then_balance",

        depositPercentage:
          30,

        downPaymentPercentage:
          30,

        balanceDueDaysBeforeEvent:
          7,
      });

    assert.throws(
      () =>
        requireNewBookingFullPaymentTerms(
          terms,
        ),
      {
        code:
          "failed-precondition",
      },
    );
  },
);

test(
  "new booking submission uses full-payment financial authority",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "../src/bookings/submit-booking-request.ts",
        ),
        "utf8",
      );

    assert.match(
      source,
      /requireNewBookingFullPaymentTerms\s*\(\s*buildPackagePaymentTermsSnapshot\s*\(/u,
    );

    assert.match(
      source,
      /const packageDownPaymentPercentage\s*=\s*FULL_PAYMENT_PERCENTAGE/u,
    );

    assert.doesNotMatch(
      source,
      /requireStoredPercentage/u,
    );

    assert.doesNotMatch(
      source,
      /cateringEffectivePercentage/u,
    );

    assert.doesNotMatch(
      source,
      /\beffectivePercentage\b/u,
    );

    const fullPaymentWrites =
      source.match(
        /downPaymentPercentage:\s*FULL_PAYMENT_PERCENTAGE/gu,
      ) ?? [];

    assert.ok(
      fullPaymentWrites.length >= 4,
      `expected at least 4 full-payment writes, found ${fullPaymentWrites.length}`,
    );
  },
);
