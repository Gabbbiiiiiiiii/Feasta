const assert =
  require("node:assert/strict");

const test =
  require("node:test");

const {
  readRefundOperationBindings,
  refundOperationBindingFor,
  refundOperationSetCancellationStatus,
} =
  require(
    "../lib/refunds/refund-operation-set.js",
  );

const paymentA =
  "payment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const paymentB =
  "payment_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const operationA =
  "refund_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const operationB =
  "refund_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function cancellation(
  overrides = {},
) {
  return {
    refundOperationPlanSchemaVersion:
      1,

    refundOperationId:
      operationA,

    refundOperationIds: [
      operationA,
      operationB,
    ],

    refundOperationBindings: [
      {
        paymentId:
          paymentA,

        refundOperationId:
          operationA,

        amountInCentavos:
          300,
      },
      {
        paymentId:
          paymentB,

        refundOperationId:
          operationB,

        amountInCentavos:
          450,
      },
    ],

    ...overrides,
  };
}

function entry(
  paymentId,
  refundOperationId,
  status,
  overrides = {},
) {
  return {
    paymentId,
    refundOperationId,
    status,

    gatewayFailureCertainty:
      null,

    failureCode:
      null,

    ...overrides,
  };
}

test(
  "reads immutable payment-to-operation bindings in stored order",
  () => {
    assert.deepEqual(
      readRefundOperationBindings(
        cancellation(),
      ),

      [
        {
          paymentId:
            paymentA,

          refundOperationId:
            operationA,

          amountInCentavos:
            300,
        },
        {
          paymentId:
            paymentB,

          refundOperationId:
            operationB,

          amountInCentavos:
            450,
        },
      ],
    );
  },
);

test(
  "compatibility operation remains the first operation only",
  () => {
    assert.throws(
      () =>
        readRefundOperationBindings(
          cancellation({
            refundOperationId:
              operationB,
          }),
        ),

      (error) =>
        error?.details?.reason ===
        "REFUND_OPERATION_CONFLICT",
    );
  },
);

test(
  "binding lookup permits every operation in the set",
  () => {
    const result =
      refundOperationBindingFor(
        cancellation(),
        paymentB,
        operationB,
      );

    assert.equal(
      result?.amountInCentavos,
      450,
    );
  },
);

test(
  "one completed operation does not complete a two-operation refund",
  () => {
    assert.equal(
      refundOperationSetCancellationStatus([
        entry(
          paymentA,
          operationA,
          "completed",
        ),
        entry(
          paymentB,
          operationB,
          "reserved",
        ),
      ]),

      "refund_processing",
    );
  },
);

test(
  "the cancellation completes only after every operation completes",
  () => {
    assert.equal(
      refundOperationSetCancellationStatus([
        entry(
          paymentA,
          operationA,
          "completed",
        ),
        entry(
          paymentB,
          operationB,
          "completed",
        ),
      ]),

      "refund_completed",
    );
  },
);

test(
  "one failed operation keeps the booking-level refund failed",
  () => {
    assert.equal(
      refundOperationSetCancellationStatus([
        entry(
          paymentA,
          operationA,
          "completed",
        ),
        entry(
          paymentB,
          operationB,
          "failed",
        ),
      ]),

      "refund_failed",
    );
  },
);

test(
  "ambiguous processing requires reconciliation",
  () => {
    assert.equal(
      refundOperationSetCancellationStatus([
        entry(
          paymentA,
          operationA,
          "completed",
        ),
        entry(
          paymentB,
          operationB,
          "processing",
          {
            gatewayFailureCertainty:
              "ambiguous",
          },
        ),
      ]),

      "refund_failed",
    );
  },
);

test(
  "manual gateway capability failures stay failed until resolved",
  () => {
    assert.equal(
      refundOperationSetCancellationStatus([
        entry(
          paymentA,
          operationA,
          "completed",
        ),
        entry(
          paymentB,
          operationB,
          "failed",
          {
            failureCode:
              "GATEWAY_MINIMUM_UNSUPPORTED",
          },
        ),
      ]),

      "refund_failed",
    );
  },
);

test(
  "zero-refund operation plans may contain no operations",
  () => {
    assert.deepEqual(
      readRefundOperationBindings({
        refundOperationPlanSchemaVersion:
          1,

        refundOperationId:
          null,

        refundOperationIds:
          [],

        refundOperationBindings:
          [],
      }),

      [],
    );
  },
);

test(
  "mismatched operation IDs and duplicate payments fail closed",
  () => {
    assert.throws(
      () =>
        readRefundOperationBindings(
          cancellation({
            refundOperationBindings: [
              {
                paymentId:
                  paymentA,

                refundOperationId:
                  operationA,

                amountInCentavos:
                  300,
              },
              {
                paymentId:
                  paymentA,

                refundOperationId:
                  operationB,

                amountInCentavos:
                  450,
              },
            ],
          }),
        ),

      (error) =>
        error?.details?.reason ===
        "REFUND_OPERATION_CONFLICT",
    );
  },
);
