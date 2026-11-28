const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {initializeApp, getApps} = require("firebase-admin/app");

if (!getApps().length) {
  initializeApp({projectId: "demo-feasta"});
}

const {
  PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1,
  PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1,
  isDirectProviderSplitRouting,
  parsePaymentSettlementRoutingMode,
} = require(path.resolve(
  __dirname,
  "../lib/payments/platform-commission-policy.js",
));

const {
  buildProviderRequestFinancialSnapshot,
} = require(path.resolve(
  __dirname,
  "../lib/provider-requests/provider-request-financial-snapshot.js",
));

const {
  buildSuccessfulPaymentFinancialLedgerPlan,
  buildSuccessfulRefundFinancialLedgerPlan,
} = require(path.resolve(
  __dirname,
  "../lib/payments/financial-ledger.js",
));

const {
  buildProviderEarningRefundPlan,
  buildSuccessfulPaymentProviderEarningPlan,
} = require(path.resolve(
  __dirname,
  "../lib/provider-finance/provider-earning-domain.js",
));

const {
  assertProviderSettlementRefundDispatchAllowed,
  buildProviderSettlementPlan,
  buildProviderSettlementRefundUpdate,
  reserveProviderSettlementPayout,
} = require(path.resolve(
  __dirname,
  "../lib/provider-finance/provider-settlement-domain.js",
));

const {
  scheduleCompletedProviderRequestDisbursementInTransaction,
} = require(path.resolve(
  __dirname,
  "../lib/provider-finance/provider-disbursement-management.js",
));

const {
  providerNotificationMessageForPaymentLifecycle,
} = require(path.resolve(
  __dirname,
  "../lib/payments/payment-lifecycle-messaging.js",
));

function directSplitRequest(overrides = {}) {
  const snapshot = buildProviderRequestFinancialSnapshot({
    providerId: "provider_direct_1",
    providerOwnerId: "owner_direct_1",
    providerRequest: {
      amount: 1002,
      downPaymentAmount: 1002,
      remainingBalance: 0,
      platformCommissionModel: PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1,
      platformCommissionRateBps: 20,
      serviceSubtotalInCentavos: 100000,
      platformFeeInCentavos: 200,
    },
    platformSettings: {
      platformCommissionRateBps: 20,
      platformTaxStatus: "vat_registered",
      platformVatRateBps: 1200,
      financialPolicyVersion: 2,
    },
    providerTaxProfile: {
      providerId: "provider_direct_1",
      ownerId: "owner_direct_1",
      taxType: "vat_registered",
      verificationStatus: "verified",
    },
  });

  return {
    providerRequestId: "request_direct_1",
    mainEventId: "event_direct_1",
    providerId: "provider_direct_1",
    customerId: "customer_direct_1",
    amount: 1002,
    downPaymentAmount: 1002,
    remainingBalance: 0,
    platformCommissionModel: PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1,
    platformCommissionRateBps: 20,
    serviceSubtotalInCentavos: 100000,
    platformFeeInCentavos: 200,
    settlementSchemaVersion: 1,
    settlementStatus: "fully_settled",
    initialPaymentChoice: "full",
    initialPaymentId: "pay_direct_1",
    grossSettledAmountInCentavos: 100200,
    outstandingAmountInCentavos: 0,
    financialSnapshot: snapshot,
    ...overrides,
  };
}

test("settlement routing parser accepts direct_provider_split_v1 and platform_escrow_v1", () => {
  assert.equal(
    parsePaymentSettlementRoutingMode("direct_provider_split_v1"),
    PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1,
  );
  assert.equal(
    parsePaymentSettlementRoutingMode("platform_escrow_v1"),
    "platform_escrow_v1",
  );
  assert.equal(parsePaymentSettlementRoutingMode("unknown"), null);
  assert.equal(isDirectProviderSplitRouting("direct_provider_split_v1"), true);
  assert.equal(isDirectProviderSplitRouting("platform_escrow_v1"), false);
  assert.equal(isDirectProviderSplitRouting(undefined), false);
});

