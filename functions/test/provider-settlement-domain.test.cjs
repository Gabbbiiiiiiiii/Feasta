const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  settlementIdForEarning,
  payoutAttemptIdForSettlement,
  buildProviderSettlementPlan,
  reserveProviderSettlementPayout,
  completeProviderSettlementPayout,
  failProviderSettlementPayout,
  releaseProviderSettlementAvailability,
  assertProviderSettlementRefundDispatchAllowed,
  buildProviderSettlementRefundUpdate,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "provider-finance",
  "provider-settlement-domain.js",
));

function earning(overrides = {}) {
  return {
    schemaVersion: 1,
    earningId: "payment_12345678",
    paymentId: "payment_12345678",
    providerRequestId: "provider_request_12345678",
    mainEventId: "main_event_12345678",
    providerId: "provider_12345678",
    customerId: "customer_12345678",
    currency: "PHP",

    earningAmountInCentavos: 90000,
    pendingAmountInCentavos: 90000,
    availableAmountInCentavos: 0,
    paidAmountInCentavos: 0,
    reversedAmountInCentavos: 0,

    ...overrides,
  };
}

test(
  "settlement identity is deterministic per earning",
  () => {
    const a =
      settlementIdForEarning(
        "payment_12345678",
      );

    const b =
      settlementIdForEarning(
        "payment_12345678",
      );

    assert.equal(a, b);
    assert.match(
      a,
      /^settlement_[a-f0-9]{32}$/u,
    );
  },
);

test(
  "customer-paid earning may still await Provider settlement",
  () => {
    const plan =
      buildProviderSettlementPlan({
        earningId:
          "payment_12345678",
        earning: earning(),
        timestamp: "now",
      });

    assert.equal(
      plan.settlementRecord.status,
      "awaiting_availability",
    );

    assert.equal(
      plan.settlementRecord
        .paidOutAmountInCentavos,
      0,
    );

    assert.equal(
      plan.settlementRecord
        .netSettlementAmountInCentavos,
      90000,
    );
  },
);

test(
  "available earning produces a ready settlement",
  () => {
    const plan =
      buildProviderSettlementPlan({
        earningId:
          "payment_12345678",

        earning: earning({
          pendingAmountInCentavos: 0,
          availableAmountInCentavos:
            90000,
        }),

        timestamp: "now",
      });

    assert.equal(
      plan.settlementRecord.status,
      "ready",
    );
  },
);

test(
  "fully reversed earning produces cancelled settlement",
  () => {
    const plan =
      buildProviderSettlementPlan({
        earningId:
          "payment_12345678",

        earning: earning({
          pendingAmountInCentavos: 0,
          reversedAmountInCentavos:
            90000,
        }),

        timestamp: "now",
      });

    assert.equal(
      plan.settlementRecord.status,
      "cancelled",
    );

    assert.equal(
      plan.settlementRecord
        .netSettlementAmountInCentavos,
      0,
    );
  },
);

