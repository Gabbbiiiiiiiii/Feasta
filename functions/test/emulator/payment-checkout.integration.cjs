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
    createPaymentSessionForCustomer,
  } = require(path.join(
    libRoot,
    "payments/create-payment-session.js",
  ));
  const {
    paymentIdForProviderRequest,
  } = require(path.join(
    libRoot,
    "payments/payment-lifecycle.js",
  ));
  const {
    PayMongoRequestError,
  } = require(path.join(
    libRoot,
    "payments/paymongo-client.js",
  ));
  const {
    cancellationRequestIdForAttempt,
  } = require(path.join(
    libRoot,
    "cancellations/refund-cancellation-domain.js",
  ));

  try {
    await concurrentCheckoutTest({
      createPaymentSessionForCustomer,
      paymentIdForProviderRequest,
      PayMongoRequestError,
    });
    await cachedCheckoutGuardTests({
      createPaymentSessionForCustomer,
      cancellationRequestIdForAttempt,
    });
    await ambiguousFailureTest({
      createPaymentSessionForCustomer,
      paymentIdForProviderRequest,
      PayMongoRequestError,
    });
    await independentProviderTest({
      createPaymentSessionForCustomer,
      paymentIdForProviderRequest,
    });
    await ownershipTest({
      createPaymentSessionForCustomer,
    });
    await durableAttemptTests({createPaymentSessionForCustomer, paymentIdForProviderRequest,
      PayMongoRequestError});

    console.log(
      "Payment checkout emulator integration passed.",
    );
  } finally {
    await deleteApp(app);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function concurrentCheckoutTest(input) {
  const eventId = "event-concurrent-checkout";
  const requestId = "request-concurrent-checkout";
  const providerId = "provider-concurrent-checkout";
  await seedEvent({
    eventId,
    requests: [{requestId, providerId}],
  });

  let callCount = 0;
  let releaseCalls;
  const bothCallsReady = new Promise((resolve) => {
    releaseCalls = resolve;
  });
  const gatewayInputs = [];
  const createCheckout = async (gatewayInput) => {
    gatewayInputs.push(gatewayInput);
    callCount += 1;
    const invocation = callCount;
    if (callCount === 2) releaseCalls();
    await bothCallsReady;
    if (invocation === 2) {
      throw new input.PayMongoRequestError(
        "simulated timeout",
        "ambiguous",
      );
    }
    return {
      id: "cs_concurrent_checkout",
      checkoutUrl:
        "https://checkout.paymongo.com/concurrent-checkout",
    };
  };

  const results = await Promise.allSettled([
    createSession(input.createPaymentSessionForCustomer, {
      requestId,
      clientKey: "concurrent-key-one",
      createCheckout,
    }),
    createSession(input.createPaymentSessionForCustomer, {
      requestId,
      clientKey: "concurrent-key-two",
      createCheckout,
    }),
  ]);

  assert.equal(callCount, 2);
  assert.ok(
    results.some((result) => result.status === "fulfilled"),
    "one concurrent invocation must preserve the live checkout",
  );
  assert.equal(
    new Set(gatewayInputs.map((value) => value.idempotencyKey)).size,
    1,
    "all gateway attempts must use the deterministic payment id",
  );

  const paymentId =
    input.paymentIdForProviderRequest(requestId);
  const payment = (
    await db.doc(`payments/${paymentId}`).get()
  ).data();
  const request = (
    await db.doc(`providerRequests/${requestId}`).get()
  ).data();
  assert.equal(payment.status, "processing");
  const attempts = await db.collection(`payments/${paymentId}/checkoutAttempts`).get();
  assert.equal(attempts.size, 1, "concurrent calls share one durable attempt");
  assert.equal(attempts.docs[0].data().paymongoCheckoutId, "cs_concurrent_checkout");
  assert.equal(new Set(gatewayInputs.map(value => value.checkoutAttemptId)).size, 1);
  assert.equal(payment.checkoutCreationStatus, "created");
  assert.equal(payment.checkoutUrl,
    "https://checkout.paymongo.com/concurrent-checkout");
  assert.equal(request.status, "payment_processing");
  assert.equal(request.paymentStatus, "processing");

  const cached = await createSession(
    input.createPaymentSessionForCustomer,
    {
      requestId,
      clientKey: "cached-revalidation-key",
      createCheckout: async () => {
        throw new Error("cached checkout called gateway");
      },
    },
  );
  assert.equal(cached.checkoutUrl, payment.checkoutUrl);
  assert.equal(cached.created, false);
}

async function cachedCheckoutGuardTests(input) {
  const cancellationLocked = {
    eventId: "event-cancellation-locked-checkout",
    requestId: "request-cancellation-locked-checkout",
    providerId: "provider-cancellation-locked-checkout",
  };
  await seedEvent({
    eventId: cancellationLocked.eventId,
    requests: [cancellationLocked],
  });
  const cancellationRequestId = input.cancellationRequestIdForAttempt({
    providerRequestId: cancellationLocked.requestId,
    customerId: "customer-payment-test",
    operationKey: "checkout-lock-operation",
  });
  await db.doc(`providerRequests/${cancellationLocked.requestId}`).update({
    activeCancellationRequestId: cancellationRequestId,
  });
  await db.collection("providerRequestCancellationRequests")
    .doc(cancellationRequestId)
    .set({
      providerRequestId: cancellationLocked.requestId,
      status: "submitted",
    });
  await assert.rejects(
    createSession(input.createPaymentSessionForCustomer, {
      requestId: cancellationLocked.requestId,
      clientKey: "cancellation-locked-checkout",
      createCheckout: unexpectedGateway,
    }),
    (error) => error.code === "failed-precondition",
  );

  const cancelledRequest = {
    eventId: "event-cancelled-request-cache",
    requestId: "request-cancelled-cache",
    providerId: "provider-cancelled-cache",
  };
  await seedEvent({
    eventId: cancelledRequest.eventId,
    requests: [cancelledRequest],
  });
  await createSession(input.createPaymentSessionForCustomer, {
    requestId: cancelledRequest.requestId,
    clientKey: "cancelled-cache-create",
  });
  await db.doc(
    `providerRequests/${cancelledRequest.requestId}`,
  ).update({status: "cancelled"});
  await assert.rejects(
    createSession(input.createPaymentSessionForCustomer, {
      requestId: cancelledRequest.requestId,
      clientKey: "cancelled-cache-reuse",
      createCheckout: unexpectedGateway,
    }),
    (error) => error.code === "failed-precondition",
  );

  const cancelledEvent = {
    eventId: "event-cancelled-parent-cache",
    requestId: "request-cancelled-parent-cache",
    providerId: "provider-cancelled-parent-cache",
  };
  await seedEvent({
    eventId: cancelledEvent.eventId,
    requests: [cancelledEvent],
  });
  await createSession(input.createPaymentSessionForCustomer, {
    requestId: cancelledEvent.requestId,
    clientKey: "cancelled-parent-create",
  });
  await db.doc(
    `mainEvents/${cancelledEvent.eventId}`,
  ).update({status: "cancelled"});
  await assert.rejects(
    createSession(input.createPaymentSessionForCustomer, {
      requestId: cancelledEvent.requestId,
      clientKey: "cancelled-parent-reuse",
      createCheckout: unexpectedGateway,
    }),
    (error) => error.code === "failed-precondition",
  );
}

async function ambiguousFailureTest(input) {
  const eventId = "event-ambiguous-checkout";
  const requestId = "request-ambiguous-checkout";
  const providerId = "provider-ambiguous-checkout";
  await seedEvent({
    eventId,
    requests: [{requestId, providerId}],
  });

  await assert.rejects(
    createSession(input.createPaymentSessionForCustomer, {
      requestId,
      clientKey: "ambiguous-checkout-key",
      createCheckout: async () => {
        throw new input.PayMongoRequestError(
          "simulated timeout",
          "ambiguous",
        );
      },
    }),
    (error) => error.code === "unavailable",
  );

  const paymentId =
    input.paymentIdForProviderRequest(requestId);
  const payment = (
    await db.doc(`payments/${paymentId}`).get()
  ).data();
  const request = (
    await db.doc(`providerRequests/${requestId}`).get()
  ).data();
  assert.equal(payment.status, "pending");
  assert.equal(payment.checkoutCreationStatus, "unknown");
  assert.equal(request.status, "waiting_for_down_payment");
  assert.notEqual(request.paymentStatus, "failed");

  const notSentRequestId = "request-not-sent-checkout";
  await seedEvent({
    eventId: "event-not-sent-checkout",
    requests: [{
      requestId: notSentRequestId,
      providerId: "provider-not-sent-checkout",
    }],
  });
  await assert.rejects(
    createSession(input.createPaymentSessionForCustomer, {
      requestId: notSentRequestId,
      clientKey: "not-sent-checkout-key",
      createCheckout: async () => {
        throw new input.PayMongoRequestError(
          "simulated local configuration failure",
          "not_sent",
        );
      },
    }),
    (error) => error.code === "unavailable",
  );
  const notSentPaymentId =
    input.paymentIdForProviderRequest(
      notSentRequestId,
    );
  const notSentPayment = (
    await db.doc(`payments/${notSentPaymentId}`).get()
  ).data();
  const notSentRequest = (
    await db.doc(
      `providerRequests/${notSentRequestId}`,
    ).get()
  ).data();
  assert.equal(notSentPayment.status, "pending");
  assert.equal(
    notSentPayment.checkoutCreationStatus,
    "not_sent",
  );
  assert.equal(
    notSentRequest.status,
    "waiting_for_down_payment",
  );
  assert.notEqual(
    notSentRequest.paymentStatus,
    "failed",
  );
}

async function independentProviderTest(input) {
  const eventId = "event-independent-payments";
  const requests = [
    {
      requestId: "request-independent-photo",
      providerId: "provider-independent-photo",
      amount: 5000,
    },
    {
      requestId: "request-independent-catering",
      providerId: "provider-independent-catering",
      amount: 10000,
    },
  ];
  await seedEvent({eventId, requests});

  const first = await createSession(
    input.createPaymentSessionForCustomer,
    {
      requestId: requests[0].requestId,
      clientKey: "independent-photo-key",
      checkoutId: "cs_independent_photo",
    },
  );
  let event = (
    await db.doc(`mainEvents/${eventId}`).get()
  ).data();
  assert.equal(event.waitingPaymentProviderRequestCount, 1);
  assert.equal(event.paymentProcessingProviderRequestCount, 1);

  const second = await createSession(
    input.createPaymentSessionForCustomer,
    {
      requestId: requests[1].requestId,
      clientKey: "independent-catering-key",
      checkoutId: "cs_independent_catering",
    },
  );
  assert.notEqual(first.paymentId, second.paymentId);
  assert.equal(
    first.paymentId,
    input.paymentIdForProviderRequest(requests[0].requestId),
  );
  assert.equal(
    second.paymentId,
    input.paymentIdForProviderRequest(requests[1].requestId),
  );
  event = (
    await db.doc(`mainEvents/${eventId}`).get()
  ).data();
  assert.equal(event.waitingPaymentProviderRequestCount, 0);
  assert.equal(event.paymentProcessingProviderRequestCount, 2);
}

async function ownershipTest(input) {
  const requestId = "request-owned-checkout";
  await seedEvent({
    eventId: "event-owned-checkout",
    requests: [{
      requestId,
      providerId: "provider-owned-checkout",
    }],
  });
  await assert.rejects(
    input.createPaymentSessionForCustomer({
      customerId: "another-customer",
      providerRequestId: requestId,
      clientKey: "cross-customer-key",
      secretKey: "stub-secret",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      createCheckout: unexpectedGateway,
    }),
    (error) => error.code === "permission-denied",
  );
}

async function durableAttemptTests(input) {
  const requestId = "request-durable-attempts";
  await seedEvent({eventId: "event-durable-attempts",
    requests: [{requestId, providerId: "provider-durable-attempts"}]});
  const paymentId = input.paymentIdForProviderRequest(requestId);
  const paymentRef = db.doc(`payments/${paymentId}`);
  const attemptsRef = paymentRef.collection("checkoutAttempts");
  const calls = [];
  const ambiguous = async value => {
    calls.push(value);
    const saved = await attemptsRef.doc(value.checkoutAttemptId).get();
    assert.equal(saved.exists, true, "attempt must exist before dispatch");
    assert.ok(saved.data().firstDispatchAt instanceof Timestamp);
    assert.equal(saved.data().resolution, "unresolved");
    throw new input.PayMongoRequestError("ambiguous", "ambiguous");
  };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(createSession(input.createPaymentSessionForCustomer,
      {requestId, clientKey: `durable-${i}`, createCheckout: ambiguous}),
    error => error.code === "unavailable");
  }
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.equal(calls[0].checkoutAttemptId, calls[1].checkoutAttemptId);
  assert.equal((await attemptsRef.get()).size, 1);
  const oldRef = attemptsRef.doc(calls[0].checkoutAttemptId);
  const firstDispatch = (await oldRef.get()).data().firstDispatchAt;
  await oldRef.update({idempotencyKey: "corrupted-key"});
  await assert.rejects(createSession(input.createPaymentSessionForCustomer,
    {requestId, clientKey: "durable-corrupt-key", createCheckout: unexpectedGateway}),
  error => error.code === "failed-precondition");
  await oldRef.update({idempotencyKey: calls[0].idempotencyKey});
  await oldRef.update({firstDispatchAt: Timestamp.fromMillis(Date.now() - 24 * 3600000)});
  await assert.rejects(createSession(input.createPaymentSessionForCustomer,
    {requestId, clientKey: "durable-too-old", createCheckout: unexpectedGateway}),
  error => error.code === "failed-precondition");
  assert.equal((await oldRef.get()).data().resolution, "unresolved");
  assert.equal((await attemptsRef.get()).size, 1);
  const {readCheckoutAttemptResolution, reconcileCheckoutAttempts} = require(path.join(
    libRoot, "payments/checkout-attempt-reconciliation.js"));
  for (const resolution of ["failed", "expired"]) {
    await oldRef.update({resolution});
    await assert.rejects(createSession(input.createPaymentSessionForCustomer,
      {requestId, clientKey: `durable-unproven-${resolution}`, createCheckout: unexpectedGateway}),
    error => error.code === "failed-precondition");
    assert.equal((await readCheckoutAttemptResolution(paymentId)).resolution, "unresolved");
    assert.equal((await attemptsRef.get()).size, 1);
  }
  // Synthetic trusted issuer fixture. No production adapter currently issues proof.
  const terminalEvidence = {schemaVersion: 1, authority: "paymongo",
    outcome: "terminal_unsuccessful", irreversible: true, exhaustive: true,
    evidenceReference: "test-authoritative-settlement", paymentId,
    attemptId: oldRef.id, checkoutId: "cs_terminal_fixture", paymentIntentIds: [], paymentIds: []};
  await oldRef.update({paymongoCheckoutId: "cs_terminal_fixture"});
  for (const malformed of ["test-authoritative-settlement", {},
    {...terminalEvidence, attemptId: "another-attempt"},
    {...terminalEvidence, exhaustive: false}]) {
    await oldRef.update({terminalEvidence: malformed});
    await assert.rejects(createSession(input.createPaymentSessionForCustomer,
      {requestId, clientKey: "durable-malformed-proof", createCheckout: unexpectedGateway}),
    error => error.code === "failed-precondition");
    assert.equal((await readCheckoutAttemptResolution(paymentId)).resolution, "unresolved");
    assert.equal((await attemptsRef.get()).size, 1);
  }
  await oldRef.update({terminalEvidence});
  assert.equal((await readCheckoutAttemptResolution(paymentId)).resolution, "definitely_unpaid");
  let newInput;
  await createSession(input.createPaymentSessionForCustomer, {requestId, clientKey: "durable-new",
    createCheckout: async value => {
      newInput = value;
      return {id: "cs_durable_new", checkoutUrl: "https://checkout.paymongo.com/durable-new"};
    }});
  assert.notEqual(newInput.checkoutAttemptId, calls[0].checkoutAttemptId);
  assert.notEqual(newInput.idempotencyKey, calls[0].idempotencyKey);
  assert.equal((await attemptsRef.get()).size, 2);
  assert.ok((await attemptsRef.doc(newInput.checkoutAttemptId).get()).data()
    .firstDispatchAt.toMillis() >= firstDispatch.toMillis());
  assert.equal((await oldRef.get()).exists, true);
  assert.equal((await readCheckoutAttemptResolution(paymentId)).resolution, "unresolved");
  for (const resolution of ["failed", "expired"]) {
    await oldRef.update({resolution, terminalEvidence: {}});
    await assert.rejects(createSession(input.createPaymentSessionForCustomer,
      {requestId, clientKey: `durable-older-unproven-${resolution}`, createCheckout: unexpectedGateway}),
    error => error.code === "failed-precondition");
    assert.equal((await attemptsRef.get()).size, 2);
  }
  await oldRef.update({resolution: "unresolved"});
  await assert.rejects(createSession(input.createPaymentSessionForCustomer,
    {requestId, clientKey: "durable-older-unknown", createCheckout: unexpectedGateway}),
  error => error.code === "failed-precondition");
  const resolution = await reconcileCheckoutAttempts({paymentId, secretKey: "test-secret",
    retrieve: async () => {throw new Error("network down");}});
  assert.equal(resolution.resolution, "unresolved");
  assert.equal(resolution.attempts.length, 2);

  // Legacy records have no invented attempts or gateway completion timestamp.
  const legacyId = "legacy-checkout-resolution";
  await db.doc(`payments/${legacyId}`).set({status: "expired", paidAt: Timestamp.now(),
    paymongoCheckoutId: "cs_legacy"});
  const legacy = await readCheckoutAttemptResolution(legacyId);
  assert.equal(legacy.historyComplete, false);
  assert.equal(legacy.resolution, "unresolved");
  assert.equal(legacy.attempts.length, 0);
  assert.equal(legacy.successfulPayments.length, 0);
}

