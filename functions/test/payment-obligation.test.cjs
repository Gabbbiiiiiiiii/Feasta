const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  initialPaymentSelectionReason,
  parseCustomerPaymentChoice,
  parseInitialPaymentChoice,
  paymentIdForProviderRequestChoice,
  providerPaymentObligationForChoice,
} =
  require(
    "../lib/payments/payment-obligation.js",
  );

function financialSnapshot(
  patch = {},
) {
  return {
    schemaVersion: 1,

    currency: "PHP",

    grossAmountInCentavos:
      3000000,

    requiredUpfrontAmountInCentavos:
      900000,

    remainingBalanceInCentavos:
      2100000,

    ...patch,
  };
}

test(
  "accepts only canonical customer payment choices",
  () => {
    for (
      const value of [
        "minimum",
        "full",
        "remaining_balance",
      ]
    ) {
      assert.equal(
        parseCustomerPaymentChoice(
          value,
        ),
        value,
      );
    }

    for (
      const value of [
        "",
        "deposit",
        "balance",
        "custom",
        "provider_down_payment",
        null,
        undefined,
      ]
    ) {
      assert.equal(
        parseCustomerPaymentChoice(
          value,
        ),
        null,
      );
    }
  },
);

test(
  "initial checkout accepts only minimum or full",
  () => {
    assert.equal(
      parseInitialPaymentChoice(
        "minimum",
      ),
      "minimum",
    );

    assert.equal(
      parseInitialPaymentChoice(
        "full",
      ),
      "full",
    );

    for (
      const value of [
        "remaining_balance",
        "deposit",
        "",
        null,
        undefined,
      ]
    ) {
      assert.equal(
        parseInitialPaymentChoice(
          value,
        ),
        null,
      );
    }
  },
);

test(
  "initial payment selection is immutable once reserved",
  () => {
    const providerRequestId =
      "provider_request_lock_001";

    const minimumId =
      paymentIdForProviderRequestChoice(
        providerRequestId,
        "minimum",
      );

    assert.equal(
      initialPaymentSelectionReason({
        providerRequestId,

        providerRequest: {},

        paymentChoice:
          "minimum",
      }),
      null,
    );

    const selected = {
      initialPaymentChoice:
        "minimum",

      initialPaymentId:
        minimumId,

      paymentId:
        minimumId,
    };

    assert.equal(
      initialPaymentSelectionReason({
        providerRequestId,

        providerRequest:
          selected,

        paymentChoice:
          "minimum",
      }),
      null,
    );

    assert.equal(
      initialPaymentSelectionReason({
        providerRequestId,

        providerRequest:
          selected,

        paymentChoice:
          "full",
      }),
      "initial_payment_choice_locked",
    );
  },
);

test(
  "legacy or malformed payment pointers cannot silently become P5 selections",
  () => {
    const providerRequestId =
      "provider_request_lock_002";

    assert.equal(
      initialPaymentSelectionReason({
        providerRequestId,

        providerRequest: {
          paymentId:
            "payment_0123456789abcdef0123456789abcdef",
        },

        paymentChoice:
          "minimum",
      }),
      "existing_payment_without_initial_selection",
    );

    assert.equal(
      initialPaymentSelectionReason({
        providerRequestId,

        providerRequest: {
          initialPaymentChoice:
            "minimum",

          initialPaymentId:
            "payment_0123456789abcdef0123456789abcdef",
        },

        paymentChoice:
          "minimum",
      }),
      "invalid_initial_payment_selection",
    );
  },
);

test(
  "creates stable distinct payment identities for each obligation choice",
  () => {
    const providerRequestId =
      "provider_request_test_001";

    const minimum =
      paymentIdForProviderRequestChoice(
        providerRequestId,
        "minimum",
      );

    const full =
      paymentIdForProviderRequestChoice(
        providerRequestId,
        "full",
      );

    const balance =
      paymentIdForProviderRequestChoice(
        providerRequestId,
        "remaining_balance",
      );

    assert.equal(
      minimum,
      paymentIdForProviderRequestChoice(
        providerRequestId,
        "minimum",
      ),
    );

    assert.equal(
      new Set([
        minimum,
        full,
        balance,
      ]).size,
      3,
    );
  },
);

