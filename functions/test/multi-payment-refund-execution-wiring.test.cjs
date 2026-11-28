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
  "executor consumes immutable refund operation bindings",
  () => {
    assert.match(
      source,
      /readRefundOperationBindings/u,
    );

    assert.match(
      source,
      /prepareRefundOperationSetExecution/u,
    );

    assert.match(
      source,
      /refundOperationBindingFor/u,
    );

    assert.doesNotMatch(
      source,
      /Multi-payment refund execution is not enabled until P5-C5B2b/u,
    );
  },
);

test(
  "multi-operation execution is deterministic and sequential",
  () => {
    assert.match(
      source,
      /records\.find\([\s\S]*?record\.operation\.status !==[\s\S]*?"completed"/u,
    );

    assert.match(
      source,
      /refund\.status ===\s*"succeeded"[\s\S]*?reconciled\.status ===\s*"processing"[\s\S]*?continue/u,
    );
  },
);

test(
  "secondary refund operations are valid operation-set members",
  () => {
    assert.match(
      source,
      /operationSetBinding/u,
    );

    assert.match(
      source,
      /refundOperationSetIndex/u,
    );

    assert.match(
      source,
      /refundOperationSetSize/u,
    );
  },
);

test(
  "reconciliation computes booking status from the entire operation set",
  () => {
    assert.match(
      source,
      /refundOperationSetStatusAfter/u,
    );

    assert.match(
      source,
      /refundOperationSetCancellationStatus/u,
    );

    assert.match(
      source,
      /aggregateStatus ===\s*"refund_completed"/u,
    );
  },
);

test(
  "provider-request refund state is updated only after aggregate completion",
  () => {
    assert.match(
      source,
      /providerRequestRefundStatusForCompletedCancellation/u,
    );

    assert.match(
      source,
      /aggregateStatus ===\s*"refund_completed"[\s\S]*?transaction\.update\(\s*requestReference/u,
    );
  },
);

test(
  "webhook reconciliation shares the aggregate operation-set path",
  () => {
    assert.match(
      source,
      /source:\s*"refund_execution_response"/u,
    );

    assert.match(
      source,
      /source:\s*"refund_execution_response"\s*\|\s*"paymongo_webhook"/u,
    );

    assert.match(
      source,
      /readRefundOperationSetRecordsInTransaction/u,
    );
  },
);
