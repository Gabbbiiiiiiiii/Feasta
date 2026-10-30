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
  allocateCancellationRefundAcrossPayments,
} =
  require(
    "../lib/refunds/refund-allocation-domain.js",
  );

function payment(
  id,
  amount,
  overrides = {},
) {
  return {
    id,

    data: {
      amountInCentavos:
        amount,

      currency:
        "PHP",

      status:
        "paid",

      paidAt:
        Timestamp.now(),

      ...overrides,
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

function calculation(
  overrides = {},
) {
  return {
    schemaVersion:
      1,

    calculationStatus:
      "calculated",

    frozenStage:
      "preparation_not_started",

    refundBasisPoints:
      7500,

    originalPaidAmountInCentavos:
      1000,

    targetTotalRefundAmountInCentavos:
      750,

    completedRefundAmountInCentavos:
      0,

    reservedRefundAmountInCentavos:
      0,

    eligibleRefundAmountInCentavos:
      750,

    remainingRefundableAmountInCentavos:
      1000,

    currency:
      "PHP",

    ...overrides,
  };
}

test(
  "single settled payment receives the entire eligible refund",
  () => {
    const result =
      allocateCancellationRefundAcrossPayments({
        calculation:
          calculation({
            originalPaidAmountInCentavos:
              1000,

            targetTotalRefundAmountInCentavos:
              750,

            eligibleRefundAmountInCentavos:
              750,
          }),

        settlement:
          settlement({
            initialPaymentChoice:
              "full",

            initialPaymentId:
              "payment_full",

            remainingBalancePaymentId:
              null,

            settledPaymentIds: [
              "payment_full",
            ],
          }),

        payments: [
          payment(
            "payment_full",
            1000,
          ),
        ],
      });

    assert.deepEqual(
      result.allocations.map(
        (entry) => [
          entry.paymentId,
          entry.allocatedRefundAmountInCentavos,
        ],
      ),

      [
        [
          "payment_full",
          750,
        ],
      ],
    );
  },
);

test(
  "two settled payments split one booking-level refund deterministically",
  () => {
    const result =
      allocateCancellationRefundAcrossPayments({
        calculation:
          calculation(),

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
      result.totalAllocatedAmountInCentavos,
      750,
    );

    assert.deepEqual(
      result.allocations.map(
        (entry) => [
          entry.paymentId,
          entry.allocatedRefundAmountInCentavos,
        ],
      ),

      [
        [
          "payment_initial",
          300,
        ],
        [
          "payment_balance",
          450,
        ],
      ],
    );
  },
);

test(
  "existing completed and reserved refund accounting reduces each payment capacity",
  () => {
    const initial =
      payment(
        "payment_initial",
        300,
        {
          status:
            "partially_refunded",

          refundAccountingSchemaVersion:
            1,

          refundedAmountInCentavos:
            100,

          refundReservedAmountInCentavos:
            50,
        },
      );

    const balance =
      payment(
        "payment_balance",
        700,
      );

    const result =
      allocateCancellationRefundAcrossPayments({
        calculation:
          calculation({
            completedRefundAmountInCentavos:
              100,

            reservedRefundAmountInCentavos:
              50,

            eligibleRefundAmountInCentavos:
              600,

            remainingRefundableAmountInCentavos:
              850,
          }),

        settlement:
          settlement(),

        payments: [
          initial,
          balance,
        ],
      });

    assert.deepEqual(
      result.allocations.map(
        (entry) => [
          entry.paymentId,
          entry.availableRefundCapacityInCentavos,
          entry.allocatedRefundAmountInCentavos,
        ],
      ),

      [
        [
          "payment_initial",
          150,
          150,
        ],
        [
          "payment_balance",
          700,
          450,
        ],
      ],
    );
  },
);

test(
  "zero eligible refund produces no gateway allocations",
  () => {
    const result =
      allocateCancellationRefundAcrossPayments({
        calculation:
          calculation({
            calculationStatus:
              "nothing_refundable",

            targetTotalRefundAmountInCentavos:
              0,

            eligibleRefundAmountInCentavos:
              0,
          }),

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
      result.totalAllocatedAmountInCentavos,
      0,
    );

    assert.deepEqual(
      result.allocations,
      [],
    );
  },
);

test(
  "allocation refuses unresolved settlement",
  () => {
    assert.throws(
      () =>
        allocateCancellationRefundAcrossPayments({
          calculation:
            calculation({
              originalPaidAmountInCentavos:
                300,

              targetTotalRefundAmountInCentavos:
                225,

              eligibleRefundAmountInCentavos:
                225,

              remainingRefundableAmountInCentavos:
                300,
            }),

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
  "allocation fails closed when aggregate calculation does not match settlement",
  () => {
    assert.throws(
      () =>
        allocateCancellationRefundAcrossPayments({
          calculation:
            calculation({
              originalPaidAmountInCentavos:
                999,
            }),

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

      (error) =>
        error?.details?.reason ===
        "REFUND_ACCOUNTING_INVALID",
    );
  },
);

test(
  "allocation fails closed when one settled payment is missing",
  () => {
    assert.throws(
      () =>
        allocateCancellationRefundAcrossPayments({
          calculation:
            calculation(),

          settlement:
            settlement(),

          payments: [
            payment(
              "payment_initial",
              300,
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
  "allocation cannot exceed remaining gateway refund capacity",
  () => {
    assert.throws(
      () =>
        allocateCancellationRefundAcrossPayments({
          calculation:
            calculation({
              eligibleRefundAmountInCentavos:
                901,
            }),

          settlement:
            settlement(),

          payments: [
            payment(
              "payment_initial",
              300,
              {
                status:
                  "partially_refunded",

                refundAccountingSchemaVersion:
                  1,

                refundedAmountInCentavos:
                  100,

                refundReservedAmountInCentavos:
                  0,
              },
            ),

            payment(
              "payment_balance",
              700,
            ),
          ],
        }),

      (error) =>
        error?.details?.reason ===
        "REFUND_ACCOUNTING_INVALID",
    );
  },
);