test(
  "minimum obligation uses only the immutable required-upfront amount",
  () => {
    assert.deepEqual(
      providerPaymentObligationForChoice({
        financialSnapshot:
          financialSnapshot(),

        paymentChoice:
          "minimum",
      }),
      {
        schemaVersion: 1,

        paymentChoice:
          "minimum",

        obligationKey:
          "initial_minimum",

        obligationKind:
          "initial",

        paymentType:
          "provider_down_payment",

        amountInCentavos:
          900000,
      },
    );
  },
);

test(
  "full obligation always uses the immutable gross amount",
  () => {
    assert.deepEqual(
      providerPaymentObligationForChoice({
        financialSnapshot:
          financialSnapshot(),

        paymentChoice:
          "full",
      }),
      {
        schemaVersion: 1,

        paymentChoice:
          "full",

        obligationKey:
          "initial_full",

        obligationKind:
          "initial",

        paymentType:
          "provider_down_payment",

        amountInCentavos:
          3000000,
      },
    );
  },
);

test(
  "remaining balance uses the immutable balance amount and compatibility balance type",
  () => {
    assert.deepEqual(
      providerPaymentObligationForChoice({
        financialSnapshot:
          financialSnapshot(),

        paymentChoice:
          "remaining_balance",
      }),
      {
        schemaVersion: 1,

        paymentChoice:
          "remaining_balance",

        obligationKey:
          "remaining_balance",

        obligationKind:
          "balance",

        paymentType:
          "provider_balance",

        amountInCentavos:
          2100000,
      },
    );
  },
);

test(
  "minimum is unavailable when the initial requirement is zero or already the full amount",
  () => {
    for (
      const snapshot of [
        financialSnapshot({
          requiredUpfrontAmountInCentavos:
            0,

          remainingBalanceInCentavos:
            3000000,
        }),

        financialSnapshot({
          requiredUpfrontAmountInCentavos:
            3000000,

          remainingBalanceInCentavos:
            0,
        }),
      ]
    ) {
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
    }
  },
);

test(
  "remaining balance is unavailable when nothing remains",
  () => {
    assert.throws(
      () =>
        providerPaymentObligationForChoice({
          financialSnapshot:
            financialSnapshot({
              requiredUpfrontAmountInCentavos:
                3000000,

              remainingBalanceInCentavos:
                0,
            }),

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
  "financial snapshot validation fails closed",
  () => {
    for (
      const snapshot of [
        null,

        {},

        {
          ...financialSnapshot(),

          schemaVersion: 2,
        },

        {
          ...financialSnapshot(),

          currency: "USD",
        },

        financialSnapshot({
          grossAmountInCentavos:
            100000,

          requiredUpfrontAmountInCentavos:
            50000,

          remainingBalanceInCentavos:
            49999,
        }),
      ]
    ) {
      assert.throws(
        () =>
          providerPaymentObligationForChoice({
            financialSnapshot:
              snapshot,

            paymentChoice:
              "full",
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
  "functions payment choices stay aligned with shared payment contract",
  () => {
    const root =
      path.resolve(
        __dirname,
        "..",
      );

    const sharedPaymentSource =
      fs.readFileSync(
        path.join(
          root,
          "../packages/shared-types/src/payment.ts",
        ),
        "utf8",
      );

    for (
      const choice of [
        "minimum",
        "full",
        "remaining_balance",
      ]
    ) {
      assert.match(
        sharedPaymentSource,
        new RegExp(
          `"${choice}"`,
          "u",
        ),
      );
    }
  },
);

test(
  "P5-B2 checkout uses choice-specific identity while retaining a legacy migration guard",
  () => {
    const root =
      path.resolve(
        __dirname,
        "..",
      );

    const lifecycleSource =
      fs.readFileSync(
        path.join(
          root,
          "src/payments/payment-lifecycle.ts",
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
      lifecycleSource,
      /currentPaymentIdForProviderRequest/u,
    );

    assert.match(
      lifecycleSource,
      /paymentIdForProviderRequestChoice/u,
    );

    assert.match(
      checkoutSource,
      /const paymentId\s*=\s*paymentIdForProviderRequestChoice\s*\(/u,
    );

    assert.match(
      checkoutSource,
      /const legacyPaymentId\s*=\s*paymentIdForProviderRequest\s*\(/u,
    );

    assert.match(
      checkoutSource,
      /initialPaymentChoice/u,
    );

    assert.match(
      checkoutSource,
      /initialPaymentId/u,
    );
  },
);
