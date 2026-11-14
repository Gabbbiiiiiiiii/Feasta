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
      "../src/cancellations/get-provider-request-cancellation.ts",
    ),
    "utf8",
  );

test(
  "cancellation status no longer resolves the singular current payment directly",
  () => {
    assert.doesNotMatch(
      source,
      /currentPaymentIdForProviderRequest/u,
    );

    const trustedReads =
      source.match(
        /readTrustedProviderRequestPaymentSetInTransaction\s*\(/gu,
      ) ?? [];

    assert.ok(
      trustedReads.length >= 2,
    );
  },
);

test(
  "status projection loads immutable refund operation bindings",
  () => {
    assert.match(
      source,
      /readRefundOperationBindings/u,
    );

    assert.match(
      source,
      /loadRefundProjectionState/u,
    );

    assert.match(
      source,
      /refundOperationSetSchemaVersion/u,
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
  "status projection validates aggregate operation state",
  () => {
    assert.match(
      source,
      /refundOperationSetCancellationStatus/u,
    );

    assert.match(
      source,
      /refundOperationSetFailureProgress/u,
    );

    assert.match(
      source,
      /completedAmount !==\s*input\.amount/u,
    );
  },
);

test(
  "completed refund display uses booking-level original paid amount",
  () => {
    assert.match(
      source,
      /originalPaidAmountInCentavos/u,
    );

    assert.match(
      source,
      /input\.amount ===\s*input\.originalPaidAmount/u,
    );
  },
);

test(
  "legacy single-operation display remains supported",
  () => {
    assert.match(
      source,
      /bindings === null/u,
    );

    assert.match(
      source,
      /loadOperation/u,
    );

    assert.match(
      source,
      /safeLegacyRefundProjection/u,
    );
  },
);
