const assert = require("node:assert/strict");
const path = require("node:path");
const {readFileSync} = require("node:fs");
const {createRequire} = require("node:module");
const vm = require("node:vm");
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
    await belowGatewayMinimum(execution, paymentIdForProviderRequest);
    await partialCapabilityFailsClosed(execution, paymentIdForProviderRequest);
    await gatewayMismatchFailsClosed(execution, paymentIdForProviderRequest);
    await legacyEarlyWebhook(webhook, paymentIdForProviderRequest);
    await paymentRefundCompatibility(execution, webhook, paymentIdForProviderRequest);
    await adminRefundReconciliation(execution, paymentIdForProviderRequest);
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
  assert.equal(finalOperation.gatewayStatus, "succeeded");
  for (const eventType of ["payment.refund.updated", "payment.refunded"]) {
    assert.equal((await webhook.processPayMongoWebhook(refundWebhook({
      eventId: `event-b6-${eventType}`, eventType,
      paymentId: seeded.paymentId, operationId: approved.refundOperationId,
      gatewayPaymentId: seeded.gatewayPaymentId, amount: 50_000, status: "succeeded",
    }))).duplicate, true);
    assert.equal((await data(`payments/${seeded.paymentId}`)).refundedAmountInCentavos, 50_000);
  }
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

