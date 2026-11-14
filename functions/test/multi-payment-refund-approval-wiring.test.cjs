const assert =
  require("node:assert/strict");

const {
  readFileSync,
} =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const source =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/refunds/refund-execution.ts",
    ),
    "utf8",
  );

test(
  "refund approval reads the trusted payment set",
  () => {
    assert.match(
      source,
      /readTrustedProviderRequestPaymentSetInTransaction/u,
    );

    assert.match(
      source,
      /calculateCancellationRefundForPaymentSet/u,
    );

    assert.match(
      source,
      /allocateCancellationRefundAcrossPayments/u,
    );

    assert.match(
      source,
      /createRefundOperationReservationPlan/u,
    );
  },
);

test(
  "approval persists complete operation identity plus compatibility pointer",
  () => {
    assert.match(
      source,
      /refundOperationPlanSchemaVersion:\s*1/u,
    );

    assert.match(
      source,
      /refundOperationBindings:/u,
    );

    assert.match(
      source,
      /refundOperationIds:/u,
    );

    assert.match(
      source,
      /refundOperationId:\s*operationId/u,
    );
  },
);

test(
  "each allocation reserves accounting under its own payment document",
  () => {
    assert.match(
      source,
      /reservationPaymentReference[\s\S]*?collection\(\s*"refunds"/u,
    );

    assert.match(
      source,
      /refundReservedAmountInCentavos:\s*nextReserved/u,
    );

    assert.match(
      source,
      /reservation\.paymentId/u,
    );

    assert.match(
      source,
      /reservation\s*\.amountInCentavos/u,
    );
  },
);

test(
  "operation-plan approvals are consumed by the multi-operation executor",
  () => {
    assert.doesNotMatch(
      source,
      /Multi-payment refund execution is not enabled until P5-C5B2b/u,
    );

    assert.match(
      source,
      /prepareRefundOperationSetExecution/u,
    );

    assert.match(
      source,
      /refundOperationSetCancellationStatus/u,
    );
  },
);