async function createSession(createPaymentSessionForCustomer, input) {
  return createPaymentSessionForCustomer({
    customerId: "customer-payment-test",
    providerRequestId: input.requestId,
    clientKey: input.clientKey,
    secretKey: "stub-secret",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    createCheckout: input.createCheckout ??
      (async () => ({
        id: input.checkoutId ?? `cs_${input.requestId}`,
        checkoutUrl:
          `https://checkout.paymongo.com/${input.requestId}`,
      })),
  });
}

async function seedEvent(input) {
  const batch = db.batch();
  batch.set(db.doc(`mainEvents/${input.eventId}`), {
    mainEventId: input.eventId,
    bookingId: input.eventId,
    customerId: "customer-payment-test",
    providerRequestIds:
      input.requests.map((request) => request.requestId),
    status: "waiting_for_down_payment",
  });

  for (const request of input.requests) {
    const amount = request.amount ?? 13500;
    const ownerId = `owner-${request.providerId}`;
    batch.set(
      db.doc(`providerRequests/${request.requestId}`),
      {
        providerRequestId: request.requestId,
        mainEventId: input.eventId,
        bookingId: input.eventId,
        customerId: "customer-payment-test",
        providerId: request.providerId,
        downPaymentAmount: amount,
        status: "waiting_for_down_payment",
        paymentStatus: "unpaid",
      },
    );
    batch.set(db.doc(`providers/${request.providerId}`), {
      ownerId,
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
      isDeleted: false,
    });
    batch.set(db.doc(`users/${ownerId}`), {
      role: "provider",
      providerId: request.providerId,
      accountStatus: "active",
      isActive: true,
      isBlocked: false,
    });
  }

  await batch.commit();
}

async function unexpectedGateway() {
  throw new Error("gateway must not be called");
}
