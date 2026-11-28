const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  assertCanonicalPackagePaymentTerms,
  parsePackageInput,
} = require(
  "../lib/packages/package-domain.js",
);

const base = {
  name:
    "Full payment package",

  description:
    "A package used to verify P13-C full-payment-only writes.",

  eventType:
    "wedding",

  price:
    30000,

  paymentPolicy:
    "full_payment",

  depositPercentage:
    100,

  balanceDueDaysBeforeEvent:
    null,

  downPaymentPercentage:
    100,

  minimumGuests:
    20,

  maximumGuests:
    100,

  imageUrl:
    "",

  foodInclusions:
    [],

  decorInclusions:
    [],

  furnitureInclusions:
    [],

  serviceInclusions:
    [],
};

test(
  "accepts canonical full-payment package terms",
  () => {
    const parsed =
      parsePackageInput(base);

    assert.doesNotThrow(
      () =>
        assertCanonicalPackagePaymentTerms(
          parsed,
        ),
    );

    assert.equal(
      parsed.paymentPolicy,
      "full_payment",
    );

    assert.equal(
      parsed.downPaymentPercentage,
      100,
    );
  },
);

test(
  "accepts canonical deposit-plus-balance package terms",
  () => {
    const parsed =
      parsePackageInput({
        ...base,

        paymentPolicy:
          "deposit_then_balance",

        depositPercentage:
          30,

        downPaymentPercentage:
          30,

        balanceDueDaysBeforeEvent:
          7,
      });

    assert.doesNotThrow(
      () =>
        assertCanonicalPackagePaymentTerms(
          parsed,
        ),
    );

    assert.equal(
      parsed.paymentPolicy,
      "deposit_then_balance",
    );

    assert.equal(
      parsed.downPaymentPercentage,
      30,
    );

    assert.equal(
      parsed.balanceDueDaysBeforeEvent,
      7,
    );
  },
);

test(
  "package publication enforces canonical payment terms",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "../src/packages/publish-provider-package.ts",
        ),
        "utf8",
      );

    assert.match(
      source,
      /assertCanonicalPackagePaymentTerms\(\s*validated,\s*\)/u,
    );
  },
);