async function belowGatewayMinimum(execution, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "minimum", {
    rate: 1,
  });
  const approved = await execution.approveCancellation({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  assert.equal(approved.refundAmountInCentavos, 10);
  await assert.rejects(
    () => execution.executeRefund({
      cancellationRequestId: seeded.cancellationRequestId,
      actorId: "admin-b6",
    }),
    reason("REFUND_GATEWAY_MINIMUM_UNSUPPORTED"),
  );
  const [payment, cancellation, operations] = await Promise.all([
    data(`payments/${seeded.paymentId}`),
    data(
      `providerRequestCancellationRequests/${seeded.cancellationRequestId}`,
    ),
    refunds(seeded.paymentId),
  ]);
  assert.equal(payment.refundedAmountInCentavos, 0);
  assert.equal(payment.refundReservedAmountInCentavos, 10);
  assert.equal(cancellation.status, "refund_failed");
  assert.equal(operations.size, 1);
  assert.equal(operations.docs[0].data().status, "failed");
  assert.equal(
    operations.docs[0].data().failureCode,
    "GATEWAY_MINIMUM_UNSUPPORTED",
  );
  await assert.rejects(
    () => execution.executeRefund({
      cancellationRequestId: seeded.cancellationRequestId,
      actorId: "admin-b6",
    }),
    reason("REFUND_RECONCILIATION_REQUIRED"),
  );
  assert.equal((await refunds(seeded.paymentId)).size, 1);
}

async function partialCapabilityFailsClosed(
  execution,
  paymentIdForProviderRequest,
) {
  const seeded = await seed(paymentIdForProviderRequest, "capability", {
    rate: 5_000,
    paymentMethodType: null,
  });
  await execution.approveCancellation({
    cancellationRequestId: seeded.cancellationRequestId,
    actorId: "admin-b6",
  });
  await assert.rejects(
    () => execution.executeRefund({
      cancellationRequestId: seeded.cancellationRequestId,
      actorId: "admin-b6",
    }),
    reason("REFUND_PAYMENT_CAPABILITY_UNCONFIRMED"),
  );
  const operation = (await refunds(seeded.paymentId)).docs[0].data();
  assert.equal(operation.status, "failed");
  assert.equal(
    operation.failureCode,
    "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED",
  );
  assert.equal(
    (await data(`payments/${seeded.paymentId}`))
      .refundReservedAmountInCentavos,
    50_000,
  );
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

async function paymentRefundCompatibility(execution, webhook, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "payment-compat");
  const approved = await execution.approveCancellation({
    cancellationRequestId: seeded.cancellationRequestId, actorId: "admin-b6",
  });
  await execution.prepareRefundExecution({
    cancellationRequestId: seeded.cancellationRequestId, actorId: "admin-b6",
  });
  const raw = (id) => paymentWebhook({
    eventId: id, eventType: "payment.refunded", paymentId: seeded.paymentId,
    gatewayPaymentId: seeded.gatewayPaymentId, amount: 100_000,
  });
  const operationPath = `payments/${seeded.paymentId}/refunds/${approved.refundOperationId}`;
  const before = await data(`payments/${seeded.paymentId}`);
  const missing = await webhook.processPayMongoWebhook(raw("compat-missing"));
  assert.equal(missing.reason, "refund_operation_required");
  assert.deepEqual(await data(`payments/${seeded.paymentId}`), before);

  await execution.reconcileGatewayRefund({
    paymentId: seeded.paymentId, refundOperationId: approved.refundOperationId,
    refund: gatewayRefund(seeded, approved.refundOperationId, {status: "processing"}),
    actorId: "admin-b6", source: "refund_execution_response",
  });
  assert.equal((await data(operationPath)).status, "processing");
  assert.equal((await data(`payments/${seeded.paymentId}`)).refundedAmountInCentavos, 0);
  const originalFetch = global.fetch;
  process.env.PAYMONGO_SECRET_KEY = "sk_test_compatibility";
  let calls = 0;
  let overrides = {};
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.paymongo.com/v1/refunds/refund-b6-gateway");
    assert.equal(options.method, "GET");
    const payload = JSON.parse(refundWebhook({
      eventId: "unused", paymentId: seeded.paymentId,
      operationId: approved.refundOperationId, gatewayPaymentId: seeded.gatewayPaymentId,
      amount: 100_000, status: "succeeded",
    }).toString());
    const resource = payload.data.attributes.data;
    if (overrides.id) resource.id = overrides.id;
    Object.assign(resource.attributes, overrides.attributes ?? {});
    return {ok: true, json: async () => ({data: resource})};
  };
  try {
    const processing = await data(operationPath);
    await db.doc(`payments/${seeded.paymentId}/refunds/refund_ambiguous`).set(processing);
    const ambiguous = await webhook.processPayMongoWebhook(raw("compat-ambiguous"));
    assert.equal(ambiguous.reason, "refund_operation_required");
    assert.equal(calls, 0);
    await db.doc(`payments/${seeded.paymentId}/refunds/refund_ambiguous`).delete();
    for (const [name, mismatch] of [
      ["id", {id: "ref_wrong"}],
      ["payment", {attributes: {payment_id: "pay_wrong"}}],
      ["metadata", {attributes: {metadata: {
        feasta_payment_id: seeded.paymentId, feasta_refund_operation_id: "refund_wrong",
      }}}],
      ["payment-metadata", {attributes: {metadata: {
        feasta_payment_id: "payment_wrong", feasta_refund_operation_id: approved.refundOperationId,
      }}}],
    ]) {
      overrides = mismatch;
      await assert.rejects(() => webhook.processPayMongoWebhook(raw(`compat-${name}`)));
      assert.equal((await data(operationPath)).status, "processing");
      assert.equal((await data(`payments/${seeded.paymentId}`)).refundedAmountInCentavos, 0);
    }
    overrides = {attributes: {status: "pending"}};
    await webhook.processPayMongoWebhook(raw("compat-pending"));
    assert.equal((await data(operationPath)).status, "processing");
    assert.equal((await data(`payments/${seeded.paymentId}`)).refundedAmountInCentavos, 0);
    overrides = {};
    const completed = await webhook.processPayMongoWebhook(raw("compat-success"));
    assert.equal(completed.applied, true);
    const count = calls;
    assert.equal((await webhook.processPayMongoWebhook(raw("compat-success"))).duplicate, true);
    assert.equal(calls, count);
    const payment = await data(`payments/${seeded.paymentId}`);
    assert.equal(payment.status, "refunded");
    assert.equal(payment.refundedAmountInCentavos, 100_000);
    assert.equal(payment.refundReservedAmountInCentavos, 0);
    const operation = await data(operationPath);
    assert.equal(operation.status, "completed");
    assert.equal(operation.gatewayStatus, "succeeded");
    assert.equal((await data(`providerRequestCancellationRequests/${seeded.cancellationRequestId}`)).status,
      "refund_completed");
  } finally {
    global.fetch = originalFetch;
    delete process.env.PAYMONGO_SECRET_KEY;
  }
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

// Exercise the real callable handler, authorization/profile checks, rate limit,
// Firestore transactions and gateway client. Only Auth lookup and PayMongo HTTP
// are local substitutes; no external service is contacted.
function adminCallableHarness() {
  function load(relative, stubs) {
    const filename = path.join(libRoot, relative);
    const realRequire = createRequire(filename);
    const exports = {};
    vm.runInThisContext(`(function(exports, require) {\n${readFileSync(filename, "utf8")}\n})`,
      {filename})(exports, (name) => stubs[name] ?? realRequire(name));
    return exports;
  }
  const authorization = load("shared/authorization.js", {
    "firebase-admin/auth": {getAuth: () => ({getUser: async () => ({disabled: false})})},
  });
  const https = require("firebase-functions/v2/https");
  const stubs = {
    "firebase-functions/v2/https": {...https, onCall: (options, handler) => {
      handler.options = options;
      return handler;
    }},
    "../shared/authorization.js": authorization,
  };
  const handler = load("refunds/refund-execution.js", stubs).reconcileProviderRequestRefund;
  handler.inspect = load("refunds/inspect-refund-reconciliation.js", stubs)
    .inspectProviderRequestRefundReconciliation;
  return handler;
}

async function adminRefundReconciliation(execution, paymentIdForProviderRequest) {
  const handler = adminCallableHarness();
  assert.equal(handler.options.enforceAppCheck, true);
  assert.equal(handler.options.secrets[0].name, "PAYMONGO_SECRET_KEY");
  const activeProfile = {accountStatus: "active", isActive: true, isBlocked: false};
  await db.doc("users/admin-reconciliation").set({role: "admin", ...activeProfile});
  await db.doc("users/customer-reconciliation").set({role: "customer", ...activeProfile});
  const request = (id, uid = "admin-reconciliation", extras = {}) => ({
    auth: {uid, token: {}}, data: {cancellationRequestId: id, ...extras},
    rawRequest: {headers: {}, ip: "127.0.0.1"},
  });
  await assert.rejects(() => handler(request("cancellation-invalid", "customer-reconciliation")),
    (error) => error.code === "permission-denied");
  await assert.rejects(() => handler({...request("cancellation-invalid"), auth: undefined}),
    (error) => error.code === "unauthenticated");
  await assert.rejects(() => handler(request("bad/id")),
    (error) => error.code === "invalid-argument");
  for (const field of ["paymentId", "refundOperationId", "gatewayRefundId", "gatewayPaymentId",
    "amount", "status", "currency", "URL"]) {
    await assert.rejects(() => handler(request("cancellation-invalid", undefined, {[field]: "untrusted"})),
      (error) => error.code === "invalid-argument");
  }
  const seeded = await seed(paymentIdForProviderRequest, "admin-reconciliation");
  await db.doc(`payments/${seeded.paymentId}`).update({amount: 5_000, amountInCentavos: 500_000});
  await db.doc(`providerRequests/${seeded.providerRequestId}`).update({downPaymentAmount: 5_000});
  const approved = await execution.approveCancellation({
    cancellationRequestId: seeded.cancellationRequestId, actorId: "admin-reconciliation",
  });
  await execution.prepareRefundExecution({
    cancellationRequestId: seeded.cancellationRequestId, actorId: "admin-reconciliation",
  });
  await execution.reconcileGatewayRefund({
    paymentId: seeded.paymentId, refundOperationId: approved.refundOperationId,
    refund: gatewayRefund(seeded, approved.refundOperationId, {
      status: "pending", amountInCentavos: 500_000,
    }), actorId: "admin-reconciliation", source: "refund_execution_response",
  });
  const operationPath = `payments/${seeded.paymentId}/refunds/${approved.refundOperationId}`;
  const cancellationPath = `providerRequestCancellationRequests/${seeded.cancellationRequestId}`;
  await db.doc(cancellationPath).update({
    refundOperationPlanSchemaVersion: 1,
    refundOperationBindings: [{paymentId: seeded.paymentId,
      refundOperationId: approved.refundOperationId, amountInCentavos: 500_000}],
  });
  await db.doc(operationPath).update({
    refundOperationSetSchemaVersion: 1, refundOperationSetIndex: 0, refundOperationSetSize: 1,
  });
  const baseline = {
    payment: await data(`payments/${seeded.paymentId}`),
    operation: await data(operationPath), cancellation: await data(cancellationPath),
  };
  const originalFetch = global.fetch;
  const originalSecret = process.env.PAYMONGO_SECRET_KEY;
  process.env.PAYMONGO_SECRET_KEY = "sk_test_admin_reconciliation";
  let calls = 0;
  let responseOverrides = {};
  let networkFailure = false;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.paymongo.com/v1/refunds/refund-b6-gateway");
    assert.equal(options.method, "GET");
    if (networkFailure) throw new Error("Local simulated GET failure");
    return {ok: true, json: async () => ({data: {
      id: responseOverrides.id ?? "refund-b6-gateway", type: "refund",
      attributes: {
        amount: 500_000, currency: "PHP", payment_id: seeded.gatewayPaymentId,
        status: "succeeded", metadata: {
          feasta_payment_id: seeded.paymentId, feasta_refund_operation_id: approved.refundOperationId,
        }, ...responseOverrides.attributes,
      },
    }})};
  };
  const assertUnchanged = async () => {
    assert.deepEqual(await data(`payments/${seeded.paymentId}`), baseline.payment);
    assert.deepEqual(await data(operationPath), baseline.operation);
    assert.deepEqual(await data(cancellationPath), baseline.cancellation);
  };
  // Use a fresh hour bucket subject per invocation to avoid exercising rate
  // exhaustion in the financial mismatch matrix below.
  let actorIndex = 0;
  const call = async () => {
    const uid = `admin-reconciliation-${actorIndex++}`;
    await db.doc(`users/${uid}`).set({role: "admin", ...activeProfile});
    return handler(request(seeded.cancellationRequestId, uid));
  };
  try {
    for (const patch of [
      {gatewayRefundId: null}, {gatewayPaymentId: "pay_wrong"},
      {gatewayExecutionKey: "wrong"}, {cancellationRequestId: "cancellation-wrong"},
      {status: "reserved"}, {status: "released"},
    ]) {
      await db.doc(operationPath).update(patch);
      const count = calls;
      await assert.rejects(call);
      assert.equal(calls, count);
      assert.equal((await data(`payments/${seeded.paymentId}`)).refundedAmountInCentavos, 0);
      await db.doc(operationPath).set(baseline.operation);
    }
    await db.doc(cancellationPath).update({
      refundOperationIds: [approved.refundOperationId, `refund_${"a".repeat(40)}`],
      refundOperationBindings: [baseline.cancellation.refundOperationBindings[0], {
        paymentId: `payment_${"a".repeat(32)}`, refundOperationId: `refund_${"a".repeat(40)}`,
        amountInCentavos: 100,
      }],
    });
    await assert.rejects(call);
    assert.equal(calls, 0);
    await db.doc(cancellationPath).set(baseline.cancellation);
    await db.doc(operationPath).delete();
    await assert.rejects(call);
    assert.equal(calls, 0);
    await db.doc(operationPath).set(baseline.operation);
    for (const mismatch of [
      {id: "ref_wrong"}, {attributes: {payment_id: "pay_wrong"}},
      {attributes: {amount: 499_999}}, {attributes: {currency: "USD"}},
      {attributes: {metadata: {feasta_payment_id: "payment_wrong",
        feasta_refund_operation_id: approved.refundOperationId}}},
      {attributes: {metadata: {feasta_payment_id: seeded.paymentId,
        feasta_refund_operation_id: `refund_${"a".repeat(40)}`}}},
    ]) {
      responseOverrides = mismatch;
      await assert.rejects(call);
      await assertUnchanged();
    }
    responseOverrides = {};
    networkFailure = true;
    await assert.rejects(call, (error) => error.code === "unavailable");
    await assertUnchanged();
    networkFailure = false;
    responseOverrides = {attributes: {status: "pending"}};
    const pending = await call();
    assert.equal(pending.status, "processing");
    assert.equal(pending.gatewayStatus, "pending");
    assert.deepEqual(await data(`payments/${seeded.paymentId}`), baseline.payment);
    responseOverrides = {};
    const completed = await call();
    assert.equal(completed.status, "completed");
    assert.equal(completed.gatewayStatus, "succeeded");
    const payment = await data(`payments/${seeded.paymentId}`);
    assert.equal(payment.refundedAmountInCentavos, 500_000);
    assert.equal(payment.refundReservedAmountInCentavos, 0);
    assert.equal(payment.status, "refunded");
    assert.equal((await data(operationPath)).status, "completed");
    assert.equal((await data(operationPath)).gatewayStatus, "succeeded");
    assert.equal((await data(cancellationPath)).status, "refund_completed");
    const count = calls;
    const duplicate = await call();
    assert.equal(duplicate.idempotentReplay, true);
    assert.equal(calls, count);
    assert.deepEqual(await data(`payments/${seeded.paymentId}`), payment);
    const logs = await db.collection("adminLogs").where("source", "==", "admin_reconciliation").get();
    assert.ok(logs.docs.some((doc) => doc.data().action === "refund_reconciliation.completed" &&
      doc.data().actorRole === "admin"));
    const inspectedBefore = await data(operationPath);
    const inspectedCancellation = await data(cancellationPath);
    await handler.inspect(request(seeded.cancellationRequestId));
    assert.deepEqual(await data(operationPath), inspectedBefore);
    assert.deepEqual(await data(cancellationPath), inspectedCancellation);
    assert.deepEqual(await data(`payments/${seeded.paymentId}`), payment);
  } finally {
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.PAYMONGO_SECRET_KEY;
    else process.env.PAYMONGO_SECRET_KEY = originalSecret;
  }
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
    paymentMethodType: options.paymentMethodType === undefined
      ? "card"
      : options.paymentMethodType,
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
        type: input.eventType ?? "refund.succeeded",
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
