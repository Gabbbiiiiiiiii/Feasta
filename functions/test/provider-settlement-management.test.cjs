const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getApps,
  initializeApp,
} = require("firebase-admin/app");

if (getApps().length === 0) {
  initializeApp();
}

const {
  assertProviderRequestFullySettledForServiceStart,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "provider-finance",
  "provider-settlement-management.js",
));

function canonical(overrides = {}) {
  return {
    settlementSchemaVersion: 1,

    settlementStatus:
      "fully_settled",

    outstandingAmountInCentavos:
      0,

    grossSettledAmountInCentavos:
      100000,

    initialPaymentChoice:
      "full",

    initialPaymentId:
      "payment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

    remainingBalancePaymentId:
      null,

    financialSnapshot: {
      schemaVersion: 1,
      currency: "PHP",

      grossAmountInCentavos:
        100000,

      requiredUpfrontAmountInCentavos:
        30000,

      remainingBalanceInCentavos:
        70000,
    },

    ...overrides,
  };
}

test(
  "canonical fully settled booking may start",
  () => {
    assert.doesNotThrow(
      () =>
        assertProviderRequestFullySettledForServiceStart(
          canonical(),
        ),
    );
  },
);

test(
  "canonical booking with Customer balance cannot start",
  () => {
    assert.throws(
      () =>
        assertProviderRequestFullySettledForServiceStart(
          canonical({
            settlementStatus:
              "deposit_settled",

            outstandingAmountInCentavos:
              70000,

            grossSettledAmountInCentavos:
              30000,

            initialPaymentChoice:
              "minimum",
          }),
        ),
      /remaining payment/i,
    );
  },
);

test(
  "minimum plus remaining balance may start once fully settled",
  () => {
    assert.doesNotThrow(
      () =>
        assertProviderRequestFullySettledForServiceStart(
          canonical({
            initialPaymentChoice:
              "minimum",

            remainingBalancePaymentId:
              "payment_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          }),
        ),
    );
  },
);

test(
  "legacy request remains lifecycle compatible",
  () => {
    assert.doesNotThrow(
      () =>
        assertProviderRequestFullySettledForServiceStart(
          {
            status: "confirmed",
          },
        ),
    );
  },
);

test(
  "lifecycle wires clearing only to Provider completion",
  () => {
    const lifecycle =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "provider-requests",
          "update-provider-booking-lifecycle.ts",
        ),
        "utf8",
      );

    assert.match(
      lifecycle,
      /targetStatus === "completed"[\s\S]*releaseProviderRequestEarningsForSettlementInTransaction/u,
    );

    assert.match(
      lifecycle,
      /assertProviderRequestFullySettledForServiceStart/u,
    );
  },
);

test(
  "atomic reservation creates payout attempt without gateway dispatch",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "provider-finance",
          "provider-settlement-management.ts",
        ),
        "utf8",
      );

    assert.match(
      source,
      /reserveProviderSettlementForPayout/u,
    );

    assert.match(
      source,
      /\.collection\(\s*"providerPayoutAttempts"/su,
    );

    assert.match(
      source,
      /transaction\.create\(\s*payoutAttemptReference/su,
    );

    assert.doesNotMatch(
      source,
      /fetch\(/u,
    );

    assert.doesNotMatch(
      source,
      /createPayMongo/u,
    );
  },
);