test("customer_paid_flat_v1 financial snapshot stamps direct_provider_split_v1 while legacy omits it", () => {
  const direct = directSplitRequest().financialSnapshot;
  assert.equal(
    direct.settlementRoutingMode,
    PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1,
  );
  assert.equal(direct.serviceSubtotalInCentavos, 100000);
  assert.equal(direct.platformCommissionTotalInCentavos, 200);
  assert.equal(direct.grossAmountInCentavos, 100200);

  const legacy = buildProviderRequestFinancialSnapshot({
    providerId: "provider_legacy_1",
    providerOwnerId: "owner_legacy_1",
    providerRequest: {
      amount: 1000,
      downPaymentAmount: 1000,
      remainingBalance: 0,
    },
    platformSettings: {
      platformCommissionRateBps: 200,
      platformTaxStatus: "non_vat",
      platformVatRateBps: 1200,
      financialPolicyVersion: 1,
    },
    providerTaxProfile: null,
  });
  assert.equal(legacy.settlementRoutingMode, undefined);
  assert.equal(legacy.platformCommissionModel, "tiered_capped_2pct_v1");
});

test("direct-split payment immediately marks provider earning and settlement as paid with 0-day hold", () => {
  const request = directSplitRequest({
    grossSettledAmountInCentavos: 0,
    outstandingAmountInCentavos: 100200,
  });
  const timestamp = {kind: "paid_at"};

  const ledgerPlan = buildSuccessfulPaymentFinancialLedgerPlan({
    paymentId: "pay_direct_1",
    mainEventId: request.mainEventId,
    providerRequestId: request.providerRequestId,
    providerId: request.providerId,
    customerId: request.customerId,
    paymentChoice: "full",
    paymentAmountInCentavos: 100200,
    providerRequest: request,
    webhookEventId: "evt_direct_1",
    timestamp,
  });

  const earningPlan = buildSuccessfulPaymentProviderEarningPlan({
    paymentId: "pay_direct_1",
    mainEventId: request.mainEventId,
    providerRequestId: request.providerRequestId,
    providerId: request.providerId,
    customerId: request.customerId,
    financialLedgerRecord: ledgerPlan.ledgerRecord,
    settlementRoutingMode: request.financialSnapshot.settlementRoutingMode,
    timestamp,
  });

  assert.equal(earningPlan.earningRecord.status, "paid");
  assert.equal(
    earningPlan.earningRecord.settlementRoutingMode,
    PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1,
  );
  assert.equal(earningPlan.earningRecord.earningAmountInCentavos, 100000);
  assert.equal(earningPlan.earningRecord.pendingAmountInCentavos, 0);
  assert.equal(earningPlan.earningRecord.availableAmountInCentavos, 0);
  assert.equal(earningPlan.earningRecord.paidAmountInCentavos, 100000);
  assert.equal(earningPlan.earningRecord.providerRefundClawbackInCentavos, 0);
  assert.deepEqual(earningPlan.earningRecord.directSettledAt, timestamp);
  assert.equal(earningPlan.paymentUpdate.providerEarningStatus, "paid");
  assert.equal(
    earningPlan.paymentUpdate.settlementRoutingMode,
    PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1,
  );

  const settlementPlan = buildProviderSettlementPlan({
    earningId: earningPlan.earningId,
    earning: earningPlan.earningRecord,
    timestamp,
  });

  assert.equal(settlementPlan.settlementRecord.status, "paid");
  assert.equal(
    settlementPlan.settlementRecord.settlementRoutingMode,
    PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1,
  );
  assert.equal(settlementPlan.settlementRecord.paidOutAmountInCentavos, 100000);
  assert.equal(settlementPlan.settlementRecord.netSettlementAmountInCentavos, 100000);
  assert.equal(settlementPlan.settlementRecord.reconciliationRequired, false);
  assert.equal(settlementPlan.settlementRecord.reconciliationReason, null);
  assert.deepEqual(settlementPlan.settlementRecord.paidOutAt, timestamp);

  // Platform payout reservation is explicitly rejected for direct-split settlements.
  assert.throws(
    () =>
      reserveProviderSettlementPayout({
        settlement: settlementPlan.settlementRecord,
        earning: earningPlan.earningRecord,
        attemptSequence: 1,
        timestamp: {kind: "reserve"},
      }),
    /Direct-split Provider settlements do not use platform payout reservations/u,
  );
});

