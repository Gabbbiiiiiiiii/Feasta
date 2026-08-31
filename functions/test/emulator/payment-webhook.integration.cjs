const assert = require("node:assert/strict");
const path = require("node:path");
const {
  initializeApp,
  deleteApp,
} = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
} = require("firebase-admin/firestore");

const projectId = process.env.GCLOUD_PROJECT ??
  "demo-feasta-phase3";
const app = initializeApp({projectId});
const db = getFirestore(app);
const libRoot = process.env.FEASTA_FUNCTIONS_LIB_DIR ??
  path.resolve(__dirname, "../../lib");

(async () => {
  const {
    processPayMongoWebhook,
  } = require(path.join(
    libRoot,
    "payments/process-webhook.js",
  ));
  const {
    paymentIdForProviderRequest,
  } = require(path.join(
    libRoot,
    "payments/payment-lifecycle.js",
  ));

  try {
    await paidAndReplayTest({
      processPayMongoWebhook,
      paymentIdForProviderRequest,
    });
    await gatewayFactValidationTests({
      processPayMongoWebhook,
      paymentIdForProviderRequest,
    });
    await failedPaymentRecoveryTest({
      processPayMongoWebhook,
      paymentIdForProviderRequest,
    });
    await lifecycleConflictTests({
      processPayMongoWebhook,
      paymentIdForProviderRequest,
    });
    await awaitingCancellationSettlementTest({
      processPayMongoWebhook,
      paymentIdForProviderRequest,
    });

    console.log(
      "Payment webhook emulator integration passed.",
    );
  } finally {
    await deleteApp(app);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function paidAndReplayTest(input) {
  const seeded = await seed(
    input.paymentIdForProviderRequest,
    "paid-replay",
  );
  const paid = eventBody({
    eventId: "evt_paid_replay",
    paymentId: seeded.paymentId,
  });
  assert.deepEqual(
    await input.processPayMongoWebhook(paid),
    {duplicate: false, applied: true},
  );
  const payment = (
    await db.doc(`payments/${seeded.paymentId}`).get()
  ).data();
  assert.equal(payment.status, "paid");
  assert.ok(
    payment.paidAt instanceof Timestamp,
    "paidAt must be backend-generated",
  );
  const request = (
    await db.doc(
      `providerRequests/${seeded.providerRequestId}`,
    ).get()
  ).data();
  assert.equal(request.status, "confirmed");
  assert.equal(request.paymentStatus, "paid");
  assert.equal((
    await db.doc(`mainEvents/${seeded.mainEventId}`).get()
  ).data().status, "confirmed");

  const logsBefore = (
    await db.collection("adminLogs").get()
  ).size;
  const notificationsBefore = (
    await db.collection("notifications").get()
  ).size;
  const timelineBefore = (
    await db.collection("mainEvents")
      .doc(seeded.mainEventId)
      .collection("timeline")
      .get()
  ).size;
  assert.deepEqual(
    await input.processPayMongoWebhook(paid),
    {
      duplicate: true,
      applied: false,
      reason: "webhook_already_processed",
    },
  );
  assert.equal((
    await db.collection("adminLogs").get()
  ).size, logsBefore);
  assert.equal((
    await db.collection("notifications").get()
  ).size, notificationsBefore);
  assert.equal((
    await db.collection("mainEvents")
      .doc(seeded.mainEventId)
      .collection("timeline")
      .get()
  ).size, timelineBefore);
}

async function gatewayFactValidationTests(input) {
  const amount = await seed(
    input.paymentIdForProviderRequest,
    "wrong-gateway-amount",
  );
  assert.equal((
    await input.processPayMongoWebhook(eventBody({
      eventId: "evt_wrong_gateway_amount",
      paymentId: amount.paymentId,
      amount: 1,
    }))
  ).reason, "amount_mismatch");
  assert.equal((
    await db.doc(`payments/${amount.paymentId}`).get()
  ).data().status, "processing");

  const currency = await seed(
    input.paymentIdForProviderRequest,
    "wrong-gateway-currency",
  );
  assert.equal((
    await input.processPayMongoWebhook(eventBody({
      eventId: "evt_wrong_gateway_currency",
      paymentId: currency.paymentId,
      currency: "USD",
    }))
  ).reason, "currency_mismatch");

  const authoritativeAmount = await seed(
    input.paymentIdForProviderRequest,
    "wrong-authoritative-amount",
  );
  await db.doc(
    `providerRequests/${authoritativeAmount.providerRequestId}`,
  ).update({downPaymentAmount: 14000});
  assert.equal((
    await input.processPayMongoWebhook(eventBody({
      eventId: "evt_wrong_authoritative_amount",
      paymentId: authoritativeAmount.paymentId,
    }))
  ).reason, "authoritative_amount_mismatch");

  const linkage = await seed(
    input.paymentIdForProviderRequest,
    "wrong-linkage",
  );
  await db.doc(
    `providerRequests/${linkage.providerRequestId}`,
  ).update({providerId: "provider-forged-linkage"});
  assert.equal((
    await input.processPayMongoWebhook(eventBody({
      eventId: "evt_wrong_linkage",
      paymentId: linkage.paymentId,
    }))
  ).reason, "canonical_linkage_mismatch");

  const owner = await seed(
    input.paymentIdForProviderRequest,
    "wrong-owner",
  );
  await db.doc(`mainEvents/${owner.mainEventId}`)
    .update({customerId: "another-customer"});
  assert.equal((
    await input.processPayMongoWebhook(eventBody({
      eventId: "evt_wrong_owner",
      paymentId: owner.paymentId,
    }))
  ).reason, "canonical_linkage_mismatch");
}

async function failedPaymentRecoveryTest(input) {
  const seeded = await seed(
    input.paymentIdForProviderRequest,
    "failed-recovery",
    {
      paymentStatus: "failed",
      requestStatus:
        "waiting_for_down_payment",
      requestPaymentStatus: "failed",
    },
  );
  assert.deepEqual(
    await input.processPayMongoWebhook(eventBody({
      eventId: "evt_failed_recovery",
      paymentId: seeded.paymentId,
    })),
    {duplicate: false, applied: true},
  );
  assert.equal((
    await db.doc(`payments/${seeded.paymentId}`).get()
  ).data().status, "paid");
  assert.equal((
    await db.doc(
      `providerRequests/${seeded.providerRequestId}`,
    ).get()
  ).data().status, "confirmed");
}

async function lifecycleConflictTests(input) {
  const cancelledRequest = await seed(
    input.paymentIdForProviderRequest,
    "cancelled-request",
    {requestStatus: "cancelled"},
  );
  const notificationsBefore = (
    await db.collection("notifications").get()
  ).size;
  const requestConflict =
    await input.processPayMongoWebhook(eventBody({
      eventId: "evt_cancelled_request",
      paymentId: cancelledRequest.paymentId,
    }));
  assert.deepEqual(requestConflict, {
    duplicate: false,
    applied: true,
    conflict: true,
    reason: "provider_request_lifecycle_conflict",
  });
  assert.equal((
    await db.doc(
      `payments/${cancelledRequest.paymentId}`,
    ).get()
  ).data().status, "paid");
  assert.equal((
    await db.doc(
      `providerRequests/${cancelledRequest.providerRequestId}`,
    ).get()
  ).data().status, "cancelled");
  assert.equal((
    await db.collection("notifications").get()
  ).size, notificationsBefore);
  const requestTimeline = await db
    .collection("mainEvents")
    .doc(cancelledRequest.mainEventId)
    .collection("timeline")
    .get();
  assert.equal(requestTimeline.size, 1);
  assert.equal(
    requestTimeline.docs[0].data().type,
    "payment_lifecycle_conflict",
  );

  const cancelledEvent = await seed(
    input.paymentIdForProviderRequest,
    "cancelled-event",
    {mainEventStatus: "cancelled"},
  );
  const eventConflict =
    await input.processPayMongoWebhook(eventBody({
      eventId: "evt_cancelled_event",
      paymentId: cancelledEvent.paymentId,
    }));
  assert.deepEqual(eventConflict, {
    duplicate: false,
    applied: true,
    conflict: true,
    reason: "main_event_lifecycle_conflict",
  });
  assert.equal((
    await db.doc(
      `payments/${cancelledEvent.paymentId}`,
    ).get()
  ).data().status, "paid");
  assert.equal((
    await db.doc(
      `providerRequests/${cancelledEvent.providerRequestId}`,
    ).get()
  ).data().status, "payment_processing");
  assert.equal((
    await db.doc(
      `mainEvents/${cancelledEvent.mainEventId}`,
    ).get()
  ).data().status, "cancelled");

  const logsBeforeReplay = (
    await db.collection("adminLogs").get()
  ).size;
  const conflictTimelineBeforeReplay = (
    await db.collection("mainEvents")
      .doc(cancelledEvent.mainEventId)
      .collection("timeline")
      .get()
  ).size;
  assert.deepEqual(
    await input.processPayMongoWebhook(eventBody({
      eventId: "evt_cancelled_event",
      paymentId: cancelledEvent.paymentId,
    })),
    {
      duplicate: true,
      applied: false,
      reason: "webhook_already_processed",
    },
  );
  assert.equal((
    await db.collection("adminLogs").get()
  ).size, logsBeforeReplay);
  assert.equal((
    await db.collection("mainEvents")
      .doc(cancelledEvent.mainEventId)
      .collection("timeline")
      .get()
  ).size, conflictTimelineBeforeReplay);
}

async function awaitingCancellationSettlementTest(input) {
  const seeded = await seed(
    input.paymentIdForProviderRequest,
    "awaiting-cancellation",
  );
  const cancellationRequestId = "cancellation-awaiting-payment";
  const now = Timestamp.now();
  const requestReference = db.doc(
    `providerRequests/${seeded.providerRequestId}`,
  );
  const request = (await requestReference.get()).data();
  await requestReference.update({
    refundPolicySnapshot: {
      schemaVersion: 1,
      policyKey: `provider_default:${request.providerId}:v1`,
      source: {
        kind: "provider_default",
        sourceId: request.providerId,
        policyVersion: 1,
      },
      rules: [
        {stage: "preparation_not_started", refundBasisPoints: 10_000},
        {stage: "preparation_started", refundBasisPoints: 5_000},
        {stage: "service_started", refundBasisPoints: 0},
      ],
      terms: null,
      capturedAt: now,
    },
    refundPolicyAgreement: {
      schemaVersion: 1,
      policyKey: `provider_default:${request.providerId}:v1`,
      agreedAt: now,
      channel: "booking_submission",
    },
    refundEligibilityState: {
      schemaVersion: 1,
      currentStage: "preparation_not_started",
      stageSequence: 0,
      enteredAt: now,
      activeCancellationRequestId: cancellationRequestId,
    },
  });
  await db.doc(
    `providerRequestCancellationRequests/${cancellationRequestId}`,
  ).set({
    schemaVersion: 1,
    mainEventId: seeded.mainEventId,
    providerRequestId: seeded.providerRequestId,
    customerId: "customer-webhook-test",
    providerId: request.providerId,
    status: "awaiting_payment_resolution",
    reason: "Await original payment settlement.",
    policyEvidenceStatus: "policy_backed",
    frozenEligibility: {
      stage: "preparation_not_started",
      stageSequence: 0,
      frozenAt: now,
    },
    submittedAt: now,
    updatedAt: now,
    decision: null,
    refundCalculation: null,
    refundOperationId: null,
    refundOperationIds: [],
  });
  const result = await input.processPayMongoWebhook(eventBody({
    eventId: "evt_awaiting_cancellation_paid",
    paymentId: seeded.paymentId,
  }));
  assert.equal(result.applied, true);
  assert.equal((await db.doc(
    `providerRequestCancellationRequests/${cancellationRequestId}`,
  ).get()).data().status, "submitted");
  assert.equal((await requestReference.get()).data().status, "confirmed");
  assert.equal((await requestReference.get()).data()
    .refundEligibilityState.activeCancellationRequestId,
  cancellationRequestId);
}

async function seed(paymentIdForProviderRequest, suffix, overrides = {}) {
  const mainEventId = `event-${suffix}`;
  const providerRequestId = `request-${suffix}`;
  const providerId = `provider-${suffix}`;
  const providerOwnerId = `owner-${suffix}`;
  const paymentId =
    paymentIdForProviderRequest(providerRequestId);
  const amount = 13500;
  const batch = db.batch();
  batch.set(db.doc(`payments/${paymentId}`), {
    paymentId,
    bookingId: mainEventId,
    mainEventId,
    providerRequestId,
    customerId: "customer-webhook-test",
    providerId,
    amount,
    amountInCentavos: amount * 100,
    currency: "PHP",
    paymentType: "provider_down_payment",
    gateway: "paymongo",
    status: overrides.paymentStatus ?? "processing",
    paidAt: null,
  });
  batch.set(db.doc(`mainEvents/${mainEventId}`), {
    mainEventId,
    bookingId: mainEventId,
    customerId: "customer-webhook-test",
    providerRequestIds: [providerRequestId],
    status:
      overrides.mainEventStatus ??
      "waiting_for_down_payment",
  });
  batch.set(db.doc(`providerRequests/${providerRequestId}`), {
    providerRequestId,
    mainEventId,
    bookingId: mainEventId,
    customerId: "customer-webhook-test",
    providerId,
    paymentId,
    downPaymentAmount: amount,
    status:
      overrides.requestStatus ??
      "payment_processing",
    paymentStatus:
      overrides.requestPaymentStatus ??
      "processing",
  });
  batch.set(db.doc(`providers/${providerId}`), {
    ownerId: providerOwnerId,
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
  });
  batch.set(db.doc(`users/${providerOwnerId}`), {
    role: "provider",
    providerId,
    accountStatus: "active",
    isActive: true,
    isBlocked: false,
  });
  await batch.commit();
  return {
    paymentId,
    mainEventId,
    providerRequestId,
  };
}

function eventBody({
  eventId,
  paymentId,
  amount = 1350000,
  currency = "PHP",
}) {
  return Buffer.from(JSON.stringify({
    data: {
      id: eventId,
      type: "event",
      attributes: {
        type: "payment.paid",
        data: {
          id: `pay_${eventId}`,
          type: "payment",
          attributes: {
            amount,
            currency,
            metadata: {
              payment_id: paymentId,
            },
          },
        },
      },
    },
  }));
}
