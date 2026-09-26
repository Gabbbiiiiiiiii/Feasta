const assert =
  require("node:assert/strict");

const test =
  require("node:test");

const {
  Timestamp,
} =
  require(
    "firebase-admin/firestore",
  );

const {
  cancellationPaymentSetState,
} =
  require(
    "../lib/cancellations/cancellation-payment-state.js",
  );

const refund =
  require(
    "../lib/refunds/refund-accounting-domain.js",
  );

function payment(
  id,
  amount,
  status = "paid",
) {
  return {
    id,

    data: {
      amountInCentavos:
        amount,

      currency:
        "PHP",

      status,

      paidAt:
        Timestamp.now(),
    },
  };
}

function settlement(
  overrides = {},
) {
  return {
    schemaVersion:
      1,

    status:
      "fully_settled",

    initialPaymentChoice:
      "minimum",

    initialPaymentId:
      "payment_initial",

    remainingBalancePaymentId:
      "payment_balance",

    grossAmountInCentavos:
      1000,

    grossSettledAmountInCentavos:
      1000,

    outstandingAmountInCentavos:
      0,

    fullySettled:
      true,

    settledPaymentIds: [
      "payment_initial",
      "payment_balance",
    ],

    unresolvedPaymentIds:
      [],

    ...overrides,
  };
}

function policyRequest() {
  const now =
    Timestamp.now();

  return {
    refundPolicySnapshot: {
      schemaVersion:
        1,

      policyKey:
        "provider_default:provider_test:v1",

      source: {
        kind:
          "provider_default",

        sourceId:
          "provider_test",

        policyVersion:
          1,
      },

      rules: [
        {
          stage:
            "preparation_not_started",

          refundBasisPoints:
            7500,
        },
        {
          stage:
            "preparation_started",

          refundBasisPoints:
            5000,
        },
        {
          stage:
            "service_started",

          refundBasisPoints:
            0,
        },
      ],

      terms:
        null,

      capturedAt:
        now,
    },

    refundPolicyAgreement: {
      schemaVersion:
        1,

      policyKey:
        "provider_default:provider_test:v1",

      agreedAt:
        now,

      channel:
        "booking_submission",
    },

    refundEligibilityState: {
      schemaVersion:
        1,

      currentStage:
        "preparation_not_started",

      stageSequence:
        0,

      enteredAt:
        now,

      activeCancellationRequestId:
        "cancellation_test",
    },
  };
}

function cancellation() {
  return {
    policyEvidenceStatus:
      "policy_backed",

    frozenEligibility: {
      stage:
        "preparation_not_started",

      stageSequence:
        0,

      frozenAt:
        Timestamp.now(),
    },
  };
}

test(
  "balance processing waits without reopening the settled deposit",
  () => {
    const state =
      cancellationPaymentSetState(
        {
          status:
            "confirmed",

          paymentStatus:
            "paid",

          downPaymentAmount:
            3,
        },

        settlement({
          status:
            "balance_payment_processing",

          grossSettledAmountInCentavos:
            300,

          outstandingAmountInCentavos:
            700,

          fullySettled:
            false,

          settledPaymentIds: [
            "payment_initial",
          ],

          unresolvedPaymentIds: [
            "payment_balance",
          ],
        }),

        [
          payment(
            "payment_initial",
            300,
          ),

          {
            id:
              "payment_balance",

            data: {
              amountInCentavos:
                700,

              currency:
                "PHP",

              status:
                "processing",
            },
          },
        ],
      );

    assert.equal(
      state,
      "awaiting_payment_resolution",
    );
  },
);

test(
  "failed balance leaves the settled deposit cancellation-ready",
  () => {
    const state =
      cancellationPaymentSetState(
        {
          status:
            "confirmed",

          paymentStatus:
            "paid",

          downPaymentAmount:
            3,
        },

        settlement({
          status:
            "deposit_settled",

          grossSettledAmountInCentavos:
            300,

          outstandingAmountInCentavos:
            700,

          fullySettled:
            false,

          settledPaymentIds: [
            "payment_initial",
          ],

          unresolvedPaymentIds:
            [],
        }),

        [
          payment(
            "payment_initial",
            300,
          ),

          {
            id:
              "payment_balance",

            data: {
              amountInCentavos:
                700,

              currency:
                "PHP",

              status:
                "failed",
            },
          },
        ],
      );

    assert.equal(
      state,
      "ready",
    );
  },
);

test(
  "refund activity on any payment blocks a second cancellation",
  () => {
    const initial =
      payment(
        "payment_initial",
        300,
      );

    const balance =
      payment(
        "payment_balance",
        700,
      );

    balance.data = {
      ...balance.data,

      refundAccountingSchemaVersion:
        1,

      refundedAmountInCentavos:
        0,

      refundReservedAmountInCentavos:
        50,
    };

    assert.equal(
      cancellationPaymentSetState(
        {
          status:
            "confirmed",

          paymentStatus:
            "paid",

          downPaymentAmount:
            3,
        },

        settlement(),

        [
          initial,
          balance,
        ],
      ),

      "refund_ineligible",
    );
  },
);

