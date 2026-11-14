const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");

const {
  bookingOfferFingerprintFields,
  parseBookingPackageOfferInput,
  rejectClientBookingFinancialAuthority,
  resolveBookingPackageOffer,
} = require("../lib/bookings/booking-package-offer.js");

const {
  buildPackagePaymentTermsSnapshot,
} = require("../lib/payments/package-payment-terms.js");

const submitSource = readFileSync(
  join(
    __dirname,
    "../src/bookings/submit-booking-request.ts",
  ),
  "utf8",
);

function tieredPackage(overrides = {}) {
  return {
    price: 10_000,
    serviceOptions: {
      drop_off: {
        price: 8_000,
        includedServices: ["Delivery"],
      },
      buffet_setup: {
        price: 20_000,
        includedServices: ["Chafing dishes"],
      },
      full_service: {
        price: 35_000,
        includedServices: ["Service staff"],
      },
    },
    themeOptions: [{
      id: "theme_garden",
      name: "Garden",
      description: "Greenery",
      imageUrls: [
        "https://images.example.com/garden.jpg",
      ],
      price: 999,
    }],
    ...overrides,
  };
}

function fingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function canonicalRequest(offer) {
  return {
    customerId: "customer",
    packageId: "package_12345678",
    eventEndTime: "22:00",
    guestCount: 80,
    addonIds: ["addon_12345678"],
    ...bookingOfferFingerprintFields(offer),
  };
}

test(
  "accepts an enabled tier and uses the trusted tier price",
  () => {
    const resolved = resolveBookingPackageOffer({
      packageData: tieredPackage(),
      serviceTier: "buffet_setup",
      packageThemeId: null,
    });

    assert.equal(resolved.basePrice, 20_000);
    assert.equal(
      resolved.selection.serviceTier,
      "buffet_setup",
    );
    assert.equal(
      resolved.selection.serviceTierLabel,
      "Buffet Setup",
    );
    assert.deepEqual(
      resolved.selection.serviceTierIncludedServices,
      ["Chafing dishes"],
    );
    assert.equal(
      resolved.selection.packageThemeId,
      null,
    );
  },
);

test(
  "rejects an invalid tier id",
  () => {
    assert.throws(
      () => parseBookingPackageOfferInput({
        serviceTier: "gold",
      }),
      {code: "invalid-argument"},
    );
  },
);

test(
  "rejects a tier that is not currently enabled",
  () => {
    assert.throws(
      () => resolveBookingPackageOffer({
        packageData: tieredPackage({
          serviceOptions: {
            drop_off: {
              price: 8_000,
              includedServices: ["Delivery"],
            },
          },
        }),
        serviceTier: "full_service",
        packageThemeId: null,
      }),
      {code: "failed-precondition"},
    );
  },
);

test(
  "rejects client tier prices and ignores them as booking authority",
  () => {
    assert.throws(
      () => rejectClientBookingFinancialAuthority({
        serviceTier: "buffet_setup",
        tierPrice: 1,
        packagePrice: 1,
        totalAmount: 1,
        downPaymentAmount: 1,
        remainingBalance: 1,
        downPaymentPercentage: 100,
      }),
      {code: "invalid-argument"},
    );

    const parsed = parseBookingPackageOfferInput({
      serviceTier: "buffet_setup",
      packageThemeId: "theme_garden",
    });
    const resolved = resolveBookingPackageOffer({
      packageData: tieredPackage(),
      ...parsed,
    });

    assert.equal(resolved.basePrice, 20_000);
    assert.equal(
      "tierPrice" in resolved.selection,
      false,
    );
  },
);

test(
  "requires a tier when the package publishes service options",
  () => {
    assert.throws(
      () => resolveBookingPackageOffer({
        packageData: tieredPackage(),
        serviceTier: null,
        packageThemeId: null,
      }),
      {code: "invalid-argument"},
    );
  },
);

test(
  "keeps legacy packages on the trusted package price",
  () => {
    const resolved = resolveBookingPackageOffer({
      packageData: {
        price: 12_500,
      },
      serviceTier: null,
      packageThemeId: null,
    });

    assert.equal(resolved.basePrice, 12_500);
    assert.equal(resolved.selection.serviceTier, null);
    assert.deepEqual(
      resolved.selection.serviceTierIncludedServices,
      [],
    );
  },
);

test(
  "does not turn a legacy package into a tiered package",
  () => {
    assert.throws(
      () => resolveBookingPackageOffer({
        packageData: {price: 12_500},
        serviceTier: "buffet_setup",
        packageThemeId: null,
      }),
      {code: "failed-precondition"},
    );
  },
);

test(
  "accepts an optional theme for a compatible tier",
  () => {
    const withTheme = resolveBookingPackageOffer({
      packageData: tieredPackage(),
      serviceTier: "full_service",
      packageThemeId: "theme_garden",
    });
    const withoutTheme = resolveBookingPackageOffer({
      packageData: tieredPackage(),
      serviceTier: "buffet_setup",
      packageThemeId: null,
    });

    assert.equal(withTheme.basePrice, 35_000);
    assert.equal(
      withTheme.selection.packageThemeId,
      "theme_garden",
    );
    assert.equal(
      withTheme.selection.packageThemeName,
      "Garden",
    );
    assert.deepEqual(
      withTheme.selection.packageThemeImageUrls,
      ["https://images.example.com/garden.jpg"],
    );
    assert.equal(
      withoutTheme.selection.packageThemeId,
      null,
    );
  },
);

