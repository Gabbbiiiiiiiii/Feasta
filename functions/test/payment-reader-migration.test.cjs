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

function source(relativePath) {
  return readFileSync(
    path.resolve(
      __dirname,
      "../src",
      relativePath,
    ),
    "utf8",
  );
}

function countMatches(
  content,
  expression,
) {
  return (
    content.match(
      expression,
    ) ?? []
  ).length;
}

test(
  "cancellation decision readers use the trusted payment set",
  () => {
    const getCancellation =
      source(
        "cancellations/get-provider-request-cancellation.ts",
      );

    const submitCancellation =
      source(
        "cancellations/submit-provider-request-cancellation.ts",
      );

    const advanceEligibility =
      source(
        "cancellations/advance-refund-eligibility-stage.ts",
      );

    for (
      const content of [
        getCancellation,
        submitCancellation,
        advanceEligibility,
      ]
    ) {
      assert.match(
        content,
        /readTrustedProviderRequestPaymentSetInTransaction/u,
      );

      assert.doesNotMatch(
        content,
        /\bpaymentIdForProviderRequest\s*\(/u,
      );
    }

    assert.match(
      getCancellation,
      /cancellationPaymentSetState/u,
    );

    assert.match(
      getCancellation,
      /calculateCancellationRefundForPaymentSet/u,
    );

    assert.match(
      submitCancellation,
      /cancellationPaymentSetState/u,
    );

    assert.match(
      submitCancellation,
      /calculateCancellationRefundForPaymentSet/u,
    );

    assert.match(
      advanceEligibility,
      /assertPreparationReadyForSettlement/u,
    );
  },
);

test(
  "only legacy refund execution retains the current pointer after C5",
  () => {
    const getCancellation =
      source(
        "cancellations/get-provider-request-cancellation.ts",
      );

    const submitCancellation =
      source(
        "cancellations/submit-provider-request-cancellation.ts",
      );

    const advanceEligibility =
      source(
        "cancellations/advance-refund-eligibility-stage.ts",
      );

    const refundExecution =
      source(
        "refunds/refund-execution.ts",
      );

    assert.equal(
      countMatches(
        getCancellation,
        /currentPaymentIdForProviderRequest\s*\(/gu,
      ),
      0,
    );

    assert.equal(
      countMatches(
        submitCancellation,
        /currentPaymentIdForProviderRequest\s*\(/gu,
      ),
      0,
    );

    assert.equal(
      countMatches(
        advanceEligibility,
        /currentPaymentIdForProviderRequest\s*\(/gu,
      ),
      0,
    );

    assert.equal(
      countMatches(
        refundExecution,
        /currentPaymentIdForProviderRequest\s*\(/gu,
      ),
      1,
    );
  },
);

test(
  "refund execution still reads provider request before resolving its current payment",
  () => {
    const content =
      source(
        "refunds/refund-execution.ts",
      );

    assert.match(
      content,
      /const requestSnapshot\s*=\s*await transaction\.get\(\s*requestReference,\s*\);[\s\S]*?const providerRequest\s*=[\s\S]*?currentPaymentIdForProviderRequest/u,
    );
  },
);

test(
  "legacy deterministic fallback remains centralized in payment lifecycle",
  () => {
    const lifecycle =
      source(
        "payments/payment-lifecycle.ts",
      );

    assert.match(
      lifecycle,
      /export function currentPaymentIdForProviderRequest/u,
    );

    assert.match(
      lifecycle,
      /return paymentIdForProviderRequest\(/u,
    );
  },
);