test(
  "reservation keeps earning available and locks only settlement truth",
  () => {
    const plan =
      buildProviderSettlementPlan({
        earningId:
          "payment_12345678",

        earning: earning({
          pendingAmountInCentavos: 0,
          availableAmountInCentavos:
            90000,
        }),

        timestamp: "created",
      });

    const result =
      reserveProviderSettlementPayout({
        settlement:
          plan.settlementRecord,

        earning: earning({
          pendingAmountInCentavos: 0,
          availableAmountInCentavos:
            90000,
        }),

        attemptSequence: 1,
        timestamp: "reserved",
      });

    assert.equal(
      result.settlementUpdate.status,
      "reserved",
    );

    assert.equal(
      result.settlementUpdate
        .reservedAmountInCentavos,
      90000,
    );

    assert.equal(
      result.earningUpdate
        .availableAmountInCentavos,
      undefined,
    );

    assert.equal(
      result.earningUpdate
        .pendingAmountInCentavos,
      undefined,
    );

    assert.equal(
      result.payoutAttemptRecord.status,
      "reserved",
    );
  },
);
test(
  "successful payout moves available earning into paid bucket",
  () => {
    const settlementId =
      settlementIdForEarning(
        "payment_12345678",
      );

    const payoutAttemptId =
      payoutAttemptIdForSettlement(
        settlementId,
        1,
      );

    const result =
      completeProviderSettlementPayout({
        settlement: {
          schemaVersion: 1,
          settlementId,
          earningId:
            "payment_12345678",
          paymentId:
            "payment_12345678",
          providerRequestId:
            "provider_request_12345678",
          mainEventId:
            "main_event_12345678",
          providerId:
            "provider_12345678",
          customerId:
            "customer_12345678",
          currency: "PHP",

          originalEarningAmountInCentavos:
            90000,
          reversedAmountInCentavos:
            0,
          netSettlementAmountInCentavos:
            90000,
          reservedAmountInCentavos:
            90000,
          paidOutAmountInCentavos:
            0,

          status:
            "processing",

          activePayoutAttemptId:
            payoutAttemptId,
          lastPayoutAttemptId:
            payoutAttemptId,

          reconciliationRequired:
            false,
          reconciliationReason:
            null,

          createdAt: "created",
          updatedAt: "updated",
          paidOutAt: null,
        },

        earning: earning({
          pendingAmountInCentavos: 0,
          availableAmountInCentavos:
            90000,
        }),

        payoutAttempt: {
          schemaVersion: 1,
          payoutAttemptId,
          settlementId,
          earningId:
            "payment_12345678",
          providerId:
            "provider_12345678",
          currency: "PHP",
          amountInCentavos:
            90000,
          status:
            "processing",
          gateway:
            "paymongo",
          gatewayResourceId:
            "resource_1",
          failureCode:
            null,
          failureMessage:
            null,
          createdAt:
            "created",
          updatedAt:
            "updated",
          submittedAt:
            "submitted",
          completedAt:
            null,
        },

        timestamp:
          "paid",
      });

    assert.equal(
      result.settlementUpdate.status,
      "paid",
    );

    assert.equal(
      result.earningUpdate
        .availableAmountInCentavos,
      0,
    );

    assert.equal(
      result.earningUpdate
        .paidAmountInCentavos,
      90000,
    );

    assert.equal(
      result.payoutAttemptUpdate.status,
      "succeeded",
    );
  },
);
test(
  "known failed payout releases settlement lock without moving earning buckets",
  () => {
    const settlementId =
      settlementIdForEarning(
        "payment_12345678",
      );

    const payoutAttemptId =
      payoutAttemptIdForSettlement(
        settlementId,
        1,
      );

    const result =
      failProviderSettlementPayout({
        settlement: {
          schemaVersion: 1,
          settlementId,
          earningId:
            "payment_12345678",
          paymentId:
            "payment_12345678",
          providerRequestId:
            "provider_request_12345678",
          mainEventId:
            "main_event_12345678",
          providerId:
            "provider_12345678",
          customerId:
            "customer_12345678",
          currency:
            "PHP",
          originalEarningAmountInCentavos:
            90000,
          reversedAmountInCentavos:
            0,
          netSettlementAmountInCentavos:
            90000,
          reservedAmountInCentavos:
            90000,
          paidOutAmountInCentavos:
            0,
          status:
            "processing",
          activePayoutAttemptId:
            payoutAttemptId,
          lastPayoutAttemptId:
            payoutAttemptId,
          reconciliationRequired:
            false,
          reconciliationReason:
            null,
          createdAt:
            "created",
          updatedAt:
            "updated",
          paidOutAt:
            null,
        },

        earning: earning({
          pendingAmountInCentavos:
            0,
          availableAmountInCentavos:
            90000,
        }),

        payoutAttempt: {
          schemaVersion: 1,
          payoutAttemptId,
          settlementId,
          earningId:
            "payment_12345678",
          providerId:
            "provider_12345678",
          currency:
            "PHP",
          amountInCentavos:
            90000,
          status:
            "processing",
          gateway:
            "paymongo",
          gatewayResourceId:
            null,
          failureCode:
            null,
          failureMessage:
            null,
          createdAt:
            "created",
          updatedAt:
            "updated",
          submittedAt:
            "submitted",
          completedAt:
            null,
        },

        certainty:
          "failed",
        failureCode:
          "gateway_rejected",
        failureMessage:
          "Rejected",
        timestamp:
          "failed",
      });

    assert.equal(
      result.settlementUpdate.status,
      "ready",
    );

    assert.equal(
      result.settlementUpdate
        .reservedAmountInCentavos,
      0,
    );

    assert.equal(
      result.earningUpdate
        .availableAmountInCentavos,
      undefined,
    );

    assert.equal(
      result.earningUpdate
        .pendingAmountInCentavos,
      undefined,
    );
  },
);
test(
  "ambiguous payout outcome requires reconciliation and keeps reservation",
  () => {
    const settlementId =
      settlementIdForEarning(
        "payment_12345678",
      );

    const payoutAttemptId =
      payoutAttemptIdForSettlement(
        settlementId,
        1,
      );

    const result =
      failProviderSettlementPayout({
        settlement: {
          schemaVersion: 1,
          settlementId,
          earningId:
            "payment_12345678",
          paymentId:
            "payment_12345678",
          providerRequestId:
            "provider_request_12345678",
          mainEventId:
            "main_event_12345678",
          providerId:
            "provider_12345678",
          customerId:
            "customer_12345678",
          currency: "PHP",
          originalEarningAmountInCentavos:
            90000,
          reversedAmountInCentavos: 0,
          netSettlementAmountInCentavos:
            90000,
          reservedAmountInCentavos:
            90000,
          paidOutAmountInCentavos: 0,
          status: "processing",
          activePayoutAttemptId:
            payoutAttemptId,
          lastPayoutAttemptId:
            payoutAttemptId,
          reconciliationRequired: false,
          reconciliationReason: null,
          createdAt: "created",
          updatedAt: "updated",
          paidOutAt: null,
        },

        earning: earning({
          pendingAmountInCentavos:
            90000,
          availableAmountInCentavos: 0,
        }),

        payoutAttempt: {
          schemaVersion: 1,
          payoutAttemptId,
          settlementId,
          earningId:
            "payment_12345678",
          providerId:
            "provider_12345678",
          currency: "PHP",
          amountInCentavos: 90000,
          status: "processing",
          gateway: "paymongo",
          gatewayResourceId: null,
          failureCode: null,
          failureMessage: null,
          createdAt: "created",
          updatedAt: "updated",
          submittedAt: "submitted",
          completedAt: null,
        },

        certainty: "ambiguous",
        failureCode: "timeout",
        failureMessage:
          "Gateway result unknown",
        timestamp: "ambiguous",
      });

    assert.equal(
      result.settlementUpdate.status,
      "reconciliation_required",
    );

    assert.equal(
      result.settlementUpdate
        .reservedAmountInCentavos,
      undefined,
    );

    assert.equal(
      result.earningUpdate
        .availableAmountInCentavos,
      undefined,
    );

    assert.equal(
      result.payoutAttemptUpdate.status,
      "ambiguous",
    );
  },
);

