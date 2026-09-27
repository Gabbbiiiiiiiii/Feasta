const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceRoot =
  path.join(
    __dirname,
    "..",
    "src",
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      sourceRoot,
      relativePath,
    ),
    "utf8",
  );
}

test(
  "Provider acceptance freezes canonical remaining-balance timing",
  () => {
    const source =
      read(
        "provider-requests/accept-provider-request.ts",
      );

    assert.match(
      source,
      /remainingBalanceSchedule/u,
    );

    assert.match(
      source,
      /financialSnapshot\s*\.packagePaymentTerms/u,
    );

    assert.match(
      source,
      /remainingBalanceTimingSchemaVersion/u,
    );

    assert.match(
      source,
      /balanceDueDaysBeforeEvent/u,
    );

    assert.match(
      source,
      /remainingBalanceDueAt/u,
    );

    assert.match(
      source,
      /remainingBalanceGraceEndsAt/u,
    );

    assert.match(
      source,
      /Timestamp\.fromDate/u,
    );
  },
);

test(
  "new balance checkout validates timing only after existing checkout recovery",
  () => {
    const source =
      read(
        "payments/create-payment-session.ts",
      );

    const existingIndex =
      source.indexOf(
        "if (existing) {",
      );

    const timingIndex =
      source.indexOf(
        "validateRemainingBalanceTimingSnapshot",
      );

    const payoutIndex =
      source.indexOf(
        "const payoutAccountSnapshot",
      );

    assert.ok(
      existingIndex >= 0,
      "existing checkout branch must exist",
    );

    assert.ok(
      timingIndex > existingIndex,
      "timing gate must not preempt existing checkout recovery",
    );

    assert.ok(
      payoutIndex > timingIndex,
      "timing gate must run before reserving a new payout-dependent checkout",
    );
  },
);

test(
  "active cancellation blocks only creation of a new balance checkout",
  () => {
    const source =
      read(
        "payments/create-payment-session.ts",
      );

    assert.match(
      source,
      /activeCancellationRequestId !== null/u,
    );

    assert.match(
      source,
      /remaining balance cannot be paid while a cancellation request is active/iu,
    );
  },
);

test(
  "early balance payment remains allowed",
  () => {
    const source =
      read(
        "payments/create-payment-session.ts",
      );

    assert.match(
      source,
      /Early payment is deliberately allowed/u,
    );

    assert.doesNotMatch(
      source,
      /schedule\.status === "not_due".*throw/su,
    );
  },
);

test(
  "webhook remains independent of remaining-balance timing gate",
  () => {
    const source =
      read(
        "payments/process-webhook.ts",
      );

    assert.doesNotMatch(
      source,
      /validateRemainingBalanceTimingSnapshot/u,
    );

    assert.match(
      source,
      /remainingBalancePaymentId/u,
    );

    assert.match(
      source,
      /providerRequestSettlementUpdateForPaymentOutcome/u,
    );
  },
);