test(
  "rejects an invalid theme id",
  () => {
    assert.throws(
      () => parseBookingPackageOfferInput({
        packageThemeId: "not a theme",
      }),
      {code: "invalid-argument"},
    );
  },
);

test(
  "rejects a stale theme id",
  () => {
    assert.throws(
      () => resolveBookingPackageOffer({
        packageData: tieredPackage(),
        serviceTier: "buffet_setup",
        packageThemeId: "theme_removed",
      }),
      {code: "failed-precondition"},
    );
  },
);

test(
  "rejects a theme on drop-off catering",
  () => {
    assert.throws(
      () => resolveBookingPackageOffer({
        packageData: tieredPackage(),
        serviceTier: "drop_off",
        packageThemeId: "theme_garden",
      }),
      {code: "failed-precondition"},
    );
  },
);

test(
  "derives deposit and remaining balance from the trusted tier price",
  () => {
    const resolved = resolveBookingPackageOffer({
      packageData: tieredPackage(),
      serviceTier: "buffet_setup",
      packageThemeId: "theme_garden",
    });
    const depositTerms = buildPackagePaymentTermsSnapshot({
      paymentPolicy: "deposit_then_balance",
      depositPercentage: 30,
      balanceDueDaysBeforeEvent: 7,
      downPaymentPercentage: 30,
    });
    const fullTerms = buildPackagePaymentTermsSnapshot({
      paymentPolicy: "full_payment",
      depositPercentage: 100,
      balanceDueDaysBeforeEvent: null,
      downPaymentPercentage: 100,
    });

    assert.equal(
      depositTerms.paymentPolicy,
      "deposit_then_balance",
    );
    assert.equal(depositTerms.depositRateBps, 3000);
    assert.equal(
      roundCurrency(
        resolved.basePrice *
          (depositTerms.depositRateBps / 100 / 100),
      ),
      6_000,
    );
    assert.equal(
      roundCurrency(
        resolved.basePrice - 6_000,
      ),
      14_000,
    );
    assert.equal(
      fullTerms.paymentPolicy,
      "full_payment",
    );
    assert.equal(
      roundCurrency(
        resolved.basePrice *
          (fullTerms.depositRateBps / 100 / 100),
      ),
      resolved.basePrice,
    );
  },
);

test(
  "changes the canonical fingerprint when tier or theme changes",
  () => {
    const buffet = canonicalRequest({
      serviceTier: "buffet_setup",
      packageThemeId: "theme_garden",
    });
    const same = canonicalRequest({
      serviceTier: "buffet_setup",
      packageThemeId: "theme_garden",
    });
    const otherTier = canonicalRequest({
      serviceTier: "full_service",
      packageThemeId: "theme_garden",
    });
    const otherTheme = canonicalRequest({
      serviceTier: "buffet_setup",
      packageThemeId: "theme_gold",
    });
    const legacy = canonicalRequest({
      serviceTier: null,
      packageThemeId: null,
    });

    assert.equal(fingerprint(buffet), fingerprint(same));
    assert.notEqual(
      fingerprint(buffet),
      fingerprint(otherTier),
    );
    assert.notEqual(
      fingerprint(buffet),
      fingerprint(otherTheme),
    );
    assert.deepEqual(
      bookingOfferFingerprintFields({
        serviceTier: null,
        packageThemeId: null,
      }),
      {},
    );
    assert.equal(
      Object.hasOwn(legacy, "serviceTier"),
      false,
    );
    assert.equal(
      JSON.stringify(buffet).includes("20000"),
      false,
    );
    assert.equal(
      JSON.stringify(buffet).includes("tierPrice"),
      false,
    );
  },
);

test(
  "booking submission keeps package terms, availability, and full-payment custom-menu checkout",
  () => {
    assert.match(
      submitSource,
      /buildPackagePaymentTermsSnapshot/u,
    );
    assert.match(
      submitSource,
      /packagePaymentTerms\s*\.depositRateBps/u,
    );
    assert.doesNotMatch(
      submitSource,
      /packageDownPaymentPercentage\s*=\s*100/u,
    );
    assert.match(
      submitSource,
      /packagePaymentTerms\s*=\s*requireNewBookingCanonicalPaymentTerms\(\{\s*schemaVersion: 1,\s*source: "canonical_package",\s*paymentPolicy: "full_payment",\s*depositRateBps:\s*FULL_PAYMENT_RATE_BPS/u,
    );
    assert.doesNotMatch(
      submitSource,
      /themeInspiration|referenceSetupId/u,
    );
    assert.match(
      submitSource,
      /requireText\(\s*input,\s*"eventEndTime"/u,
    );
    assert.match(
      submitSource,
      /requireInteger\(\s*input,\s*"guestCount"/u,
    );
    assert.match(
      submitSource,
      /validateBookingPackage\(/u,
    );
    assert.match(
      submitSource,
      /validateProviderAvailability\(/u,
    );
    assert.match(
      submitSource,
      /requireStoredMoney\(\s*addon\.price/u,
    );

    const fingerprintStart = submitSource.indexOf(
      "createSubmissionFingerprint({",
    );
    const fingerprintEnd = submitSource.indexOf(
      "});",
      fingerprintStart,
    );
    const fingerprintBlock = submitSource.slice(
      fingerprintStart,
      fingerprintEnd,
    );

    assert.match(
      fingerprintBlock,
      /bookingOfferFingerprintFields/u,
    );
    assert.doesNotMatch(
      fingerprintBlock,
      /tierPrice|packagePrice|totalAmount/u,
    );
  },
);

function roundCurrency(value) {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
}