test(
  "earning buckets must reconcile before settlement",
  () => {
    assert.throws(
      () =>
        buildProviderSettlementPlan({
          earningId:
            "payment_12345678",

          earning: earning({
            pendingAmountInCentavos:
              80000,
          }),

          timestamp: "now",
        }),
      /buckets do not reconcile/u,
    );
  },
);
test(
  "completion releases pending earning into available settlement",
  () => {
    const plan =
      buildProviderSettlementPlan({
        earningId:
          "payment_12345678",

        earning: earning(),

        timestamp: "created",
      });

    const released =
      releaseProviderSettlementAvailability({
        settlement:
          plan.settlementRecord,

        earning: earning(),

        timestamp: "completed",
      });

    assert.equal(
      released.settlementUpdate.status,
      "ready",
    );

    assert.equal(
      released.earningUpdate.status,
      "available",
    );

    assert.equal(
      released.earningUpdate
        .pendingAmountInCentavos,
      0,
    );

    assert.equal(
      released.earningUpdate
        .availableAmountInCentavos,
      90000,
    );
  },
);

test(
  "refund-adjusted pending earning releases only its net amount",
  () => {
    const original =
      earning({
        pendingAmountInCentavos:
          70000,

        reversedAmountInCentavos:
          20000,
      });

    const settlement =
      buildProviderSettlementPlan({
        earningId:
          "payment_12345678",

        earning:
          original,

        timestamp: "created",
      }).settlementRecord;

    const released =
      releaseProviderSettlementAvailability({
        settlement,

        earning:
          original,

        timestamp: "completed",
      });

    assert.equal(
      released.settlementUpdate
        .reversedAmountInCentavos,
      20000,
    );

    assert.equal(
      released.settlementUpdate
        .netSettlementAmountInCentavos,
      70000,
    );

    assert.equal(
      released.earningUpdate
        .availableAmountInCentavos,
      70000,
    );
  },
);

test(
  "availability release never creates Provider paid-out money",
  () => {
    const plan =
      buildProviderSettlementPlan({
        earningId:
          "payment_12345678",

        earning: earning(),

        timestamp: "created",
      });

    const released =
      releaseProviderSettlementAvailability({
        settlement:
          plan.settlementRecord,

        earning: earning(),

        timestamp: "completed",
      });

    assert.equal(
      released.settlementUpdate
        .paidOutAmountInCentavos,
      undefined,
    );

    assert.equal(
      released.earningUpdate
        .paidAmountInCentavos,
      undefined,
    );
  },
);

