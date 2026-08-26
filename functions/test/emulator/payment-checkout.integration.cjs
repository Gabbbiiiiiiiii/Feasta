const assert = require("node:assert/strict");
const path = require("node:path");
const {
  initializeApp,
  deleteApp,
} = require("firebase-admin/app");
const {
  getFirestore,
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

  try {
    await concurrentCheckoutTest({
      createPaymentSessionForCustomer,
      paymentIdForProviderRequest,
      PayMongoRequestError,
    });
    await cachedCheckoutGuardTests({
      createPaymentSessionForCustomer,
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
