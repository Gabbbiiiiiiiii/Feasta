const assert =
  require("node:assert/strict");

const test =
  require("node:test");

const {
  paymentIdForProviderRequest,
} =
  require(
    "../lib/payments/payment-lifecycle.js",
  );

const {
  paymentIdForProviderRequestChoice,
} =
  require(
    "../lib/payments/payment-obligation.js",
  );

const {
  providerRequestInitialPaymentId,
  providerRequestPaymentReadPlan,
} =
  require(
    "../lib/payments/provider-request-payment-set.js",
  );

const PROVIDER_REQUEST_ID =
  "provider-request-payment-set";

test(
  "legacy requests retain one deterministic payment read",
  () => {
    const expected =
      paymentIdForProviderRequest(
        PROVIDER_REQUEST_ID,
      );

    const plan =
      providerRequestPaymentReadPlan(
        PROVIDER_REQUEST_ID,
        {},
      );

    assert.deepEqual(
      plan,
      {
        mode:
          "legacy",

        paymentIds:
          [expected],

        initialPaymentId:
          null,

        remainingBalancePaymentId:
          null,

        currentPaymentId:
          expected,
      },
    );
  },
);

test(
  "P5 minimum payment read is anchored by immutable initial identity",
  () => {
    const initialPaymentId =
      paymentIdForProviderRequestChoice(
        PROVIDER_REQUEST_ID,
        "minimum",
      );

    const request = {
      initialPaymentChoice:
        "minimum",

      initialPaymentId,

      remainingBalancePaymentId:
        null,

      paymentId:
        initialPaymentId,

      settlementSchemaVersion:
        1,
    };

    const plan =
      providerRequestPaymentReadPlan(
        PROVIDER_REQUEST_ID,
        request,
      );

    assert.equal(
      plan.mode,
      "p5",
    );

    assert.deepEqual(
      plan.paymentIds,
      [initialPaymentId],
    );

    assert.equal(
      providerRequestInitialPaymentId(
        PROVIDER_REQUEST_ID,
        request,
      ),
      initialPaymentId,
    );
  },
);

test(
  "P5 balance read preserves initial payment and adds separate balance identity",
  () => {
    const initialPaymentId =
      paymentIdForProviderRequestChoice(
        PROVIDER_REQUEST_ID,
        "minimum",
      );

    const balancePaymentId =
      paymentIdForProviderRequestChoice(
        PROVIDER_REQUEST_ID,
        "remaining_balance",
      );

    const plan =
      providerRequestPaymentReadPlan(
        PROVIDER_REQUEST_ID,
        {
          initialPaymentChoice:
            "minimum",

          initialPaymentId,

          remainingBalancePaymentId:
            balancePaymentId,

          /*
           * Current pointer has legitimately advanced
           * to the remaining-balance obligation.
           */
          paymentId:
            balancePaymentId,

          settlementSchemaVersion:
            1,
        },
      );

    assert.deepEqual(
      plan.paymentIds,
      [
        initialPaymentId,
        balancePaymentId,
      ],
    );

    assert.equal(
      plan.initialPaymentId,
      initialPaymentId,
    );

    assert.equal(
      plan.remainingBalancePaymentId,
      balancePaymentId,
    );

    assert.equal(
      plan.currentPaymentId,
      balancePaymentId,
    );
  },
);

test(
  "full-payment requests cannot acquire a remaining-balance identity",
  () => {
    const initialPaymentId =
      paymentIdForProviderRequestChoice(
        PROVIDER_REQUEST_ID,
        "full",
      );

    const balancePaymentId =
      paymentIdForProviderRequestChoice(
        PROVIDER_REQUEST_ID,
        "remaining_balance",
      );

    assert.throws(
      () =>
        providerRequestPaymentReadPlan(
          PROVIDER_REQUEST_ID,
          {
            initialPaymentChoice:
              "full",

            initialPaymentId,

            remainingBalancePaymentId:
              balancePaymentId,

            paymentId:
              balancePaymentId,

            settlementSchemaVersion:
              1,
          },
        ),

      /payment set is invalid/u,
    );
  },
);

test(
  "forged P5 current payment pointer fails closed",
  () => {
    const initialPaymentId =
      paymentIdForProviderRequestChoice(
        PROVIDER_REQUEST_ID,
        "minimum",
      );

    assert.throws(
      () =>
        providerRequestPaymentReadPlan(
          PROVIDER_REQUEST_ID,
          {
            initialPaymentChoice:
              "minimum",

            initialPaymentId,

            remainingBalancePaymentId:
              null,

            paymentId:
              "payment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

            settlementSchemaVersion:
              1,
          },
        ),

      /payment set is invalid/u,
    );
  },
);
