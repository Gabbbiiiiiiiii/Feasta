const assert =
  require("node:assert/strict");

const test =
  require("node:test");

const {
  assertCanonicalPackagePaymentTerms,
  assertPackagePaymentTermsWithinPolicy,
  assertPackagePublishable,
  parsePackageInput,
} = require(
  "../lib/packages/package-domain.js",
);

const base = {
  name: "Wedding package",

  description:
    "A complete wedding catering package.",

  eventType: "wedding",

  price: 30000,

  paymentPolicy:
    "deposit_then_balance",

  depositPercentage: 30,

  balanceDueDaysBeforeEvent:
    7,

  minimumGuests: 20,
  maximumGuests: 100,

  imageUrl: "",

  foodInclusions: [],
  decorInclusions: [],
  furnitureInclusions: [],
  serviceInclusions: [],
};

const policy = {
  minimumDepositRateBps:
    2000,

  maximumDepositRateBps:
    8000,

  minimumBalanceDueDaysBeforeEvent:
    1,

  maximumBalanceDueDaysBeforeEvent:
    30,
};

test(
  "canonical deposit package is accepted for new writes when within policy",
  () => {
    const parsed =
      parsePackageInput(base);

    assert.equal(
      parsed.paymentPolicy,
      "deposit_then_balance",
    );

    assert.equal(
      parsed.depositPercentage,
      30,
    );

    assert.equal(
      parsed.downPaymentPercentage,
      30,
    );

    assert.equal(
      parsed.balanceDueDaysBeforeEvent,
      7,
    );

    assert.equal(
      parsed.usesLegacyPaymentTerms,
      false,
    );

    assert.doesNotThrow(() =>
      assertCanonicalPackagePaymentTerms(
        parsed,
      ),
    );

    assert.doesNotThrow(() =>
      assertPackagePaymentTermsWithinPolicy(
        parsed,
        policy,
      ),
    );
  },
);

test(
  "full-payment package remains separate from deposit bounds",
  () => {
    const parsed =
      parsePackageInput({
        ...base,

        paymentPolicy:
          "full_payment",

        depositPercentage: 100,

        balanceDueDaysBeforeEvent:
          null,
      });

    assert.equal(
      parsed.paymentPolicy,
      "full_payment",
    );

    assert.equal(
      parsed.depositPercentage,
      100,
    );

    assert.equal(
      parsed.balanceDueDaysBeforeEvent,
      null,
    );

    assert.doesNotThrow(() =>
      assertPackagePaymentTermsWithinPolicy(
        parsed,
        policy,
      ),
    );
  },
);

test(
  "package parser uses a permanent technical deposit envelope",
  () => {
    for (
      const depositPercentage
      of [
        0,
        100,
      ]
    ) {
      assert.throws(
        () =>
          parsePackageInput({
            ...base,
            depositPercentage,
          }),
        {
          code:
            "invalid-argument",
        },
      );
    }

    for (
      const depositPercentage
      of [
        10,
        20,
        80,
        90,
        99.99,
      ]
    ) {
      assert.doesNotThrow(() =>
        parsePackageInput({
          ...base,
          depositPercentage,
        }),
      );
    }
  },
);

test(
  "package parser uses a permanent 1 to 365 day envelope",
  () => {
    for (
      const balanceDueDaysBeforeEvent
      of [
        0,
        366,
        1.5,
      ]
    ) {
      assert.throws(
        () =>
          parsePackageInput({
            ...base,
            balanceDueDaysBeforeEvent,
          }),
        {
          code:
            "invalid-argument",
        },
      );
    }

    for (
      const balanceDueDaysBeforeEvent
      of [
        1,
        30,
        60,
        365,
      ]
    ) {
      assert.doesNotThrow(() =>
        parsePackageInput({
          ...base,
          balanceDueDaysBeforeEvent,
        }),
      );
    }
  },
);

test(
  "current Admin policy rejects canonical package terms outside the saved bounds",
  () => {
    for (
      const patch of [
        {
          depositPercentage:
            19.99,
        },
        {
          depositPercentage:
            80.01,
        },
      ]
    ) {
      const parsed =
        parsePackageInput({
          ...base,
          ...patch,
        });

      assert.throws(
        () =>
          assertPackagePaymentTermsWithinPolicy(
            parsed,
            policy,
          ),
        {
          code:
            "invalid-argument",
        },
      );
    }
  },
);

test(
  "changed Admin bounds can authorize different future package terms",
  () => {
    const changedPolicy = {
      minimumDepositRateBps:
        1000,

      maximumDepositRateBps:
        9000,

      minimumBalanceDueDaysBeforeEvent:
        2,

      maximumBalanceDueDaysBeforeEvent:
        60,
    };

    const parsed =
      parsePackageInput({
        ...base,

        depositPercentage:
          90,

        balanceDueDaysBeforeEvent:
          60,
      });

    assert.doesNotThrow(() =>
      assertPackagePaymentTermsWithinPolicy(
        parsed,
        changedPolicy,
      ),
    );
  },
);

test(
  "full payment rejects a balance deadline or non-100 percentage",
  () => {
    assert.throws(
      () =>
        parsePackageInput({
          ...base,

          paymentPolicy:
            "full_payment",

          depositPercentage: 80,

          balanceDueDaysBeforeEvent:
            null,
        }),
      {
        code:
          "invalid-argument",
      },
    );

    assert.throws(
      () =>
        parsePackageInput({
          ...base,

          paymentPolicy:
            "full_payment",

          depositPercentage: 100,

          balanceDueDaysBeforeEvent:
            7,
        }),
      {
        code:
          "invalid-argument",
      },
    );
  },
);

test(
  "client compatibility percentage cannot contradict canonical terms",
  () => {
    assert.throws(
      () =>
        parsePackageInput({
          ...base,

          downPaymentPercentage:
            50,
        }),
      {
        code:
          "invalid-argument",
      },
    );
  },
);

test(
  "legacy zero-percent package remains readable and publishable but cannot be a new canonical write",
  () => {
    const {
      paymentPolicy:
        _paymentPolicy,

      depositPercentage:
        _depositPercentage,

      balanceDueDaysBeforeEvent:
        _balanceDueDaysBeforeEvent,

      ...legacy
    } = base;

    const parsed =
      parsePackageInput({
        ...legacy,

        downPaymentPercentage:
          0,
      });

    assert.equal(
      parsed.paymentPolicy,
      null,
    );

    assert.equal(
      parsed.depositPercentage,
      0,
    );

    assert.equal(
      parsed.usesLegacyPaymentTerms,
      true,
    );

    assert.doesNotThrow(() =>
      assertPackagePublishable({
        ...legacy,

        downPaymentPercentage:
          0,
      }),
    );

    assert.throws(
      () =>
        assertCanonicalPackagePaymentTerms(
          parsed,
        ),
      {
        code:
          "invalid-argument",
      },
    );
  },
);
