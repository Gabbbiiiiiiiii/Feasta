const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertCanonicalPackagePaymentTerms,
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
  balanceDueDaysBeforeEvent: 7,

  minimumGuests: 20,
  maximumGuests: 100,

  imageUrl: "",

  foodInclusions: [],
  decorInclusions: [],
  furnitureInclusions: [],
  serviceInclusions: [],
};

test(
  "canonical deposit package stores current payment terms",
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
  },
);

test(
  "full-payment package derives 100 percent and has no balance deadline",
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
      parsed.downPaymentPercentage,
      100,
    );

    assert.equal(
      parsed.balanceDueDaysBeforeEvent,
      null,
    );
  },
);

test(
  "deposit policy enforces 20 to 80 percent",
  () => {
    for (const depositPercentage of [
      19.99,
      80.01,
      0,
      100,
    ]) {
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

    for (const depositPercentage of [
      20,
      80,
    ]) {
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
  "deposit policy enforces 1 to 30 day balance deadline",
  () => {
    for (
      const balanceDueDaysBeforeEvent
      of [0, 31, 1.5]
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
      of [1, 30]
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
