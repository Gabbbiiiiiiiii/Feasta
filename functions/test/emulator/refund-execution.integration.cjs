const assert = require("node:assert/strict");
const path = require("node:path");
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

const projectId = process.env.GCLOUD_PROJECT ??
  "demo-feasta-refund-execution";
const app = initializeApp({projectId});
const db = getFirestore(app);
const libRoot = process.env.FEASTA_FUNCTIONS_LIB_DIR ??
  path.resolve(__dirname, "../../lib");

(async () => {
  const execution = require(path.join(
    libRoot,
    "refunds/refund-execution.js",
  ));
  const webhook = require(path.join(
    libRoot,
    "payments/process-webhook.js",
  ));
  const {paymentIdForProviderRequest} = require(path.join(
    libRoot,
    "payments/payment-lifecycle.js",
  ));

  try {
    await positiveApprovalAndWebhook(
      execution,
      webhook,
      paymentIdForProviderRequest,
    );
    await zeroRefundApproval(execution, paymentIdForProviderRequest);
    await rejectionHistory(execution, paymentIdForProviderRequest);
    await decisionConcurrency(execution, paymentIdForProviderRequest);
    await failureAndRetry(execution, paymentIdForProviderRequest);
    await gatewayMismatchFailsClosed(execution, paymentIdForProviderRequest);
    await legacyEarlyWebhook(webhook, paymentIdForProviderRequest);
    console.log("Refund execution B6 integration passed.");
  } finally {
    await deleteApp(app);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function positiveApprovalAndWebhook(
  execution,
  webhook,
  paymentIdForProviderRequest,
) {
  const seeded = await seed(paymentIdForProviderRequest, "positive", {
    rate: 5_000,
    siblingStatus: "confirmed",
  });
  const approved = await execution.approveCancellation({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  assert.equal(approved.refundAmountInCentavos, 50_000);
  assert.equal(approved.cancellationStatus, "approved");
  assert.equal(approved.providerRequestStatus, "cancelled");
  assert.equal(approved.mainEventStatus, "confirmed");

  const request = await data(`providerRequests/${seeded.providerRequestId}`);
  assert.equal(request.status, "cancelled");
  assert.equal(request.approvedCancellationRequestId,
    seeded.cancellationRequestId);
  assert.equal(request.refundEligibilityState.activeCancellationRequestId,
    null);
  const siblingBefore = await data(
    `providerRequests/${seeded.siblingProviderRequestId}`,
  );
  assert.equal(siblingBefore.status, "confirmed");

  const paymentAfterApproval = await data(`payments/${seeded.paymentId}`);
  assert.equal(paymentAfterApproval.refundReservedAmountInCentavos, 50_000);
  assert.equal(paymentAfterApproval.refundedAmountInCentavos, 0);
  const replay = await execution.approveCancellation({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  assert.equal(replay.refundOperationId, approved.refundOperationId);
  assert.equal((await refunds(seeded.paymentId)).size, 1);

  const prepared = await execution.prepareRefundExecution({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  assert.equal(prepared.amountInCentavos, 50_000);
  assert.equal(prepared.gatewayPaymentId, seeded.gatewayPaymentId);
  assert.equal(prepared.gatewayExecutionKey,
    `feasta-policy-${approved.refundOperationId}`);
  const processingOperation = await data(
    `payments/${seeded.paymentId}/refunds/${approved.refundOperationId}`,
  );
  assert.equal(processingOperation.status, "processing");
  assert.equal(processingOperation.executionAttemptCount, 1);

  const raw = refundWebhook({
    eventId: "event-b6-positive",
    paymentId: seeded.paymentId,
    operationId: approved.refundOperationId,
    gatewayPaymentId: seeded.gatewayPaymentId,
    amount: 50_000,
    status: "succeeded",
  });
  const completed = await webhook.processPayMongoWebhook(raw);
  assert.deepEqual(completed, {duplicate: false, applied: true});

  const lateApiResponse = await execution.reconcileGatewayRefund({
    paymentId: seeded.paymentId,
    refundOperationId: approved.refundOperationId,
    refund: {
      id: "refund-b6-gateway",
      amountInCentavos: 50_000,
      currency: "PHP",
      gatewayPaymentId: seeded.gatewayPaymentId,
      status: "processing",
      metadata: {
        feasta_payment_id: seeded.paymentId,
        feasta_refund_operation_id: approved.refundOperationId,
      },
    },
    actorId: "admin-b6",
    source: "refund_execution_response",
  });
  assert.deepEqual(lateApiResponse, {status: "completed", replayed: true});

  const duplicate = await webhook.processPayMongoWebhook(raw);
  assert.deepEqual(duplicate, {duplicate: true, applied: false});
  await assert.rejects(() => webhook.processPayMongoWebhook(refundWebhook({
    eventId: "event-b6-positive",
    paymentId: seeded.paymentId,
    operationId: approved.refundOperationId,
    gatewayPaymentId: seeded.gatewayPaymentId,
    amount: 50_000,
    status: "processing",
  })), reason("REFUND_WEBHOOK_MISMATCH"));

  const finalPayment = await data(`payments/${seeded.paymentId}`);
  assert.equal(finalPayment.status, "partially_refunded");
  assert.equal(finalPayment.refundedAmountInCentavos, 50_000);
  assert.equal(finalPayment.refundReservedAmountInCentavos, 0);
  const finalOperation = await data(
    `payments/${seeded.paymentId}/refunds/${approved.refundOperationId}`,
  );
  assert.equal(finalOperation.status, "completed");
  assert.equal(finalOperation.gatewayRefundId, "refund-b6-gateway");
  assert.equal((await data(
    `providerRequestCancellationRequests/${seeded.cancellationRequestId}`,
  )).status, "refund_completed");
  assert.equal((await data(
    `providerRequests/${seeded.providerRequestId}`,
  )).status, "cancelled");
  assert.deepEqual(await data(
    `providerRequests/${seeded.siblingProviderRequestId}`,
  ), siblingBefore);
  const timelineTypes = (await db.collection(
    `mainEvents/${seeded.mainEventId}/timeline`,
  ).get()).docs.map((document) => document.data().type);
  assert.ok(timelineTypes.includes("cancellation_approved"));
  assert.ok(timelineTypes.includes("refund_processing"));
  assert.ok(timelineTypes.includes("refund_completed"));
  const auditActions = (await db.collection("adminLogs").get()).docs
    .map((document) => document.data().action);
  assert.ok(auditActions.includes("cancellation_request.approved"));
  assert.ok(auditActions.includes("refund_execution.started"));
  assert.ok(auditActions.includes("refund_webhook.reconciled"));
  assert.ok((await db.collection("notifications").get()).size >= 4);
}

async function zeroRefundApproval(execution, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "zero", {
    rate: 0,
    stage: "service_started",
    sequence: 2,
  });
  const result = await execution.approveCancellation({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  assert.equal(result.cancellationStatus, "cancelled_no_refund");
  assert.equal(result.refundAmountInCentavos, 0);
  assert.equal(result.refundOperationId, null);
  assert.equal((await refunds(seeded.paymentId)).size, 0);
  assert.equal((await data(`providerRequests/${seeded.providerRequestId}`))
    .status, "cancelled");
  assert.equal((await data(`mainEvents/${seeded.mainEventId}`)).status,
    "cancelled");
}

async function rejectionHistory(execution, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "rejected", {
    cancellationStatus: "under_review",
  });
  await execution.rejectCancellation({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
    reason: "Evidence does not support cancellation approval.",
  });
  const rejected = await data(
    `providerRequestCancellationRequests/${seeded.cancellationRequestId}`,
  );
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.decision.outcome, "rejected");
  assert.equal((await data(`providerRequests/${seeded.providerRequestId}`))
    .status, "confirmed");

  const secondId = `${seeded.cancellationRequestId}-second`;
  await db.doc(`providerRequestCancellationRequests/${secondId}`).set({
    ...rejected,
    status: "submitted",
    decision: null,
    reason: "Later independent cancellation attempt.",
    submittedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  const requestReference = db.doc(
    `providerRequests/${seeded.providerRequestId}`,
  );
  const current = (await requestReference.get()).data();
  await requestReference.update({
    refundEligibilityState: {
      ...current.refundEligibilityState,
      activeCancellationRequestId: secondId,
    },
  });
  await execution.rejectCancellation({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
    reason: "Evidence does not support cancellation approval.",
  });
  assert.equal((await data(`providerRequests/${seeded.providerRequestId}`))
    .refundEligibilityState.activeCancellationRequestId, secondId);
  assert.equal((await data(
    `providerRequestCancellationRequests/${seeded.cancellationRequestId}`,
  )).status, "rejected");
}

async function decisionConcurrency(execution, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "decision-race");
  const outcomes = await Promise.allSettled([
    execution.approveCancellation({
      cancellationRequestId: seeded.cancellationRequestId,
      actorId: "admin-approve",
    }),
    execution.rejectCancellation({
      cancellationRequestId: seeded.cancellationRequestId,
      actorId: "admin-reject",
      reason: "Concurrent adjudication test rejection.",
    }),
  ]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length,
    1);
  assert.equal(outcomes.filter((item) => item.status === "rejected").length,
    1);
  const cancellation = await data(
    `providerRequestCancellationRequests/${seeded.cancellationRequestId}`,
  );
  assert.ok(cancellation.status === "approved" ||
    cancellation.status === "rejected");
}

async function failureAndRetry(execution, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "retry");
  const approved = await execution.approveCancellation({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  const prepared = await execution.prepareRefundExecution({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  await execution.recordExecutionFailure({
    ...prepared,
    actorId: "admin-b6",
    certainty: "ambiguous",
  });
  let operation = await data(
    `payments/${seeded.paymentId}/refunds/${approved.refundOperationId}`,
  );
  assert.equal(operation.status, "processing");
  assert.equal(operation.gatewayFailureCertainty, "ambiguous");
  assert.equal((await data(`payments/${seeded.paymentId}`))
    .refundReservedAmountInCentavos, 100_000);
  assert.equal((await data(`providerRequests/${seeded.providerRequestId}`))
    .status, "cancelled");

  const retried = await execution.prepareRefundExecution({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  assert.equal(retried.refundOperationId, prepared.refundOperationId);
  assert.equal(retried.gatewayExecutionKey, prepared.gatewayExecutionKey);
  operation = await data(
    `payments/${seeded.paymentId}/refunds/${approved.refundOperationId}`,
  );
  assert.equal(operation.executionAttemptCount, 2);
  assert.equal((await refunds(seeded.paymentId)).size, 1);

  await execution.recordExecutionFailure({
    ...retried,
    actorId: "admin-b6",
    certainty: "gateway_rejected",
  });
  operation = await data(
    `payments/${seeded.paymentId}/refunds/${approved.refundOperationId}`,
  );
  assert.equal(operation.status, "failed");
  assert.equal((await data(
    `providerRequestCancellationRequests/${seeded.cancellationRequestId}`,
  )).status, "refund_failed");
  assert.equal((await data(`payments/${seeded.paymentId}`))
    .refundReservedAmountInCentavos, 100_000);

  const ambiguousOld = await seed(paymentIdForProviderRequest,
    "ambiguous-old");
  const oldApproval = await execution.approveCancellation({
    cancellationRequestId: ambiguousOld.cancellationRequestId,
    actorId: "admin-b6",
  });
  const oldPrepared = await execution.prepareRefundExecution({
    cancellationRequestId: ambiguousOld.cancellationRequestId,
    actorId: "admin-b6",
  });
  await execution.recordExecutionFailure({
    ...oldPrepared,
    actorId: "admin-b6",
    certainty: "ambiguous",
  });
  await db.doc(
    `payments/${ambiguousOld.paymentId}/refunds/${oldApproval.refundOperationId}`,
  ).update({
    gatewayRequestedAt: Timestamp.fromMillis(
      Date.now() - 24 * 60 * 60 * 1_000,
    ),
  });
  await assert.rejects(() => execution.prepareRefundExecution({
    cancellationRequestId: ambiguousOld.cancellationRequestId,
    actorId: "admin-b6",
  }), reason("REFUND_RECONCILIATION_REQUIRED"));
}

async function gatewayMismatchFailsClosed(execution, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "mismatch");
  const approved = await execution.approveCancellation({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  await execution.prepareRefundExecution({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  await assert.rejects(() => execution.reconcileGatewayRefund({
    paymentId: seeded.paymentId,
    refundOperationId: approved.refundOperationId,
    refund: gatewayRefund(seeded, approved.refundOperationId, {
      amountInCentavos: 99_999,
    }),
    actorId: "paymongo",
    source: "paymongo_webhook",
  }), reason("REFUND_GATEWAY_LINKAGE_INVALID"));
  assert.equal((await data(`payments/${seeded.paymentId}`))
    .refundedAmountInCentavos, 0);
}

async function legacyEarlyWebhook(webhook, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "legacy-webhook");
  const paymentReference = db.doc(`payments/${seeded.paymentId}`);
  await paymentReference.update({
    refundExecutionLock: {
      kind: "legacy_admin_full_refund",
      operationKey: "legacy-operation-key",
      state: "reserved",
      amountInCentavos: 100_000,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
  });
  const result = await webhook.processPayMongoWebhook(paymentWebhook({
    eventId: "event-b6-legacy-refunded",
    eventType: "payment.refunded",
    paymentId: seeded.paymentId,
    gatewayPaymentId: seeded.gatewayPaymentId,
    amount: 100_000,
  }));
  assert.equal(result.applied, true);
  const payment = await data(`payments/${seeded.paymentId}`);
  assert.equal(payment.status, "refunded");
  assert.equal(payment.refundedAmountInCentavos, 100_000);
  assert.equal(payment.refundReservedAmountInCentavos, 0);
  assert.equal(payment.refundExecutionLock.state, "completed");
}

async function seed(paymentIdForProviderRequest, suffix, options = {}) {
  const mainEventId = `event-b6-${suffix}`;
  const providerRequestId = `request-b6-${suffix}`;
  const cancellationRequestId = `cancellation-b6-${suffix}`;
  const customerId = `customer-b6-${suffix}`;
  const providerId = `provider-b6-${suffix}`;
  const ownerId = `owner-b6-${suffix}`;
  const paymentId = paymentIdForProviderRequest(providerRequestId);
  const gatewayPaymentId = `pay_b6_${suffix.replaceAll("-", "_")}`;
  const stage = options.stage ?? "preparation_started";
  const sequence = options.sequence ?? 1;
  const rate = options.rate ?? 10_000;
  const now = Timestamp.now();
  const providerRequestIds = [providerRequestId];
  let siblingProviderRequestId = null;
  if (options.siblingStatus) {
    siblingProviderRequestId = `request-b6-${suffix}-sibling`;
    providerRequestIds.push(siblingProviderRequestId);
  }
  const batch = db.batch();
  batch.set(db.doc(`mainEvents/${mainEventId}`), {
    mainEventId,
    bookingId: mainEventId,
    customerId,
    providerRequestIds,
    status: options.mainEventStatus ?? "confirmed",
  });
  batch.set(db.doc(`providers/${providerId}`), {
    providerId,
    ownerId,
    verificationStatus: "approved",
    isActive: true,
  });
  batch.set(db.doc(`providerRequests/${providerRequestId}`), {
    providerRequestId,
    mainEventId,
    bookingId: mainEventId,
    customerId,
    providerId,
    paymentId,
    downPaymentAmount: 1_000,
    status: "confirmed",
    paymentStatus: "paid",
    refundPolicySnapshot: policySnapshot(providerId, rate, now),
    refundPolicyAgreement: {
      schemaVersion: 1,
      policyKey: `provider_default:${providerId}:v1`,
      agreedAt: now,
      channel: "booking_submission",
    },
    refundEligibilityState: {
      schemaVersion: 1,
      currentStage: stage,
      stageSequence: sequence,
      enteredAt: now,
      activeCancellationRequestId: cancellationRequestId,
    },
  });
  if (siblingProviderRequestId) {
    batch.set(db.doc(`providerRequests/${siblingProviderRequestId}`), {
      providerRequestId: siblingProviderRequestId,
      mainEventId,
      bookingId: mainEventId,
      customerId,
      providerId: `${providerId}-sibling`,
      status: options.siblingStatus,
      paymentStatus: "paid",
    });
  }
  batch.set(db.doc(`payments/${paymentId}`), {
    paymentId,
    providerRequestId,
    mainEventId,
    bookingId: mainEventId,
    customerId,
    providerId,
    amount: 1_000,
    amountInCentavos: 100_000,
    currency: "PHP",
    paymentType: "provider_down_payment",
    gateway: "paymongo",
    paymongoResourceId: gatewayPaymentId,
    status: "paid",
    paidAt: now,
  });
  batch.set(db.doc(
    `providerRequestCancellationRequests/${cancellationRequestId}`,
  ), {
    schemaVersion: 1,
    mainEventId,
    providerRequestId,
    customerId,
    providerId,
    status: options.cancellationStatus ?? "submitted",
    reason: "B6 refund execution integration test.",
    policyEvidenceStatus: "policy_backed",
    frozenEligibility: {
      stage,
      stageSequence: sequence,
      frozenAt: now,
    },
    submittedAt: now,
    updatedAt: now,
    decision: null,
    refundCalculation: null,
    refundOperationId: null,
    refundOperationIds: [],
  });
  await batch.commit();
  return {
    mainEventId,
    providerRequestId,
    siblingProviderRequestId,
    cancellationRequestId,
    paymentId,
    gatewayPaymentId,
  };
}

function policySnapshot(providerId, rate, now) {
  return {
    schemaVersion: 1,
    policyKey: `provider_default:${providerId}:v1`,
    source: {
      kind: "provider_default",
      sourceId: providerId,
      policyVersion: 1,
    },
    rules: [
      {stage: "preparation_not_started", refundBasisPoints: rate},
      {stage: "preparation_started", refundBasisPoints: rate},
      {stage: "service_started", refundBasisPoints: rate},
    ],
    terms: null,
    capturedAt: now,
  };
}

function gatewayRefund(seeded, operationId, overrides = {}) {
  return {
    id: "refund-b6-gateway",
    amountInCentavos: 100_000,
    currency: "PHP",
    gatewayPaymentId: seeded.gatewayPaymentId,
    status: "succeeded",
    metadata: {
      feasta_payment_id: seeded.paymentId,
      feasta_refund_operation_id: operationId,
    },
    ...overrides,
  };
}

function refundWebhook(input) {
  return Buffer.from(JSON.stringify({
    data: {
      id: input.eventId,
      attributes: {
        type: "refund.succeeded",
        data: {
          id: "refund-b6-gateway",
          type: "refund",
          attributes: {
            amount: input.amount,
            currency: "PHP",
            payment_id: input.gatewayPaymentId,
            status: input.status,
            metadata: {
              feasta_payment_id: input.paymentId,
              feasta_refund_operation_id: input.operationId,
            },
          },
        },
      },
    },
  }));
}

function paymentWebhook(input) {
  return Buffer.from(JSON.stringify({
    data: {
      id: input.eventId,
      attributes: {
        type: input.eventType,
        data: {
          id: input.gatewayPaymentId,
          type: "payment",
          attributes: {
            amount: input.amount,
            currency: "PHP",
            metadata: {payment_id: input.paymentId},
          },
        },
      },
    },
  }));
}

async function data(pathValue) {
  return (await db.doc(pathValue).get()).data();
}

async function refunds(paymentId) {
  return db.collection(`payments/${paymentId}/refunds`).get();
}

function reason(expected) {
  return (error) => error?.details?.reason === expected;
}