test("direct-split 100% and 50% automatic refunds reverse paid shares cleanly while legacy escrow paid earnings still block", () => {
  const requestBeforePay = directSplitRequest({
    grossSettledAmountInCentavos: 0,
    outstandingAmountInCentavos: 100200,
  });

  const payLedger = buildSuccessfulPaymentFinancialLedgerPlan({
    paymentId: "pay_direct_1",
    mainEventId: requestBeforePay.mainEventId,
    providerRequestId: requestBeforePay.providerRequestId,
    providerId: requestBeforePay.providerId,
    customerId: requestBeforePay.customerId,
    paymentChoice: "full",
    paymentAmountInCentavos: 100200,
    providerRequest: requestBeforePay,
    webhookEventId: "evt_direct_1",
    timestamp: {kind: "paid"},
  });

  const earningPlan = buildSuccessfulPaymentProviderEarningPlan({
    paymentId: "pay_direct_1",
    mainEventId: requestBeforePay.mainEventId,
    providerRequestId: requestBeforePay.providerRequestId,
    providerId: requestBeforePay.providerId,
    customerId: requestBeforePay.customerId,
    financialLedgerRecord: payLedger.ledgerRecord,
    settlementRoutingMode: PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1,
    timestamp: {kind: "paid"},
  });

  const settlementPlan = buildProviderSettlementPlan({
    earningId: earningPlan.earningId,
    earning: earningPlan.earningRecord,
    timestamp: {kind: "paid"},
  });

  // Refund dispatch gate permits direct_provider_split_v1 even though status is "paid".
  assert.doesNotThrow(() =>
    assertProviderSettlementRefundDispatchAllowed({
      settlement: settlementPlan.settlementRecord,
      earningId: earningPlan.earningId,
      paymentId: "pay_direct_1",
    }),
  );

  const paidPayment = {
    paymentId: "pay_direct_1",
    amountInCentavos: 100200,
    currency: "PHP",
    ...payLedger.paymentUpdate,
    ...earningPlan.paymentUpdate,
  };

  const settledRequest = {
    ...requestBeforePay,
    grossSettledAmountInCentavos: 100200,
    outstandingAmountInCentavos: 0,
    ...payLedger.providerRequestUpdate,
  };

  // 50% partial refund (₱501.00 = ₱500.00 provider + ₱1.00 FEASTA fee)
  const partialRefundLedger = buildSuccessfulRefundFinancialLedgerPlan({
    paymentId: "pay_direct_1",
    refundOperationId: "ref_partial_50",
    mainEventId: settledRequest.mainEventId,
    providerRequestId: settledRequest.providerRequestId,
    providerId: settledRequest.providerId,
    customerId: settledRequest.customerId,
    refundAmountInCentavos: 50100,
    refundedBeforeInCentavos: 0,
    payment: paidPayment,
    providerRequest: settledRequest,
    source: "paymongo_webhook",
    webhookEventId: "evt_ref_50",
    timestamp: {kind: "refund_50"},
  });

  assert.equal(partialRefundLedger.ledgerRecord.commissionReversedInCentavos, 100);

  const partialEarningPlan = buildProviderEarningRefundPlan({
    paymentId: "pay_direct_1",
    earningId: earningPlan.earningId,
    earning: earningPlan.earningRecord,
    refundFinancialLedgerRecord: partialRefundLedger.ledgerRecord,
    timestamp: {kind: "refund_50"},
  });

  assert.equal(partialEarningPlan.earningUpdate.status, "paid");
  assert.equal(partialEarningPlan.earningUpdate.pendingAmountInCentavos, 0);
  assert.equal(partialEarningPlan.earningUpdate.availableAmountInCentavos, 0);
  assert.equal(partialEarningPlan.earningUpdate.paidAmountInCentavos, 50000);
  assert.equal(partialEarningPlan.earningUpdate.reversedAmountInCentavos, 50000);
  assert.equal(partialEarningPlan.earningUpdate.providerRefundClawbackInCentavos, 50000);
  assert.equal(partialEarningPlan.earningUpdate.netEarningAmountInCentavos, 50000);

  const partialSettlementUpdate = buildProviderSettlementRefundUpdate({
    settlement: settlementPlan.settlementRecord,
    earningId: earningPlan.earningId,
    paymentId: "pay_direct_1",
    earningUpdate: partialEarningPlan.earningUpdate,
    timestamp: {kind: "refund_50"},
  });

  assert.equal(partialSettlementUpdate.status, "paid");
  assert.equal(partialSettlementUpdate.paidOutAmountInCentavos, 50000);
  assert.equal(partialSettlementUpdate.reversedAmountInCentavos, 50000);
  assert.equal(partialSettlementUpdate.netSettlementAmountInCentavos, 50000);
  assert.equal(partialSettlementUpdate.providerRefundClawbackInCentavos, 50000);

  // 100% full refund (₱1,002.00 = ₱1,000.00 provider + ₱2.00 FEASTA fee)
  const fullRefundLedger = buildSuccessfulRefundFinancialLedgerPlan({
    paymentId: "pay_direct_1",
    refundOperationId: "ref_full_100",
    mainEventId: settledRequest.mainEventId,
    providerRequestId: settledRequest.providerRequestId,
    providerId: settledRequest.providerId,
    customerId: settledRequest.customerId,
    refundAmountInCentavos: 100200,
    refundedBeforeInCentavos: 0,
    payment: paidPayment,
    providerRequest: settledRequest,
    source: "paymongo_webhook",
    webhookEventId: "evt_ref_100",
    timestamp: {kind: "refund_100"},
  });

  assert.equal(fullRefundLedger.ledgerRecord.commissionReversedInCentavos, 200);

  const fullEarningPlan = buildProviderEarningRefundPlan({
    paymentId: "pay_direct_1",
    earningId: earningPlan.earningId,
    earning: earningPlan.earningRecord,
    refundFinancialLedgerRecord: fullRefundLedger.ledgerRecord,
    timestamp: {kind: "refund_100"},
  });

  assert.equal(fullEarningPlan.earningUpdate.status, "reversed");
  assert.equal(fullEarningPlan.earningUpdate.paidAmountInCentavos, 0);
  assert.equal(fullEarningPlan.earningUpdate.reversedAmountInCentavos, 100000);
  assert.equal(fullEarningPlan.earningUpdate.providerRefundClawbackInCentavos, 100000);
  assert.equal(fullEarningPlan.earningUpdate.netEarningAmountInCentavos, 0);

  const fullSettlementUpdate = buildProviderSettlementRefundUpdate({
    settlement: settlementPlan.settlementRecord,
    earningId: earningPlan.earningId,
    paymentId: "pay_direct_1",
    earningUpdate: fullEarningPlan.earningUpdate,
    timestamp: {kind: "refund_100"},
  });

  assert.equal(fullSettlementUpdate.status, "cancelled");
  assert.equal(fullSettlementUpdate.paidOutAmountInCentavos, 0);
  assert.equal(fullSettlementUpdate.reversedAmountInCentavos, 100000);
  assert.equal(fullSettlementUpdate.netSettlementAmountInCentavos, 0);
  assert.equal(fullSettlementUpdate.providerRefundClawbackInCentavos, 100000);

  // Legacy escrow paid earning & settlement MUST remain strictly blocked for reconciliation.
  const legacyPaidEarning = {
    ...earningPlan.earningRecord,
    settlementRoutingMode: undefined,
  };
  assert.throws(
    () =>
      buildProviderEarningRefundPlan({
        paymentId: "pay_direct_1",
        earningId: earningPlan.earningId,
        earning: legacyPaidEarning,
        refundFinancialLedgerRecord: fullRefundLedger.ledgerRecord,
        timestamp: {kind: "refund_legacy"},
      }),
    /requires payout reconciliation/u,
  );

  const legacyPaidSettlement = {
    ...settlementPlan.settlementRecord,
    settlementRoutingMode: undefined,
  };
  assert.throws(
    () =>
      assertProviderSettlementRefundDispatchAllowed({
        settlement: legacyPaidSettlement,
        earningId: earningPlan.earningId,
        paymentId: "pay_direct_1",
      }),
    /requires reconciliation/u,
  );
});

