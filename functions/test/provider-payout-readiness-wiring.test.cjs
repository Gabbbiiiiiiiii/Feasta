const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const root =
  path.resolve(
    __dirname,
    "../src",
  );

const acceptance =
  fs.readFileSync(
    path.join(
      root,
      "provider-requests/accept-provider-request.ts",
    ),
    "utf8",
  );

const checkout =
  fs.readFileSync(
    path.join(
      root,
      "payments/create-payment-session.ts",
    ),
    "utf8",
  );

test(
  "provider acceptance requires trusted payout readiness",
  () => {
    assert.match(
      acceptance,
      /providerPayoutReadinessReason/u,
    );

    assert.match(
      acceptance,
      /\.collection\(\s*"providerPaymentAccounts"\s*,?\s*\)/u,
    );

    assert.match(
      acceptance,
      /payoutSetupRequired:\s*true/u,
    );

    assert.match(
      acceptance,
      /Complete payout setup before accepting new booking requests\./u,
    );

    const readinessIndex =
      acceptance.indexOf(
        "providerPayoutReadinessReason",
        acceptance.indexOf(
          "const payoutAccountSnapshot",
        ),
      );

    const acceptedWriteIndex =
      acceptance.indexOf(
        "transaction.update(",
        acceptance.indexOf(
          "const {nextStatus, summary, overrides}",
        ),
      );

    assert.ok(
      readinessIndex >= 0,
      "acceptance payout-readiness check is missing",
    );

    assert.ok(
      acceptedWriteIndex >= 0,
      "provider acceptance write is missing",
    );

    assert.ok(
      readinessIndex < acceptedWriteIndex,
      "payout readiness must be checked before accepting the provider request",
    );
  },
);

test(
  "new checkout requires trusted payout readiness",
  () => {
    assert.match(
      checkout,
      /providerPayoutReadinessReason/u,
    );

    assert.match(
      checkout,
      /\.collection\(\s*"providerPaymentAccounts"\s*,?\s*\)/u,
    );

    assert.match(
      checkout,
      /payoutSetupRequired:\s*true/u,
    );

    assert.match(
      checkout,
      /Payment cannot start until the provider's payout setup is ready\./u,
    );
  },
);

test(
  "payout readiness does not preempt existing checkout recovery",
  () => {
    const existingPaymentIndex =
      checkout.indexOf(
        "if (existing) {",
      );

    const payoutGateIndex =
      checkout.indexOf(
        "const payoutAccountSnapshot",
      );

    const newReservationIndex =
      checkout.indexOf(
        "if (selectingInitialPayment)",
        payoutGateIndex,
      );

    assert.ok(
      existingPaymentIndex >= 0,
      "existing checkout handling is missing",
    );

    assert.ok(
      payoutGateIndex >= 0,
      "payout-readiness gate is missing",
    );

    assert.ok(
      newReservationIndex >= 0,
      "new payment reservation path is missing",
    );

    assert.ok(
      existingPaymentIndex < payoutGateIndex,
      "existing checkout recovery must run before payout readiness is rechecked",
    );

    assert.ok(
      payoutGateIndex < newReservationIndex,
      "payout readiness must be checked before reserving a new payment",
    );
  },
);

test(
  "payout readiness is derived from trusted provider identity",
  () => {
    assert.match(
      checkout,
      /\.doc\(\s*providerId\s*\)/u,
    );

    assert.doesNotMatch(
      checkout,
      /input\.payoutReady/u,
    );

    assert.doesNotMatch(
      checkout,
      /input\.providerPaymentAccount/u,
    );

    assert.match(
      acceptance,
      /\.doc\(\s*authorized\.providerId\s*,?\s*\)/u,
    );

    assert.doesNotMatch(
      acceptance,
      /input\.payoutReady/u,
    );
  },
);