test(
  "aggregate refund accounting sums separate gateway payments",
  () => {
    assert.deepEqual(
      refund
        .readPaymentSetRefundAccounting({
          settlement:
            settlement(),

          payments: [
            payment(
              "payment_initial",
              300,
            ),

            payment(
              "payment_balance",
              700,
            ),
          ],
        }),

      {
        originalPaidAmountInCentavos:
          1000,

        completedRefundAmountInCentavos:
          0,

        reservedRefundAmountInCentavos:
          0,
      },
    );
  },
);

test(
  "aggregate refund accounting sums completed and reserved refunds independently",
  () => {
    const initial =
      payment(
        "payment_initial",
        300,
      );

    initial.data = {
      ...initial.data,

      status:
        "partially_refunded",

      refundAccountingSchemaVersion:
        1,

      refundedAmountInCentavos:
        100,

      refundReservedAmountInCentavos:
        50,
    };

    const balance =
      payment(
        "payment_balance",
        700,
      );

    assert.deepEqual(
      refund
        .readPaymentSetRefundAccounting({
          settlement:
            settlement(),

          payments: [
            initial,
            balance,
          ],
        }),

      {
        originalPaidAmountInCentavos:
          1000,

        completedRefundAmountInCentavos:
          100,

        reservedRefundAmountInCentavos:
          50,
      },
    );
  },
);

test(
  "multi-payment refund calculation applies policy to total historically settled money",
  () => {
    const result =
      refund
        .calculateCancellationRefundForPaymentSet({
          providerRequest:
            policyRequest(),

          cancellationRequest:
            cancellation(),

          settlement:
            settlement(),

          payments: [
            payment(
              "payment_initial",
              300,
            ),

            payment(
              "payment_balance",
              700,
            ),
          ],
        });

    assert.equal(
      result.calculationStatus,
      "calculated",
    );

    assert.equal(
      result.originalPaidAmountInCentavos,
      1000,
    );

    assert.equal(
      result.targetTotalRefundAmountInCentavos,
      750,
    );

    assert.equal(
      result.eligibleRefundAmountInCentavos,
      750,
    );
  },
);

test(
  "unresolved payment set cannot produce a refund amount",
  () => {
    assert.throws(
      () =>
        refund
          .readPaymentSetRefundAccounting({
            settlement:
              settlement({
                status:
                  "balance_payment_processing",

                grossSettledAmountInCentavos:
                  300,

                outstandingAmountInCentavos:
                  700,

                fullySettled:
                  false,

                settledPaymentIds: [
                  "payment_initial",
                ],

                unresolvedPaymentIds: [
                  "payment_balance",
                ],
              }),

            payments: [
              payment(
                "payment_initial",
                300,
              ),

              {
                id:
                  "payment_balance",

                data: {
                  amountInCentavos:
                    700,

                  currency:
                    "PHP",

                  status:
                    "processing",
                },
              },
            ],
          }),

      (error) =>
        error?.details?.reason ===
        "REFUND_PAYMENT_NOT_SETTLED",
    );
  },
);

test(
  "aggregate accounting fails closed when settlement total and payment set disagree",
  () => {
    assert.throws(
      () =>
        refund
          .readPaymentSetRefundAccounting({
            settlement:
              settlement(),

            payments: [
              payment(
                "payment_initial",
                300,
              ),

              payment(
                "payment_balance",
                600,
              ),
            ],
          }),

      (error) =>
        error?.details?.reason ===
        "REFUND_ACCOUNTING_INVALID",
    );
  },
);
test(
  "P5 preparation accepts settled initial payment while balance is processing",
  () => {
    const {
      assertPreparationReadyForSettlement,
    } =
      require(
        "../lib/cancellations/refund-cancellation-domain.js",
      );

    assert.doesNotThrow(
      () =>
        assertPreparationReadyForSettlement({
          providerRequestStatus:
            "confirmed",

          downPaymentAmount:
            300,

          settlement:
            settlement({
              status:
                "balance_payment_processing",

              grossSettledAmountInCentavos:
                300,

              outstandingAmountInCentavos:
                700,

              fullySettled:
                false,

              settledPaymentIds: [
                "payment_initial",
              ],

              unresolvedPaymentIds: [
                "payment_balance",
              ],
            }),
        }),
    );
  },
);

test(
  "P5 preparation rejects unresolved initial payment",
  () => {
    const {
      assertPreparationReadyForSettlement,
    } =
      require(
        "../lib/cancellations/refund-cancellation-domain.js",
      );

    assert.throws(
      () =>
        assertPreparationReadyForSettlement({
          providerRequestStatus:
            "confirmed",

          downPaymentAmount:
            300,

          settlement:
            settlement({
              status:
                "initial_payment_processing",

              grossSettledAmountInCentavos:
                0,

              outstandingAmountInCentavos:
                1000,

              fullySettled:
                false,

              settledPaymentIds:
                [],

              unresolvedPaymentIds: [
                "payment_initial",
              ],
            }),
        }),

      (error) =>
        error?.details?.reason ===
        "REFUND_ELIGIBILITY_TRANSITION_INVALID",
    );
  },
);