test("booking completion skips 3-banking-day providerDisbursements hold for direct_provider_split_v1", () => {
  const writes = [];
  const fakeTransaction = {
    create: (ref, data) => writes.push({ref, data}),
  };

  const directRequest = directSplitRequest();
  const directDisbursementId =
    scheduleCompletedProviderRequestDisbursementInTransaction({
      transaction: fakeTransaction,
      providerRequestId: directRequest.providerRequestId,
      providerRequest: directRequest,
      mainEventId: directRequest.mainEventId,
      providerId: directRequest.providerId,
      customerId: directRequest.customerId,
      completedAt: new Date("2026-11-26T10:00:00+08:00"),
      platformSettings: {},
      timestamp: {kind: "completed"},
    });

  assert.equal(directDisbursementId, null);
  assert.equal(writes.length, 0);

  // Historical escrow booking (no settlementRoutingMode) still schedules its 3-day hold.
  const legacyRequest = directSplitRequest({
    providerRequestId: "request_legacy_hold_1",
    financialSnapshot: {
      ...directRequest.financialSnapshot,
      settlementRoutingMode: undefined,
    },
  });
  const legacyDisbursementId =
    scheduleCompletedProviderRequestDisbursementInTransaction({
      transaction: fakeTransaction,
      providerRequestId: legacyRequest.providerRequestId,
      providerRequest: legacyRequest,
      mainEventId: legacyRequest.mainEventId,
      providerId: legacyRequest.providerId,
      customerId: legacyRequest.customerId,
      completedAt: new Date("2026-11-26T10:00:00+08:00"),
      platformSettings: {},
      timestamp: {kind: "completed"},
    });

  assert.ok(legacyDisbursementId);
  assert.equal(writes.length, 1);
});

