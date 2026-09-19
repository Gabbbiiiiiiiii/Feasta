const assert = require("node:assert/strict");
const path = require("node:path");
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getFirestore, Timestamp, FieldValue} = require("firebase-admin/firestore");

const projectId = process.env.GCLOUD_PROJECT ??
  "demo-feasta-refund-accounting";
const app = initializeApp({projectId});
const db = getFirestore(app);
const libRoot = process.env.FEASTA_FUNCTIONS_LIB_DIR ??
  path.resolve(__dirname, "../../lib");

(async () => {
  const accounting = require(path.join(
    libRoot,
    "refunds/refund-accounting.js",
  ));
  const {paymentIdForProviderRequest} = require(path.join(
    libRoot,
    "payments/payment-lifecycle.js",
  ));

  try {
    await decisionFoundation(accounting, paymentIdForProviderRequest);
    await reservationReplayAndAccounting(accounting, paymentIdForProviderRequest);
    await concurrentOverReservation(accounting, paymentIdForProviderRequest);
    await concurrentExactReservation(accounting, paymentIdForProviderRequest);
    await policyTargetAndCanonicalLinkage(accounting, paymentIdForProviderRequest);
    await oneLogicalRefundAndIsolation(accounting, paymentIdForProviderRequest);
    console.log("Refund accounting B5 integration passed.");
  } finally {
    await deleteApp(app);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function decisionFoundation(accounting, paymentIdForProviderRequest) {
  const calculated = await seed(paymentIdForProviderRequest, "decision", 100_000);
  await db.doc(
    `providerRequestCancellationRequests/${calculated.cancellationRequestId}`,
  ).update({status: "submitted"});
  const result = await accounting.recordCancellationRefundCalculation({
    cancellationRequestId: calculated.cancellationRequestId,
    actorId: "system-b5-test",
    actorRole: "system",
  });
  assert.equal(result.calculationStatus, "calculated");
  assert.equal(result.eligibleRefundAmountInCentavos, 100_000);
  const stored = (await db.doc(
    `providerRequestCancellationRequests/${calculated.cancellationRequestId}`,
  ).get()).data();
  assert.equal(stored.status, "under_review");
  assert.equal(stored.refundCalculation.refundBasisPoints, 10_000);
  assert.equal(
    (await db.doc(`providerRequests/${calculated.providerRequestId}`).get())
      .data().approvedCancellationRequestId,
    undefined,
  );

  const unpaid = await seed(paymentIdForProviderRequest, "unpaid", 100_000);
  await db.doc(`payments/${unpaid.paymentId}`).delete();
  await db.doc(
    `providerRequestCancellationRequests/${unpaid.cancellationRequestId}`,
  ).update({status: "submitted"});
  const noMoney = await accounting.recordCancellationRefundCalculation({
    cancellationRequestId: unpaid.cancellationRequestId,
    actorId: "system-b5-test",
    actorRole: "system",
  });
  assert.equal(noMoney.calculationStatus, "nothing_refundable");
  assert.equal(noMoney.originalPaidAmountInCentavos, 0);

  const legacy = await seed(paymentIdForProviderRequest, "legacy", 100_000);
  await db.doc(`providerRequests/${legacy.providerRequestId}`).update({
    refundPolicySnapshot: FieldValue.delete(),
    refundPolicyAgreement: FieldValue.delete(),
    refundEligibilityState: FieldValue.delete(),
    activeCancellationRequestId: legacy.cancellationRequestId,
  });
  await db.doc(
    `providerRequestCancellationRequests/${legacy.cancellationRequestId}`,
  ).update({
    status: "under_review",
    policyEvidenceStatus: "legacy",
    frozenEligibility: null,
  });
  const manual = await accounting.recordCancellationRefundCalculation({
    cancellationRequestId: legacy.cancellationRequestId,
    actorId: "system-b5-test",
    actorRole: "system",
  });
  assert.equal(manual.calculationStatus, "manual_review_required");
  assert.equal(manual.eligibleRefundAmountInCentavos, null);

  const awaiting = await seed(paymentIdForProviderRequest, "awaiting", 100_000);
  await db.doc(
    `providerRequestCancellationRequests/${awaiting.cancellationRequestId}`,
  ).update({status: "awaiting_payment_resolution"});
  await assert.rejects(
    () => accounting.recordCancellationRefundCalculation({
      cancellationRequestId: awaiting.cancellationRequestId,
      actorId: "system-b5-test",
      actorRole: "system",
    }),
    reason("REFUND_PAYMENT_NOT_SETTLED"),
  );
}

async function reservationReplayAndAccounting(accounting, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "replay", 100_000);
  const operationKey = accounting.refundOperationKey({
    cancellationRequestId: seeded.cancellationRequestId,
    logicalOperationKey: "first-reservation",
  });
  const first = await accounting.reserveCancellationRefund({
    cancellationRequestId: seeded.cancellationRequestId,
    operationKey,
    amountInCentavos: 40_000,
    actorId: "system-b5-test",
    actorRole: "system",
  });
  assert.equal(first.replayed, false);
  assert.equal(first.calculation.eligibleRefundAmountInCentavos, 100_000);
  const replay = await accounting.reserveCancellationRefund({
    cancellationRequestId: seeded.cancellationRequestId,
    operationKey,
    amountInCentavos: 40_000,
    actorId: "system-b5-test",
    actorRole: "system",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.refundOperationId, first.refundOperationId);
  assert.equal((await payment(seeded.paymentId)).refundReservedAmountInCentavos, 40_000);
  assert.equal((await refunds(seeded.paymentId)).size, 1);

  await assert.rejects(() => accounting.reserveCancellationRefund({
    cancellationRequestId: seeded.cancellationRequestId,
    operationKey,
    amountInCentavos: 40_001,
    actorId: "system-b5-test",
    actorRole: "system",
  }), reason("REFUND_OPERATION_CONFLICT"));

  assert.deepEqual(await accounting.releaseRefundReservation({
    paymentId: seeded.paymentId,
    refundOperationId: first.refundOperationId,
    actorId: "system-b5-test",
    actorRole: "system",
    failureCode: "PRE_GATEWAY_NOT_SENT",
  }), {status: "released", replayed: false});
  assert.deepEqual(await accounting.releaseRefundReservation({
    paymentId: seeded.paymentId,
    refundOperationId: first.refundOperationId,
    actorId: "system-b5-test",
    actorRole: "system",
    failureCode: "PRE_GATEWAY_NOT_SENT",
  }), {status: "released", replayed: true});
  assert.equal((await payment(seeded.paymentId)).refundReservedAmountInCentavos, 0);

  const partial = await reserve(accounting, seeded, "partial", 40_000);
  const partialCompleted = await accounting.completeRefundAccounting({
    paymentId: seeded.paymentId,
    refundOperationId: partial.refundOperationId,
    actorId: "system-b5-test",
    actorRole: "system",
  });
  assert.equal(partialCompleted.paymentStatus, "partially_refunded");
  assert.equal(partialCompleted.replayed, false);
  assert.equal((await accounting.completeRefundAccounting({
    paymentId: seeded.paymentId,
    refundOperationId: partial.refundOperationId,
    actorId: "system-b5-test",
    actorRole: "system",
  })).replayed, true);
  let current = await payment(seeded.paymentId);
  assert.equal(current.status, "partially_refunded");
  assert.equal(current.refundedAmountInCentavos, 40_000);
  assert.equal(current.refundReservedAmountInCentavos, 0);

  const remainder = await reserve(accounting, seeded, "remainder", 60_000);
  const completed = await accounting.completeRefundAccounting({
    paymentId: seeded.paymentId,
    refundOperationId: remainder.refundOperationId,
    actorId: "system-b5-test",
    actorRole: "system",
  });
  assert.equal(completed.paymentStatus, "refunded");
  current = await payment(seeded.paymentId);
  assert.equal(current.status, "refunded");
  assert.equal(current.refundedAmountInCentavos, 100_000);
  assert.equal(current.refundReservedAmountInCentavos, 0);
  assert.ok(current.refundedAt instanceof Timestamp);
}

async function concurrentOverReservation(accounting, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "overrun", 100_000);
  const outcomes = await Promise.allSettled([
    reserve(accounting, seeded, "seventy-a", 70_000),
    reserve(accounting, seeded, "seventy-b", 70_000),
  ]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
  const current = await payment(seeded.paymentId);
  assert.equal(current.refundReservedAmountInCentavos, 70_000);
  assert.ok(
    current.refundedAmountInCentavos + current.refundReservedAmountInCentavos <=
      current.amountInCentavos,
  );
}

async function concurrentExactReservation(accounting, paymentIdForProviderRequest) {
  const seeded = await seed(paymentIdForProviderRequest, "exact", 100_000);
  const outcomes = await Promise.allSettled([
    reserve(accounting, seeded, "forty", 40_000),
    reserve(accounting, seeded, "sixty", 60_000),
  ]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 2);
  assert.equal((await payment(seeded.paymentId)).refundReservedAmountInCentavos, 100_000);
  assert.equal((await refunds(seeded.paymentId)).size, 2);
}

async function policyTargetAndCanonicalLinkage(accounting, paymentIdForProviderRequest) {
  const capped = await seed(paymentIdForProviderRequest, "policy-cap", 100_000);
  const requestReference = db.doc(`providerRequests/${capped.providerRequestId}`);
  const request = (await requestReference.get()).data();
  await requestReference.update({
    refundPolicySnapshot: {
      ...request.refundPolicySnapshot,
      rules: request.refundPolicySnapshot.rules.map((rule) =>
        rule.stage === "preparation_started"
          ? {...rule, refundBasisPoints: 5_000}
          : rule),
    },
  });
  await assert.rejects(
    () => reserve(accounting, capped, "above-policy-target", 50_001),
    reason("REFUND_RESERVATION_CONFLICT"),
  );
  assert.equal((await refunds(capped.paymentId)).size, 0);

  const forged = await seed(paymentIdForProviderRequest, "forged", 100_000);
  await db.doc(`payments/${forged.paymentId}`).update({
    providerId: "provider-forged",
  });
  await assert.rejects(
    () => reserve(accounting, forged, "forged-linkage", 1),
    reason("REFUND_PAYMENT_INVALID"),
  );
  assert.equal((await refunds(forged.paymentId)).size, 0);
}

async function oneLogicalRefundAndIsolation(accounting, paymentIdForProviderRequest) {
  const a = await seed(paymentIdForProviderRequest, "provider-a", 100_000);
  const b = await seed(paymentIdForProviderRequest, "provider-b", 80_000);
  const bBefore = await payment(b.paymentId);
  await reserve(accounting, a, "provider-a-only", 50_000);
  assert.deepEqual(await payment(b.paymentId), bBefore);
  assert.equal((await refunds(b.paymentId)).size, 0);

  const secondAttemptId = `${a.cancellationRequestId}-second`;
  await db.doc(`providerRequestCancellationRequests/${secondAttemptId}`).set({
    ...(await db.doc(
      `providerRequestCancellationRequests/${a.cancellationRequestId}`,
    ).get()).data(),
    status: "approved",
  });
  await db.doc(`providerRequests/${a.providerRequestId}`).update({
    refundEligibilityState: {
      ...(await db.doc(`providerRequests/${a.providerRequestId}`).get())
        .data().refundEligibilityState,
      activeCancellationRequestId: secondAttemptId,
    },
  });
  await assert.rejects(() => reserve(accounting, {
    ...a,
    cancellationRequestId: secondAttemptId,
  }, "second-approved-attempt", 1), reason("REFUND_RESERVATION_CONFLICT"));
  assert.equal(
    (await db.doc(`providerRequests/${a.providerRequestId}`).get())
      .data().approvedCancellationRequestId,
    a.cancellationRequestId,
  );
}

async function reserve(accounting, seeded, suffix, amountInCentavos) {
  return accounting.reserveCancellationRefund({
    cancellationRequestId: seeded.cancellationRequestId,
    operationKey: accounting.refundOperationKey({
      cancellationRequestId: seeded.cancellationRequestId,
      logicalOperationKey: suffix,
    }),
    amountInCentavos,
    actorId: "system-b5-test",
    actorRole: "system",
  });
}

async function seed(paymentIdForProviderRequest, suffix, amountInCentavos) {
  const mainEventId = `event-b5-${suffix}`;
  const providerRequestId = `request-b5-${suffix}`;
  const cancellationRequestId = `cancellation-b5-${suffix}`;
  const customerId = `customer-b5-${suffix}`;
  const providerId = `provider-b5-${suffix}`;
  const paymentId = paymentIdForProviderRequest(providerRequestId);
  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(db.doc(`mainEvents/${mainEventId}`), {
    mainEventId,
    bookingId: mainEventId,
    customerId,
    providerRequestIds: [providerRequestId],
    status: "confirmed",
  });
  batch.set(db.doc(`providerRequests/${providerRequestId}`), {
    providerRequestId,
    mainEventId,
    bookingId: mainEventId,
    customerId,
    providerId,
    paymentId,
    downPaymentAmount: amountInCentavos / 100,
    status: "confirmed",
    paymentStatus: "paid",
    refundPolicySnapshot: {
      schemaVersion: 1,
      policyKey: `provider_default:${providerId}:v1`,
      source: {kind: "provider_default", sourceId: providerId, policyVersion: 1},
      rules: [
        {stage: "preparation_not_started", refundBasisPoints: 10_000},
        {stage: "preparation_started", refundBasisPoints: 10_000},
        {stage: "service_started", refundBasisPoints: 0},
      ],
      terms: null,
      capturedAt: now,
    },
    refundPolicyAgreement: {
      schemaVersion: 1,
      policyKey: `provider_default:${providerId}:v1`,
      agreedAt: now,
      channel: "booking_submission",
    },
    refundEligibilityState: {
      schemaVersion: 1,
      currentStage: "preparation_started",
      stageSequence: 1,
      enteredAt: now,
      activeCancellationRequestId: cancellationRequestId,
    },
  });
  batch.set(db.doc(`payments/${paymentId}`), {
    paymentId,
    providerRequestId,
    mainEventId,
    bookingId: mainEventId,
    customerId,
    providerId,
    amount: amountInCentavos / 100,
    amountInCentavos,
    currency: "PHP",
    paymentType: "provider_down_payment",
    gateway: "paymongo",
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
    status: "approved",
    reason: "B5 accounting integration test",
    policyEvidenceStatus: "policy_backed",
    frozenEligibility: {
      stage: "preparation_started",
      stageSequence: 1,
      frozenAt: now,
    },
    submittedAt: now,
    updatedAt: now,
    decision: {authority: "test_fixture"},
    refundCalculation: null,
    refundOperationId: null,
    refundOperationIds: [],
  });
  await batch.commit();
  return {
    paymentId,
    mainEventId,
    providerRequestId,
    cancellationRequestId,
  };
}

async function payment(paymentId) {
  return (await db.doc(`payments/${paymentId}`).get()).data();
}

async function refunds(paymentId) {
  return db.collection(`payments/${paymentId}/refunds`).get();
}

function reason(expected) {
  return (error) => error?.details?.reason === expected;
}