test(
  "refund dispatch is blocked while payout is reserved",
  () => {
    assert.throws(
      () =>
        assertProviderSettlementRefundDispatchAllowed({
          settlement: {
            schemaVersion: 1,
            settlementId:
              settlementIdForEarning(
                "payment_12345678",
              ),
            earningId:
              "payment_12345678",
            paymentId:
              "payment_12345678",
            providerRequestId:
              "provider_request_12345678",
            mainEventId:
              "main_event_12345678",
            providerId:
              "provider_12345678",
            customerId:
              "customer_12345678",
            currency:
              "PHP",
            originalEarningAmountInCentavos:
              90000,
            reversedAmountInCentavos:
              0,
            netSettlementAmountInCentavos:
              90000,
            reservedAmountInCentavos:
              90000,
            paidOutAmountInCentavos:
              0,
            status:
              "reserved",
            activePayoutAttemptId:
              "payout_attempt_12345678",
            lastPayoutAttemptId:
              "payout_attempt_12345678",
            reconciliationRequired:
              false,
            reconciliationReason:
              null,
            createdAt:
              "created",
            updatedAt:
              "updated",
            paidOutAt:
              null,
          },

          earningId:
            "payment_12345678",

          paymentId:
            "payment_12345678",
        }),
      /reconciliation/u,
    );
  },
);

test(
  "ready settlement follows refund-adjusted available earning",
  () => {
    const update =
      buildProviderSettlementRefundUpdate({
        settlement: {
          schemaVersion: 1,
          settlementId:
            settlementIdForEarning(
              "payment_12345678",
            ),
          earningId:
            "payment_12345678",
          paymentId:
            "payment_12345678",
          providerRequestId:
            "provider_request_12345678",
          mainEventId:
            "main_event_12345678",
          providerId:
            "provider_12345678",
          customerId:
            "customer_12345678",
          currency:
            "PHP",
          originalEarningAmountInCentavos:
            90000,
          reversedAmountInCentavos:
            0,
          netSettlementAmountInCentavos:
            90000,
          reservedAmountInCentavos:
            0,
          paidOutAmountInCentavos:
            0,
          status:
            "ready",
          activePayoutAttemptId:
            null,
          lastPayoutAttemptId:
            null,
          reconciliationRequired:
            false,
          reconciliationReason:
            null,
          createdAt:
            "created",
          updatedAt:
            "updated",
          paidOutAt:
            null,
        },

        earningId:
          "payment_12345678",

        paymentId:
          "payment_12345678",

        earningUpdate: {
          pendingAmountInCentavos:
            0,
          availableAmountInCentavos:
            70000,
          paidAmountInCentavos:
            0,
          reversedAmountInCentavos:
            20000,
          netEarningAmountInCentavos:
            70000,
        },

        timestamp:
          "refunded",
      });

    assert.equal(
      update.status,
      "ready",
    );

    assert.equal(
      update.reversedAmountInCentavos,
      20000,
    );

    assert.equal(
      update.netSettlementAmountInCentavos,
      70000,
    );
  },
);

test(
  "fully reversed Provider earning cancels unpaid settlement",
  () => {
    const update =
      buildProviderSettlementRefundUpdate({
        settlement: {
          schemaVersion: 1,
          settlementId:
            settlementIdForEarning(
              "payment_12345678",
            ),
          earningId:
            "payment_12345678",
          paymentId:
            "payment_12345678",
          providerRequestId:
            "provider_request_12345678",
          mainEventId:
            "main_event_12345678",
          providerId:
            "provider_12345678",
          customerId:
            "customer_12345678",
          currency:
            "PHP",
          originalEarningAmountInCentavos:
            90000,
          reversedAmountInCentavos:
            0,
          netSettlementAmountInCentavos:
            90000,
          reservedAmountInCentavos:
            0,
          paidOutAmountInCentavos:
            0,
          status:
            "ready",
          activePayoutAttemptId:
            null,
          lastPayoutAttemptId:
            null,
          reconciliationRequired:
            false,
          reconciliationReason:
            null,
          createdAt:
            "created",
          updatedAt:
            "updated",
          paidOutAt:
            null,
        },

        earningId:
          "payment_12345678",

        paymentId:
          "payment_12345678",

        earningUpdate: {
          pendingAmountInCentavos:
            0,
          availableAmountInCentavos:
            0,
          paidAmountInCentavos:
            0,
          reversedAmountInCentavos:
            90000,
          netEarningAmountInCentavos:
            0,
        },

        timestamp:
          "refunded",
      });

    assert.equal(
      update.status,
      "cancelled",
    );

    assert.equal(
      update.netSettlementAmountInCentavos,
      0,
    );
  },
);