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
    paymentIdForProviderRequestChoice,
  } = require(path.join(
    libRoot,
    "payments/payment-obligation.js",
  ));

  const paymentIdForProviderRequest =
    (providerRequestId) =>
      paymentIdForProviderRequestChoice(
        providerRequestId,
        "minimum",
      );
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
    await allAssignedProvidersAcceptedTest({
      createPaymentSessionForCustomer,
    });
    await ambiguousFailureTest({
      createPaymentSessionForCustomer,
      paymentIdForProviderRequest,
      PayMongoRequestError,
    });

    await initialChoiceExclusivityTest({
      createPaymentSessionForCustomer,
      paymentIdForProviderRequestChoice,
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
    await p6CheckoutTests({createPaymentSessionForCustomer, paymentIdForProviderRequestChoice,
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

async function allAssignedProvidersAcceptedTest(input) {
  const blockedStatuses = [
    "pending",
    "rejected",
    "cancelled",
    "expired",
  ];

  for (const blockedStatus of blockedStatuses) {
    const eventId =
      `event-all-provider-gate-${blockedStatus}`;
    const readyRequestId =
      `request-ready-${blockedStatus}`;
    const blockedRequestId =
      `request-blocked-${blockedStatus}`;

    await seedEvent({
      eventId,
      requests: [
        {
          requestId: readyRequestId,
          providerId:
            `provider-ready-${blockedStatus}`,
        },
        {
          requestId: blockedRequestId,
          providerId:
            `provider-blocked-${blockedStatus}`,
        },
      ],
    });

    await db.doc(
      `providerRequests/${blockedRequestId}`,
    ).update({
      status: blockedStatus,
    });

    await assert.rejects(
      createSession(
        input.createPaymentSessionForCustomer,
        {
          requestId: readyRequestId,
          clientKey:
            `all-provider-gate-${blockedStatus}`,
          createCheckout: unexpectedGateway,
        },
      ),
      (error) =>
        error.code === "failed-precondition",
      blockedStatus,
    );

    const readyRequest = (
      await db.doc(
        `providerRequests/${readyRequestId}`,
      ).get()
    ).data();

    assert.equal(
      readyRequest.status,
      "waiting_for_down_payment",
    );
    assert.equal(
      readyRequest.paymentStatus,
      "unpaid",
    );
  }

  const allowedEventId =
    "event-all-providers-accepted";
  const allowedRequests = [
    {
      requestId: "request-accepted-one",
      providerId: "provider-accepted-one",
    },
    {
      requestId: "request-accepted-two",
      providerId: "provider-accepted-two",
    },
  ];

  await seedEvent({
    eventId: allowedEventId,
    requests: allowedRequests,
  });

  const result = await createSession(
    input.createPaymentSessionForCustomer,
    {
      requestId: allowedRequests[0].requestId,
      clientKey: "all-providers-accepted",
      checkoutId: "cs_all_providers_accepted",
    },
  );

  assert.equal(result.created, true);

  const processedRequest = (
    await db.doc(
      `providerRequests/${allowedRequests[0].requestId}`,
    ).get()
  ).data();

  assert.equal(
    processedRequest.status,
    "payment_processing",
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

async function initialChoiceExclusivityTest(input) {
  const eventId =
    "event-initial-choice-lock";

  const requestId =
    "request-initial-choice-lock";

  const providerId =
    "provider-initial-choice-lock";

  await seedEvent({
    eventId,
    requests: [{
      requestId,
      providerId,
    }],
  });

  await assert.rejects(
    createSession(
      input.createPaymentSessionForCustomer,
      {
        requestId,

        paymentChoice:
          "minimum",

        clientKey:
          "initial-choice-minimum",

        createCheckout: async () => {
          throw new input.PayMongoRequestError(
            "simulated ambiguous minimum checkout",
            "ambiguous",
          );
        },
      },
    ),

    (error) =>
      error.code === "unavailable",
  );

  await assert.rejects(
    createSession(
      input.createPaymentSessionForCustomer,
      {
        requestId,

        paymentChoice:
          "full",

        clientKey:
          "initial-choice-full",

        createCheckout:
          unexpectedGateway,
      },
    ),

    (error) =>
      error.code ===
        "failed-precondition",
  );

  const request = (
    await db.doc(
      `providerRequests/${requestId}`,
    ).get()
  ).data();

  const minimumPaymentId =
    input.paymentIdForProviderRequestChoice(
      requestId,
      "minimum",
    );

  const fullPaymentId =
    input.paymentIdForProviderRequestChoice(
      requestId,
      "full",
    );

  assert.equal(
    request.initialPaymentChoice,
    "minimum",
  );

  assert.equal(
    request.initialPaymentId,
    minimumPaymentId,
  );

  assert.equal(
    request.paymentId,
    minimumPaymentId,
  );

  assert.equal(
    (
      await db.doc(
        `payments/${fullPaymentId}`,
      ).get()
    ).exists,
    false,
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
      paymentChoice: "minimum",
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
    paymentChoice:
      input.paymentChoice ??
      "minimum",
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

        financialSnapshot: {
          schemaVersion: 1,
          currency: "PHP",

          grossAmountInCentavos:
            amount * 200,

          requiredUpfrontAmountInCentavos:
            amount * 100,

          remainingBalanceInCentavos:
            amount * 100,
        },

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

async function p6CheckoutTests(input) {
  const test = require("node:test");
  const {providerRequestSettlementUpdateForPaymentOutcome} = require(path.join(
    libRoot, "payments/payment-settlement.js"));
  let sequence = 0;
  async function fixture(choice = "minimum", settle = true) {
    const requestId = "request-p6-" + (++sequence);
    const eventId = "event-p6-" + sequence;
    await seedEvent({eventId, requests: [{requestId, providerId: "provider-p6-" + sequence}]});
    const initial = await createSession(input.createPaymentSessionForCustomer,
      {requestId, paymentChoice: choice, clientKey: "p6-initial-key"});
    const requestRef = db.doc("providerRequests/" + requestId);
    const eventRef = db.doc("mainEvents/" + eventId);
    if (settle) {
      await db.doc("payments/" + initial.paymentId).update({status: "paid", paidAt: Timestamp.now()});
      await requestRef.update({status: "confirmed", paymentStatus: "paid",
        ...providerRequestSettlementUpdateForPaymentOutcome({
          providerRequestId: requestId, providerRequest: (await requestRef.get()).data(),
          paymentId: initial.paymentId, paymentStatus: "paid", timestamp: Timestamp.now(),
        })});
      await eventRef.update({status: "confirmed"});
    }
    const balanceId = input.paymentIdForProviderRequestChoice(requestId, "remaining_balance");
    const balanceRef = db.doc("payments/" + balanceId);
    const checkout = (extra = {}) => createSession(input.createPaymentSessionForCustomer, {
      requestId, paymentChoice: "remaining_balance", clientKey: "p6-balance-key", ...extra});
    return {requestId, requestRef, eventRef, initial, balanceId, balanceRef, checkout};
  }
  for (const choice of ["minimum", "full"]) {
    await test("P6 exact trusted " + choice + " amount and immutable selection", async () => {
      const f = await fixture(choice, false);
      const payment = (await db.doc("payments/" + f.initial.paymentId).get()).data();
      assert.equal(payment.amountInCentavos, choice === "minimum" ? 1350000 : 2700000);
      await assert.rejects(createSession(input.createPaymentSessionForCustomer, {
        requestId: f.requestId, paymentChoice: choice === "minimum" ? "full" : "minimum",
        clientKey: "p6-alternate-key", createCheckout: unexpectedGateway}),
      error => error.code === "failed-precondition");
    });
  }
  await test("P6 full-payment package rejects minimum and accepts full", async () => {
    const requestId = "request-p6-full-package";
    await seedEvent({eventId: "event-p6-full-package",
      requests: [{requestId, providerId: "provider-p6-full-package"}]});
    await db.doc("providerRequests/" + requestId).update({
      "financialSnapshot.requiredUpfrontAmountInCentavos": 2700000,
      "financialSnapshot.remainingBalanceInCentavos": 0});
    await assert.rejects(createSession(input.createPaymentSessionForCustomer, {
      requestId, clientKey: "p6-full-minimum-key", createCheckout: unexpectedGateway}),
    error => error.code === "failed-precondition");
    let amount;
    await createSession(input.createPaymentSessionForCustomer, {requestId, paymentChoice: "full",
      clientKey: "p6-full-package-key", createCheckout: async value => {
        amount = value.amountInCentavos;
        return {id: "cs_p6_full", checkoutUrl: "https://checkout.paymongo.com/p6-full"};
      }});
    assert.equal(amount, 2700000);
  });
  for (const [name, choice, settle, mutation] of [
    ["before minimum settles", "minimum", false, null],
    ["after full settles", "full", true, null],
    ["unconfirmed request", "minimum", true, {status: "waiting_for_down_payment"}],
    ["active cancellation", "minimum", true, {activeCancellationRequestId: "cancel-p6-active"}],
    ["malformed balance pointer", "minimum", true, {remainingBalancePaymentId: "payment_bad"}],
    ["inconsistent outstanding", "minimum", true, {outstandingAmountInCentavos: 1}],
    ["inconsistent settlement", "minimum", true, {settlementStatus: "fully_settled"}],
  ]) {
    await test("P6 rejects balance " + name, async () => {
      const f = await fixture(choice, settle);
      if (mutation) await f.requestRef.update(mutation);
      await assert.rejects(f.checkout({createCheckout: unexpectedGateway}),
        error => error.code === "failed-precondition");
      assert.equal((await f.balanceRef.get()).exists, false);
    });
  }
  await test("P6 requires confirmed event and rejects orphan balance document", async () => {
    const f = await fixture();
    await f.eventRef.update({status: "waiting_for_down_payment"});
    await assert.rejects(f.checkout({createCheckout: unexpectedGateway}),
      error => error.code === "failed-precondition");
    await f.eventRef.update({status: "confirmed"});
    await f.balanceRef.set({status: "pending"});
    await assert.rejects(f.checkout({createCheckout: unexpectedGateway}),
      error => error.code === "failed-precondition");
  });
  await test("P6 reserves exact balance atomically, keeps confirmation, and deduplicates", async () => {
    const f = await fixture();
    const calls = [];
    const createCheckout = async value => {
      calls.push(value);
      const request = (await f.requestRef.get()).data();
      assert.equal(request.remainingBalancePaymentId, f.balanceId);
      assert.equal(request.paymentId, f.balanceId);
      assert.equal(request.initialPaymentId, f.initial.paymentId);
      assert.equal(request.initialPaymentChoice, "minimum");
      assert.equal((await f.balanceRef.get()).data().amountInCentavos, 1350000);
      assert.equal(value.amountInCentavos, 1350000);
      assert.equal(value.description, "FEASTA provider remaining balance");
      return {id: "cs_p6_balance", checkoutUrl: "https://checkout.paymongo.com/p6-balance"};
    };
    const results = await Promise.all([f.checkout({createCheckout}), f.checkout({createCheckout})]);
    assert.equal(results[0].paymentId, f.balanceId);
    assert.equal(results[1].paymentId, f.balanceId);
    assert.equal(new Set(calls.map(c => c.idempotencyKey)).size, 1);
    assert.equal((await f.balanceRef.collection("checkoutAttempts").get()).size, 1);
    assert.equal((await f.requestRef.get()).data().status, "confirmed");
    assert.equal((await f.requestRef.get()).data().settlementStatus, "balance_payment_processing");
    assert.equal((await f.eventRef.get()).data().status, "confirmed");
    assert.equal((await f.checkout({createCheckout: unexpectedGateway})).created, false);
  });
  await test("P6 ambiguous balance dispatch resumes the same durable attempt", async () => {
    const f = await fixture();
    const calls = [];
    const createCheckout = async value => {
      calls.push(value);
      throw new input.PayMongoRequestError("timeout", "ambiguous");
    };
    for (let i = 0; i < 2; i++) await assert.rejects(f.checkout({createCheckout}),
      error => error.code === "unavailable");
    assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
    assert.equal((await f.balanceRef.collection("checkoutAttempts").get()).size, 1);
    assert.equal((await f.eventRef.get()).data().status, "confirmed");
  });
  for (const status of ["failed", "expired"]) {
    await test("P6 " + status + " balance retries only with terminal evidence, on same payment", async () => {
      const f = await fixture();
      await f.checkout({
        checkoutId: "cs_p6_" + status + "_initial",
      });
      const payment = (await f.balanceRef.get()).data();
      const attemptRef = f.balanceRef.collection("checkoutAttempts").doc(payment.currentCheckoutAttemptId);
      const attempt = (await attemptRef.get()).data();
      await f.balanceRef.update({status});
      await f.requestRef.update({paymentStatus: status,
        ...providerRequestSettlementUpdateForPaymentOutcome({providerRequestId: f.requestId,
          providerRequest: (await f.requestRef.get()).data(), paymentId: f.balanceId,
          paymentStatus: status, timestamp: Timestamp.now()})});
      await attemptRef.update({resolution: status});
      await assert.rejects(f.checkout({createCheckout: unexpectedGateway}),
        error => error.code === "failed-precondition");
      await attemptRef.update({terminalEvidence: {schemaVersion: 1, authority: "paymongo",
        outcome: "terminal_unsuccessful", irreversible: true, exhaustive: true,
        evidenceReference: "p6-trusted-terminal-fixture", paymentId: f.balanceId,
        attemptId: attemptRef.id, checkoutId: attempt.paymongoCheckoutId,
        paymentIntentIds: [], paymentIds: []}});
      const result = await f.checkout({checkoutId: "cs_p6_retry_" + status});
      assert.equal(result.paymentId, f.balanceId);
      assert.equal((await f.balanceRef.collection("checkoutAttempts").get()).size, 2);
      assert.equal((await f.requestRef.get()).data().initialPaymentId, f.initial.paymentId);
      assert.equal((await f.requestRef.get()).data().status, "confirmed");
      assert.equal((await f.eventRef.get()).data().status, "confirmed");
    });
  }
  await test("P6 balance persistence rechecks cancellation after gateway dispatch", async () => {
    const f = await fixture();
    await assert.rejects(f.checkout({createCheckout: async () => {
      await f.requestRef.update({activeCancellationRequestId: "cancel-p6-race"});
      return {id: "cs_p6_race", checkoutUrl: "https://checkout.paymongo.com/p6-race"};
    }}), error => error.code === "unavailable");
    assert.equal((await f.balanceRef.get()).data().status, "pending");
    assert.equal((await f.eventRef.get()).data().status, "confirmed");
  });
}
