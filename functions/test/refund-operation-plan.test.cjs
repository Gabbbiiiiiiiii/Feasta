const assert =
  require("node:assert/strict");

const test =
  require("node:test");

const {
  refundOperationId,
} =
  require(
    "../lib/refunds/refund-accounting-domain.js",
  );

const {
  createRefundOperationReservationPlan,
} =
  require(
    "../lib/refunds/refund-operation-plan.js",
  );

const cancellationRequestId =
  "cancellation_operation_plan";

const operationKey =
  "approved-policy-cancellation:test-key";

function allocation(
  allocations,
  requestedAmountInCentavos,
) {
  return {
    requestedAmountInCentavos,

    totalAllocatedAmountInCentavos:
      requestedAmountInCentavos,

    allocations,
  };
}

test(
  "single payment keeps one deterministic refund operation",
  () => {
    const result =
      createRefundOperationReservationPlan({
        cancellationRequestId,
        operationKey,

        allocation:
          allocation(
            [
              {
                paymentId:
                  "payment_full",

                allocatedRefundAmountInCentavos:
                  750,
              },
            ],
            750,
          ),
      });

    const expected =
      refundOperationId({
        paymentId:
          "payment_full",

        cancellationRequestId,

        operationKey,
      });

    assert.deepEqual(
      result.refundOperationIds,
      [expected],
    );

    assert.equal(
      result.compatibilityRefundOperationId,
      expected,
    );

    assert.equal(
      result.reservations[0]
        .amountInCentavos,
      750,
    );
  },
);

test(
  "multi-payment allocation creates one distinct operation per payment",
  () => {
    const result =
      createRefundOperationReservationPlan({
        cancellationRequestId,
        operationKey,

        allocation:
          allocation(
            [
              {
                paymentId:
                  "payment_initial",

                allocatedRefundAmountInCentavos:
                  300,
              },
              {
                paymentId:
                  "payment_balance",

                allocatedRefundAmountInCentavos:
                  450,
              },
            ],
            750,
          ),
      });

    assert.equal(
      result.reservations.length,
      2,
    );

    assert.equal(
      result.refundOperationIds.length,
      2,
    );

    assert.notEqual(
      result.refundOperationIds[0],
      result.refundOperationIds[1],
    );

    assert.equal(
      result.compatibilityRefundOperationId,
      result.refundOperationIds[0],
    );

    assert.deepEqual(
      result.reservations.map(
        (reservation) => [
          reservation.paymentId,
          reservation.amountInCentavos,
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
  "operation identities are stable across retries",
  () => {
    const input = {
      cancellationRequestId,
      operationKey,

      allocation:
        allocation(
          [
            {
              paymentId:
                "payment_initial",

              allocatedRefundAmountInCentavos:
                300,
            },
            {
              paymentId:
                "payment_balance",

              allocatedRefundAmountInCentavos:
                450,
            },
          ],
          750,
        ),
    };

    assert.deepEqual(
      createRefundOperationReservationPlan(
        input,
      ),

      createRefundOperationReservationPlan(
        input,
      ),
    );
  },
);

test(
  "operation order follows deterministic allocation order",
  () => {
    const result =
      createRefundOperationReservationPlan({
        cancellationRequestId,
        operationKey,

        allocation:
          allocation(
            [
              {
                paymentId:
                  "payment_initial",

                allocatedRefundAmountInCentavos:
                  300,
              },
              {
                paymentId:
                  "payment_balance",

                allocatedRefundAmountInCentavos:
                  450,
              },
            ],
            750,
          ),
      });

    assert.deepEqual(
      result.reservations.map(
        (reservation) =>
          reservation.paymentId,
      ),

      [
        "payment_initial",
        "payment_balance",
      ],
    );
  },
);

test(
  "zero refund creates no operation and no compatibility pointer",
  () => {
    const result =
      createRefundOperationReservationPlan({
        cancellationRequestId,
        operationKey,

        allocation:
          allocation(
            [],
            0,
          ),
      });

    assert.deepEqual(
      result.refundOperationIds,
      [],
    );

    assert.deepEqual(
      result.reservations,
      [],
    );

    assert.equal(
      result.compatibilityRefundOperationId,
      null,
    );
  },
);

test(
  "duplicate payment allocation fails closed",
  () => {
    assert.throws(
      () =>
        createRefundOperationReservationPlan({
          cancellationRequestId,
          operationKey,

          allocation:
            allocation(
              [
                {
                  paymentId:
                    "payment_initial",

                  allocatedRefundAmountInCentavos:
                    300,
                },
                {
                  paymentId:
                    "payment_initial",

                  allocatedRefundAmountInCentavos:
                    450,
                },
              ],
              750,
            ),
        }),

      (error) =>
        error?.details?.reason ===
        "REFUND_OPERATION_CONFLICT",
    );
  },
);

test(
  "operation plan requires exact booking-level total",
  () => {
    assert.throws(
      () =>
        createRefundOperationReservationPlan({
          cancellationRequestId,
          operationKey,

          allocation: {
            requestedAmountInCentavos:
              750,

            totalAllocatedAmountInCentavos:
              700,

            allocations: [
              {
                paymentId:
                  "payment_initial",

                allocatedRefundAmountInCentavos:
                  300,
              },
              {
                paymentId:
                  "payment_balance",

                allocatedRefundAmountInCentavos:
                  400,
              },
            ],
          },
        }),

      (error) =>
        error?.details?.reason ===
        "REFUND_OPERATION_CONFLICT",
    );
  },
);

test(
  "non-positive per-payment reservations fail closed",
  () => {
    for (const amount of [
      0,
      -1,
      1.5,
    ]) {
      assert.throws(
        () =>
          createRefundOperationReservationPlan({
            cancellationRequestId,
            operationKey,

            allocation:
              allocation(
                [
                  {
                    paymentId:
                      "payment_initial",

                    allocatedRefundAmountInCentavos:
                      amount,
                  },
                ],
                amount > 0
                  ? amount
                  : 0,
              ),
          }),

        (error) =>
          error?.details?.reason ===
          "REFUND_OPERATION_CONFLICT",
      );
    }
  },
);
