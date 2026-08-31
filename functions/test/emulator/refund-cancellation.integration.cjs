const assert = require("node:assert/strict");

const {
  deleteApp: deleteAdminApp,
  initializeApp: initializeAdminApp,
} = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
} = require("firebase-admin/firestore");
const {
  deleteApp,
  initializeApp,
} = require("firebase/app");
const {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} = require("firebase/auth");

const {
  paymentIdForProviderRequest,
} = require("../../lib/payments/payment-lifecycle.js");

const projectId = process.env.GCLOUD_PROJECT ??
  "demo-feasta-refund-cancellation";
const authHost = requiredEnv("FIREBASE_AUTH_EMULATOR_HOST");
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:35001";
const password = "FeastaTest!2026";
const clientApp = initializeApp(
  {apiKey: "fake-api-key", projectId},
  `refund-cancellation-${Date.now()}`,
);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${authHost}`, {disableWarnings: true});
const adminApp = initializeAdminApp(
  {projectId},
  `refund-cancellation-admin-${Date.now()}`,
);
const db = getFirestore(adminApp);

void run();

async function run() {
  try {
    const fixture = await createFixture();

    await assertAuthorizationAndPreparationReadiness(fixture);
    await assertPolicyBackedCancellationAndIsolation(fixture);
    await assertLegacyAndInvalidEvidence(fixture);
    await assertPaymentProcessingRouting(fixture);
    await assertTransactionalRace(fixture);
    await assertAuditAndNotification(fixture);

    console.log("Refund cancellation B4 integration passed.");
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(clientApp);
    await deleteAdminApp(adminApp);
  }
}

async function createFixture() {
  const customer = (await createUserWithEmailAndPassword(
    auth,
    "refund.customer@feasta.test",
    password,
  )).user;
  const foreignCustomer = (await createUserWithEmailAndPassword(
    auth,
    "refund.foreign@feasta.test",
    password,
  )).user;
  const ownerA = (await createUserWithEmailAndPassword(
    auth,
    "refund.provider.a@feasta.test",
    password,
  )).user;
  const ownerB = (await createUserWithEmailAndPassword(
    auth,
    "refund.provider.b@feasta.test",
    password,
  )).user;
  const providerA = "provider_refund_a";
  const providerB = "provider_refund_b";

  await Promise.all([
    seedUser(customer.uid, "customer"),
    seedUser(foreignCustomer.uid, "customer"),
    seedUser(ownerA.uid, "provider", providerA),
    seedUser(ownerB.uid, "provider", providerB),
    seedProvider(providerA, ownerA.uid),
    seedProvider(providerB, ownerB.uid),
  ]);

  const eventId = "event_refund_multi";
  const requestA = "request_refund_multi_a";
  const requestB = "request_refund_multi_b";
  await seedMainEvent({
    eventId,
    customerId: customer.uid,
    status: "confirmed",
    providerRequestIds: [requestA, requestB],
  });
  await Promise.all([
    seedProviderRequest({
      requestId: requestA,
      eventId,
      customerId: customer.uid,
      providerId: providerA,
      status: "confirmed",
      downPaymentAmount: 0,
    }),
    seedProviderRequest({
      requestId: requestB,
      eventId,
      customerId: customer.uid,
      providerId: providerB,
      status: "confirmed",
      downPaymentAmount: 0,
    }),
  ]);

  return {
    customer,
    foreignCustomer,
    ownerA,
    ownerB,
    providerA,
    providerB,
    eventId,
    requestA,
    requestB,
  };
}

async function assertAuthorizationAndPreparationReadiness(fixture) {
  await assert.rejects(
    () => callFunction(
      "advanceProviderRequestRefundEligibilityStage",
      fixture.ownerB,
      stageInput(fixture.requestA, "foreign-provider-stage"),
    ),
    hasStatus("PERMISSION_DENIED"),
  );
  await assert.rejects(
    () => callFunction(
      "advanceProviderRequestRefundEligibilityStage",
      fixture.customer,
      stageInput(fixture.requestA, "customer-stage-attempt"),
    ),
    hasStatus("PERMISSION_DENIED"),
  );
  await assert.rejects(
    () => callFunction(
      "advanceProviderRequestRefundEligibilityStage",
      fixture.ownerA,
      {...stageInput(fixture.requestA, "unknown-field-stage"), sequence: 99},
    ),
    hasStatus("INVALID_ARGUMENT"),
  );

  const unpaid = await createStandaloneRequest(fixture, {
    suffix: "unpaid",
    status: "confirmed",
    downPaymentAmount: 100,
  });
  await assert.rejects(
    () => callFunction(
      "advanceProviderRequestRefundEligibilityStage",
      fixture.ownerA,
      stageInput(unpaid.requestId, "unpaid-stage-attempt"),
    ),
    hasReason("REFUND_ELIGIBILITY_TRANSITION_INVALID"),
  );

  const paid = await createStandaloneRequest(fixture, {
    suffix: "paid",
    status: "confirmed",
    downPaymentAmount: 100,
    paymentStatus: "paid",
    paidAt: Timestamp.now(),
  });
  await seedPayment({
    ...paid,
    customerId: fixture.customer.uid,
    providerId: fixture.providerA,
    status: "paid",
    amount: 100,
  });
  const paidResult = await callFunction(
    "advanceProviderRequestRefundEligibilityStage",
    fixture.ownerA,
    stageInput(paid.requestId, "paid-stage-success"),
  );
  assert.equal(paidResult.currentStage, "preparation_started");

  const zeroResult = await callFunction(
    "advanceProviderRequestRefundEligibilityStage",
    fixture.ownerA,
    stageInput(fixture.requestA, "zero-stage-success"),
  );
  assert.equal(zeroResult.changed, true);
  assert.equal(zeroResult.stageSequence, 1);
}

async function assertPolicyBackedCancellationAndIsolation(fixture) {
  await assert.rejects(
    () => callFunction(
      "submitProviderRequestCancellation",
      fixture.foreignCustomer,
      cancellationInput(fixture.requestA, "cancel-multi-a"),
    ),
    hasStatus("PERMISSION_DENIED"),
  );
  await assert.rejects(
    () => callFunction(
      "submitProviderRequestCancellation",
      fixture.ownerA,
      cancellationInput(fixture.requestA, "provider-cancel"),
    ),
    hasStatus("PERMISSION_DENIED"),
  );
  await assert.rejects(
    () => callFunction(
      "submitProviderRequestCancellation",
      fixture.customer,
      {...cancellationInput(fixture.requestA, "unknown-cancel"), refundAmount: 1},
    ),
    hasStatus("INVALID_ARGUMENT"),
  );

  const input = cancellationInput(fixture.requestA, "cancel-multi-a");
  const created = await callFunction(
    "submitProviderRequestCancellation",
    fixture.customer,
    input,
  );
  assert.equal(created.status, "submitted");
  assert.equal(created.policyEvidenceStatus, "policy_backed");
  assert.deepEqual(created.frozenEligibility, {
    stage: "preparation_started",
    stageSequence: 1,
  });
  assert.equal(created.manualReviewRequired, false);

  const replay = await callFunction(
    "submitProviderRequestCancellation",
    fixture.customer,
    input,
  );
  assert.equal(replay.cancellationRequestId, created.cancellationRequestId);
  assert.deepEqual(replay.frozenEligibility, created.frozenEligibility);
  await assert.rejects(
    () => callFunction(
      "submitProviderRequestCancellation",
      fixture.customer,
      cancellationInput(fixture.requestA, "different-cancel-key"),
    ),
    hasReason("CANCELLATION_ALREADY_ACTIVE"),
  );

  const attemptsWhileActive = await db
    .collection("providerRequestCancellationRequests")
    .where("providerRequestId", "==", fixture.requestA)
    .get();
  assert.equal(attemptsWhileActive.size, 1);

  const [requestA, requestB, cancellation, mainEvent] = await Promise.all([
    db.collection("providerRequests").doc(fixture.requestA).get(),
    db.collection("providerRequests").doc(fixture.requestB).get(),
    db.collection("providerRequestCancellationRequests")
      .doc(created.cancellationRequestId).get(),
    db.collection("mainEvents").doc(fixture.eventId).get(),
  ]);
  assert.equal(
    requestA.data()?.refundEligibilityState?.activeCancellationRequestId,
    created.cancellationRequestId,
  );
  assert.equal(
    requestB.data()?.refundEligibilityState?.activeCancellationRequestId,
    null,
  );
  assert.equal(mainEvent.data()?.status, "confirmed");
  assert.equal(cancellation.data()?.refundCalculation, null);
  assert.equal(cancellation.data()?.refundOperationId, null);
  assert.equal(cancellation.data()?.refundAmount, undefined);
  assert.equal(cancellation.data()?.refundBasisPoints, undefined);

  await assert.rejects(
    () => callFunction(
      "advanceProviderRequestRefundEligibilityStage",
      fixture.ownerA,
      stageInput(fixture.requestA, "locked-stage-attempt"),
    ),
    hasReason("REFUND_ELIGIBILITY_LOCKED"),
  );
  await assert.rejects(
    () => callFunction(
      "markProviderBookingInProgress",
      fixture.ownerA,
      {providerRequestId: fixture.requestA},
    ),
    hasReason("REFUND_ELIGIBILITY_LOCKED"),
  );

  await callFunction(
    "advanceProviderRequestRefundEligibilityStage",
    fixture.ownerB,
    stageInput(fixture.requestB, "unaffected-stage-b"),
  );
  await callFunction(
    "markProviderBookingInProgress",
    fixture.ownerB,
    {providerRequestId: fixture.requestB},
  );
  const [updatedB, updatedEvent] = await Promise.all([
    db.collection("providerRequests").doc(fixture.requestB).get(),
    db.collection("mainEvents").doc(fixture.eventId).get(),
  ]);
  assert.equal(updatedB.data()?.status, "in_progress");
  assert.equal(
    updatedB.data()?.refundEligibilityState?.currentStage,
    "service_started",
  );
  assert.equal(updatedEvent.data()?.status, "in_progress");
  assert.equal(updatedEvent.data()?.recoveryStatus ?? "none", "none");

  const firstBeforeDecision = cancellation.data();
  await db.runTransaction(async (transaction) => {
    const requestReference = db.collection("providerRequests")
      .doc(fixture.requestA);
    const cancellationReference = db
      .collection("providerRequestCancellationRequests")
      .doc(created.cancellationRequestId);
    const [requestSnapshot, cancellationSnapshot] = await transaction.getAll(
      requestReference,
      cancellationReference,
    );
    transaction.update(cancellationReference, {
      status: "rejected",
      updatedAt: Timestamp.now(),
      decision: {
        outcome: "rejected",
        decidedAt: Timestamp.now(),
      },
    });
    transaction.update(requestReference, {
      refundEligibilityState: {
        ...requestSnapshot.data().refundEligibilityState,
        activeCancellationRequestId: null,
      },
    });
    assert.equal(cancellationSnapshot.data().status, "submitted");
  });

  await callFunction(
    "markProviderBookingInProgress",
    fixture.ownerA,
    {providerRequestId: fixture.requestA},
  );
  const secondAttempt = await callFunction(
    "submitProviderRequestCancellation",
    fixture.customer,
    cancellationInput(fixture.requestA, "later-cancel-key"),
  );
  assert.notEqual(
    secondAttempt.cancellationRequestId,
    created.cancellationRequestId,
  );
  assert.deepEqual(secondAttempt.frozenEligibility, {
    stage: "service_started",
    stageSequence: 2,
  });

  const [firstAfterSecondAttempt, secondAfterCreation, requestAfterSecond] =
    await Promise.all([
      db.collection("providerRequestCancellationRequests")
        .doc(created.cancellationRequestId).get(),
      db.collection("providerRequestCancellationRequests")
        .doc(secondAttempt.cancellationRequestId).get(),
      db.collection("providerRequests").doc(fixture.requestA).get(),
    ]);
  assert.equal(firstAfterSecondAttempt.data()?.status, "rejected");
  assert.equal(
    firstAfterSecondAttempt.data()?.reason,
    firstBeforeDecision.reason,
  );
  assert.deepEqual(
    firstAfterSecondAttempt.data()?.frozenEligibility,
    firstBeforeDecision.frozenEligibility,
  );
  assert.deepEqual(
    firstAfterSecondAttempt.data()?.submittedAt,
    firstBeforeDecision.submittedAt,
  );
  assert.equal(secondAfterCreation.data()?.status, "submitted");
  assert.equal(
    requestAfterSecond.data()?.refundEligibilityState
      ?.activeCancellationRequestId,
    secondAttempt.cancellationRequestId,
  );
  const historicalReplay = await callFunction(
    "submitProviderRequestCancellation",
    fixture.customer,
    input,
  );
  assert.equal(
    historicalReplay.cancellationRequestId,
    created.cancellationRequestId,
  );
  assert.deepEqual(
    historicalReplay.frozenEligibility,
    created.frozenEligibility,
  );
  const allAttempts = await db
    .collection("providerRequestCancellationRequests")
    .where("providerRequestId", "==", fixture.requestA)
    .get();
  assert.equal(allAttempts.size, 2);
}

async function assertLegacyAndInvalidEvidence(fixture) {
  const legacy = await createStandaloneRequest(fixture, {
    suffix: "legacy",
    status: "confirmed",
    downPaymentAmount: 0,
    evidenceKind: "legacy",
    customerId: fixture.foreignCustomer.uid,
  });
  const legacyResult = await callFunction(
    "submitProviderRequestCancellation",
    fixture.foreignCustomer,
    cancellationInput(legacy.requestId, "legacy-cancel"),
  );
  assert.equal(legacyResult.status, "under_review");
  assert.equal(legacyResult.policyEvidenceStatus, "legacy");
  assert.equal(legacyResult.frozenEligibility, null);
  const legacyRequest = await db.collection("providerRequests")
    .doc(legacy.requestId).get();
  assert.equal(legacyRequest.data()?.refundEligibilityState, undefined);
  assert.equal(
    legacyRequest.data()?.activeCancellationRequestId,
    legacyResult.cancellationRequestId,
  );
  await assert.rejects(
    () => callFunction(
      "submitProviderRequestCancellation",
      fixture.foreignCustomer,
      cancellationInput(legacy.requestId, "legacy-second-key"),
    ),
    hasReason("CANCELLATION_ALREADY_ACTIVE"),
  );
  const firstLegacyAttempt = await db
    .collection("providerRequestCancellationRequests")
    .doc(legacyResult.cancellationRequestId)
    .get();
  await db.runTransaction(async (transaction) => {
    transaction.update(firstLegacyAttempt.ref, {
      status: "rejected",
      updatedAt: Timestamp.now(),
      decision: {
        outcome: "rejected",
        decidedAt: Timestamp.now(),
      },
    });
    transaction.update(legacyRequest.ref, {
      activeCancellationRequestId: null,
    });
  });
  const laterLegacyAttempt = await callFunction(
    "submitProviderRequestCancellation",
    fixture.foreignCustomer,
    cancellationInput(legacy.requestId, "legacy-later-key"),
  );
  assert.notEqual(
    laterLegacyAttempt.cancellationRequestId,
    legacyResult.cancellationRequestId,
  );
  const [preservedLegacyAttempt, allLegacyAttempts] = await Promise.all([
    firstLegacyAttempt.ref.get(),
    db.collection("providerRequestCancellationRequests")
      .where("providerRequestId", "==", legacy.requestId).get(),
  ]);
  assert.equal(preservedLegacyAttempt.data()?.status, "rejected");
  assert.equal(
    preservedLegacyAttempt.data()?.reason,
    firstLegacyAttempt.data()?.reason,
  );
  assert.deepEqual(
    preservedLegacyAttempt.data()?.submittedAt,
    firstLegacyAttempt.data()?.submittedAt,
  );
  assert.equal(allLegacyAttempts.size, 2);
  const legacyAfterSecond = await legacyRequest.ref.get();
  assert.equal(legacyAfterSecond.data()?.refundEligibilityState, undefined);
  assert.equal(
    legacyAfterSecond.data()?.activeCancellationRequestId,
    laterLegacyAttempt.cancellationRequestId,
  );

  const invalid = await createStandaloneRequest(fixture, {
    suffix: "invalid",
    status: "confirmed",
    downPaymentAmount: 0,
    evidenceKind: "invalid",
  });
  await assert.rejects(
    () => callFunction(
      "submitProviderRequestCancellation",
      fixture.customer,
      cancellationInput(invalid.requestId, "invalid-cancel"),
    ),
    hasReason("CANCELLATION_POLICY_EVIDENCE_INVALID"),
  );
  const invalidAttempts = await db
    .collection("providerRequestCancellationRequests")
    .where("providerRequestId", "==", invalid.requestId)
    .get();
  assert.equal(invalidAttempts.empty, true);
}

async function assertPaymentProcessingRouting(fixture) {
  const processing = await createStandaloneRequest(fixture, {
    suffix: "processing",
    status: "payment_processing",
    mainEventStatus: "waiting_for_down_payment",
    downPaymentAmount: 300,
    paymentStatus: "processing",
  });
  await seedPayment({
    ...processing,
    customerId: fixture.customer.uid,
    providerId: fixture.providerA,
    status: "processing",
    amount: 300,
  });
  const result = await callFunction(
    "submitProviderRequestCancellation",
    fixture.customer,
    cancellationInput(processing.requestId, "processing-cancel"),
  );
  assert.equal(result.status, "awaiting_payment_resolution");
  const payment = await db.collection("payments")
    .doc(paymentIdForProviderRequest(processing.requestId)).get();
  assert.equal(payment.data()?.status, "processing");
}

async function assertTransactionalRace(fixture) {
  const race = await createStandaloneRequest(fixture, {
    suffix: "race",
    status: "confirmed",
    downPaymentAmount: 0,
    customerId: fixture.foreignCustomer.uid,
  });
  const [stage, cancellation] = await Promise.allSettled([
    callFunction(
      "advanceProviderRequestRefundEligibilityStage",
      fixture.ownerA,
      stageInput(race.requestId, "race-stage-key"),
    ),
    callFunction(
      "submitProviderRequestCancellation",
      fixture.foreignCustomer,
      cancellationInput(race.requestId, "race-cancel-key"),
    ),
  ]);
  assert.equal(cancellation.status, "fulfilled");
  if (stage.status === "rejected") {
    assert.equal(stage.reason.details?.reason, "REFUND_ELIGIBILITY_LOCKED");
  }
  const request = await db.collection("providerRequests")
    .doc(race.requestId).get();
  const result = cancellation.value;
  assert.equal(
    request.data()?.refundEligibilityState?.activeCancellationRequestId,
    result.cancellationRequestId,
  );
  assert.deepEqual(result.frozenEligibility, {
    stage: stage.status === "fulfilled"
      ? "preparation_started"
      : "preparation_not_started",
    stageSequence: stage.status === "fulfilled" ? 1 : 0,
  });
}

async function assertAuditAndNotification(fixture) {
  const [audits, notifications] = await Promise.all([
    db.collection("adminLogs").get(),
    db.collection("notifications")
      .where("userId", "==", fixture.ownerA.uid).get(),
  ]);
  const actions = new Set(audits.docs.map((document) =>
    document.data().action));
  assert.ok(actions.has("refund_eligibility.stage_advanced"));
  assert.ok(actions.has("cancellation_request.submitted"));
  assert.ok(notifications.docs.some((document) =>
    document.data().title === "Cancellation Request Submitted"));
  assert.doesNotMatch(
    JSON.stringify(audits.docs.map((document) => document.data())),
    /The event plan changed/u,
  );
}

async function createStandaloneRequest(fixture, input) {
  const eventId = `event_refund_${input.suffix}`;
  const requestId = `request_refund_${input.suffix}`;
  await seedMainEvent({
    eventId,
    customerId: input.customerId ?? fixture.customer.uid,
    status: input.mainEventStatus ?? "confirmed",
    providerRequestIds: [requestId],
  });
  await seedProviderRequest({
    requestId,
    eventId,
    customerId: input.customerId ?? fixture.customer.uid,
    providerId: fixture.providerA,
    status: input.status,
    downPaymentAmount: input.downPaymentAmount,
    paymentStatus: input.paymentStatus,
    paidAt: input.paidAt,
    evidenceKind: input.evidenceKind,
  });
  return {eventId, requestId};
}

function seedMainEvent(input) {
  return db.collection("mainEvents").doc(input.eventId).set({
    bookingId: input.eventId,
    mainEventId: input.eventId,
    customerId: input.customerId,
    status: input.status,
    providerRequestIds: input.providerRequestIds,
    recoveryStatus: "none",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

function seedProviderRequest(input) {
  const evidence = input.evidenceKind === "legacy"
    ? {}
    : input.evidenceKind === "invalid"
      ? {refundPolicySnapshot: policySnapshot(input.providerId)}
      : policyEvidence(input.providerId);
  const data = {
    providerRequestId: input.requestId,
    bookingId: input.eventId,
    mainEventId: input.eventId,
    customerId: input.customerId,
    providerId: input.providerId,
    type: "addon",
    status: input.status,
    amount: 1_000,
    downPaymentAmount: input.downPaymentAmount,
    remainingBalance: 1_000 - input.downPaymentAmount,
    guestCount: 50,
    paymentStatus: input.paymentStatus ?? "unpaid",
    paidAt: input.paidAt ?? null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...evidence,
  };
  if (input.paymentStatus === "processing" || input.paymentStatus === "paid") {
    data.paymentId = paymentIdForProviderRequest(input.requestId);
  }
  return db.collection("providerRequests").doc(input.requestId).set(data);
}

function seedPayment(input) {
  const paymentId = paymentIdForProviderRequest(input.requestId);
  return db.collection("payments").doc(paymentId).set({
    paymentId,
    providerRequestId: input.requestId,
    bookingId: input.eventId,
    mainEventId: input.eventId,
    customerId: input.customerId,
    providerId: input.providerId,
    amount: input.amount,
    amountInCentavos: input.amount * 100,
    currency: "PHP",
    paymentType: "provider_down_payment",
    gateway: "paymongo",
    status: input.status,
    checkoutCreationStatus: input.status === "processing" ? "created" : null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

function policyEvidence(providerId) {
  const snapshot = policySnapshot(providerId);
  return {
    refundPolicySnapshot: snapshot,
    refundPolicyAgreement: {
      schemaVersion: 1,
      policyKey: snapshot.policyKey,
      agreedAt: Timestamp.now(),
      channel: "booking_submission",
    },
    refundEligibilityState: {
      schemaVersion: 1,
      currentStage: "preparation_not_started",
      stageSequence: 0,
      enteredAt: Timestamp.now(),
      activeCancellationRequestId: null,
    },
  };
}

function policySnapshot(providerId) {
  return {
    schemaVersion: 1,
    policyKey: `provider_default:${providerId}:v1`,
    source: {
      kind: "provider_default",
      sourceId: providerId,
      policyVersion: 1,
    },
    rules: [
      {stage: "preparation_not_started", refundBasisPoints: 10_000},
      {stage: "preparation_started", refundBasisPoints: 5_000},
      {stage: "service_started", refundBasisPoints: 0},
    ],
    terms: null,
    capturedAt: Timestamp.now(),
  };
}

function seedProvider(providerId, ownerId) {
  return db.collection("providers").doc(providerId).set({
    id: providerId,
    ownerId,
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
  });
}

function seedUser(uid, role, providerId = null) {
  return db.collection("users").doc(uid).set({
    uid,
    role,
    providerId,
    accountStatus: "active",
    isActive: true,
    isBlocked: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

function stageInput(providerRequestId, idempotencyKey) {
  return {
    providerRequestId,
    targetStage: "preparation_started",
    evidence: "Provider confirmed preparation began.",
    idempotencyKey,
  };
}

function cancellationInput(providerRequestId, idempotencyKey) {
  return {
    providerRequestId,
    reason: "The event plan changed and this service is no longer needed.",
    idempotencyKey,
  };
}

async function callFunction(name, user, data) {
  const response = await fetch(
    `http://${functionsHost}/${projectId}/asia-southeast1/${name}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await user.getIdToken(true)}`,
      },
      body: JSON.stringify({data}),
    },
  );
  const body = await response.json();
  if (!response.ok || body.error) {
    const error = new Error(body.error?.message ?? "Callable failed");
    error.status = body.error?.status ?? String(response.status);
    error.details = body.error?.details ?? null;
    throw error;
  }
  return body.result;
}

function hasStatus(status) {
  return (error) => error.status === status;
}

function hasReason(reason) {
  return (error) => error.details?.reason === reason;
}

function requiredEnv(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required.`);
  return value;
}
