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

const webhook =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/payments/process-webhook.ts",
    ),
    "utf8",
  );

test(
  "webhook applies trusted settlement projection to provider requests",
  () => {
    assert.match(
      webhook,
      /providerRequestSettlementUpdateForPaymentOutcome/u,
    );

    assert.match(
      webhook,
      /createProviderRequestPaymentUpdate\([\s\S]*?providerRequestId: string/u,
    );

    assert.match(
      webhook,
      /providerRequestSettlementUpdateForPaymentOutcome\(\{[\s\S]*?providerRequestId,[\s\S]*?providerRequest,[\s\S]*?paymentId,[\s\S]*?paymentStatus:[\s\S]*?status/u,
    );
  },
);

test(
  "remaining-balance webhook does not override provider-request lifecycle",
  () => {
    assert.match(
      webhook,
      /const isBalancePayment[\s\S]*?remainingBalancePaymentId[\s\S]*?paymentId/u,
    );

    assert.match(
      webhook,
      /if \(isBalancePayment\) \{[\s\S]*?return \{[\s\S]*?update:/u,
    );

    const balanceBlock =
      webhook.match(
        /if \(isBalancePayment\) \{([\s\S]*?)\n  \}\n\n  if \(status === "paid"\)/u,
      );

    assert.ok(
      balanceBlock,
      "Expected isolated balance-payment update block.",
    );

    assert.doesNotMatch(
      balanceBlock[1],
      /statusOverride/u,
    );

    assert.doesNotMatch(
      balanceBlock[1],
      /status:\s*"waiting_for_down_payment"/u,
    );

    assert.doesNotMatch(
      balanceBlock[1],
      /status:\s*"confirmed"/u,
    );
  },
);

test(
  "initial payment webhook retains canonical lifecycle transitions",
  () => {
    assert.match(
      webhook,
      /statusOverride:\s*"confirmed"/u,
    );

    assert.match(
      webhook,
      /statusOverride:\s*\n\s*"waiting_for_down_payment"/u,
    );
  },
);

test(
  "balance payment bypasses only initial provider operational confirmation",
  () => {
    assert.match(
      webhook,
      /nextStatus === "paid" &&[\s\S]*?payment\.paymentChoice !==[\s\S]*?"remaining_balance"/u,
    );
  },
);