test("direct-split provider payment notification states direct routing to payout account", () => {
  assert.match(
    providerNotificationMessageForPaymentLifecycle("paid", "full", {
      directProviderSplit: true,
    }),
    /routed directly to your payout account/u,
  );

  assert.equal(
    providerNotificationMessageForPaymentLifecycle("paid", "full"),
    "The customer's full payment was confirmed.",
  );
});

test("backend wiring guards direct-split checkout metadata, webhook commission-only credit, completion no-op, and advance rejection", () => {
  const createSessionSource = fs.readFileSync(
    path.resolve(__dirname, "../src/payments/create-payment-session.ts"),
    "utf8",
  );
  assert.match(createSessionSource, /feasta_settlement_routing/u);
  assert.match(createSessionSource, /feasta_provider_share_centavos/u);
  assert.match(createSessionSource, /feasta_platform_fee_centavos/u);
  assert.match(createSessionSource, /feasta_provider_id/u);

  const webhookSource = fs.readFileSync(
    path.resolve(__dirname, "../src/payments/process-webhook.ts"),
    "utf8",
  );
  assert.match(webhookSource, /settlementRoutingMode/u);
  assert.match(webhookSource, /if \(directProviderSplit\)/u);
  assert.match(webhookSource, /applyCompanyFloatCommissionCreditInTransaction/u);

  const settlementManagementSource = fs.readFileSync(
    path.resolve(__dirname, "../src/provider-finance/provider-settlement-management.ts"),
    "utf8",
  );
  assert.match(
    settlementManagementSource,
    /isDirectProviderSplitRouting\(\s*record\.earning\.settlementRoutingMode/u,
  );

  const advanceSource = fs.readFileSync(
    path.resolve(__dirname, "../src/provider-finance/company-provider-advance.ts"),
    "utf8",
  );
  assert.match(advanceSource, /isDirectProviderSplitRouting/u);
  assert.match(advanceSource, /Immediate funding is not needed for direct-routed bookings/u);
});
