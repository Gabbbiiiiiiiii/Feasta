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

const projectId = process.env.GCLOUD_PROJECT ??
  "demo-feasta-provider-bookings";
const authHost = requiredEnv(
  "FIREBASE_AUTH_EMULATOR_HOST",
);
const functionsHost =
  process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:35001";
const password = "FeastaTest!2026";
const clientApp = initializeApp(
  {
    apiKey: "fake-api-key",
    projectId,
  },
  `provider-booking-lifecycle-${Date.now()}`,
);
const auth = getAuth(clientApp);
connectAuthEmulator(
  auth,
  `http://${authHost}`,
  {disableWarnings: true},
);
const adminApp = initializeAdminApp(
  {projectId},
  `provider-booking-lifecycle-admin-${Date.now()}`,
);
const db = getFirestore(adminApp);

void run();

async function run() {
  try {
    const fixture = await createFixture();

    await assertDeniedActors(fixture);
    await assertInvalidTransitions(fixture);
    await assertStartAndCompletion(fixture);

    console.log(
      "Provider booking lifecycle integration passed.",
    );
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(clientApp);
    await deleteAdminApp(adminApp);
  }
}

async function createFixture() {
  const owner = (
    await createUserWithEmailAndPassword(
      auth,
      "provider.booking.owner@feasta.test",
      password,
    )
  ).user;
  const otherOwner = (
    await createUserWithEmailAndPassword(
      auth,
      "provider.booking.other@feasta.test",
      password,
    )
  ).user;
  const providerId = "provider_lifecycle_owner";
  const otherProviderId = "provider_lifecycle_other";
  const mainEventId = "main_event_lifecycle";
  const providerRequestId = "provider_request_lifecycle";
  const customerId = "customer_lifecycle";
  const eventDate = Timestamp.fromDate(
    new Date(Date.now() + 60 * 60 * 1000),
  );

  await Promise.all([
    seedProviderOwner(owner.uid, providerId),
    seedProviderOwner(otherOwner.uid, otherProviderId),
    db.collection("providers").doc(providerId).set({
      ownerId: owner.uid,
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
      isDeleted: false,
    }),
    db.collection("providers").doc(otherProviderId).set({
      ownerId: otherOwner.uid,
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
      isDeleted: false,
    }),
    db.collection("mainEvents").doc(mainEventId).set({
      customerId,
      status: "confirmed",
      eventDate,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }),
    db.collection("providerRequests").doc(providerRequestId).set({
      providerRequestId,
      mainEventId,
      customerId,
      providerId,
      type: "catering",
      status: "confirmed",
      amount: 15_000,
      downPaymentAmount: 3_000,
      eventDate,
      eventTime: "10:00",
      eventEndTime: "14:00",
      guestCount: 80,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }),
  ]);

  return {
    owner,
    otherOwner,
    providerId,
    mainEventId,
    providerRequestId,
    customerId,
    eventDate,
  };
}

async function assertDeniedActors(fixture) {
  await assert.rejects(
    () => callFunction(
      "markProviderBookingInProgress",
      fixture.otherOwner,
      {
        providerRequestId:
          fixture.providerRequestId,
      },
    ),
    /PERMISSION_DENIED/u,
  );

  const providerReference = db
    .collection("providers")
    .doc(fixture.providerId);

  await providerReference.update({
    verificationStatus: "under_review",
    isActive: false,
  });
  await assert.rejects(
    () => callFunction(
      "markProviderBookingInProgress",
      fixture.owner,
      {
        providerRequestId:
          fixture.providerRequestId,
      },
    ),
    /FAILED_PRECONDITION/u,
  );
  await providerReference.update({
    verificationStatus: "approved",
    isActive: true,
  });
}

async function assertInvalidTransitions(fixture) {
  const invalidMainEventId =
    "main_event_invalid_lifecycle";
  const invalidRequestId =
    "provider_request_invalid_lifecycle";

  await Promise.all([
    db.collection("mainEvents")
      .doc(invalidMainEventId)
      .set({
        customerId: fixture.customerId,
        status: "pending_provider_approval",
        eventDate: fixture.eventDate,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    db.collection("providerRequests")
      .doc(invalidRequestId)
      .set({
        providerRequestId: invalidRequestId,
        mainEventId: invalidMainEventId,
        customerId: fixture.customerId,
        providerId: fixture.providerId,
        type: "addon",
        status: "pending",
        amount: 2_000,
        downPaymentAmount: 0,
        eventDate: fixture.eventDate,
        eventTime: "10:00",
        eventEndTime: "12:00",
        guestCount: 80,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
  ]);

  await assert.rejects(
    () => callFunction(
      "markProviderBookingInProgress",
      fixture.owner,
      {providerRequestId: invalidRequestId},
    ),
    /FAILED_PRECONDITION/u,
  );
  await assert.rejects(
    () => callFunction(
      "completeProviderBooking",
      fixture.owner,
      {providerRequestId: invalidRequestId},
    ),
    /FAILED_PRECONDITION/u,
  );
}

async function assertStartAndCompletion(fixture) {
  const initialTimelineCount = (
    await timeline(fixture.mainEventId)
  ).size;
  const started = await callFunction(
    "markProviderBookingInProgress",
    fixture.owner,
    {
      providerRequestId:
        fixture.providerRequestId,
    },
  );

  assert.equal(started.changed, true);
  assert.equal(started.status, "in_progress");
  assert.equal(started.mainEventStatus, "in_progress");

  const [startedRequest, startedEvent] = await Promise.all([
    db.collection("providerRequests")
      .doc(fixture.providerRequestId)
      .get(),
    db.collection("mainEvents")
      .doc(fixture.mainEventId)
      .get(),
  ]);
  assert.equal(startedRequest.data()?.status, "in_progress");
  assert.ok(startedRequest.data()?.startedAt);
  assert.equal(startedEvent.data()?.status, "in_progress");
  assert.ok(startedEvent.data()?.startedAt);

  const replay = await callFunction(
    "markProviderBookingInProgress",
    fixture.owner,
    {
      providerRequestId:
        fixture.providerRequestId,
    },
  );
  assert.equal(replay.changed, false);
  assert.equal(
    (await timeline(fixture.mainEventId)).size,
    initialTimelineCount + 1,
  );

  const completed = await callFunction(
    "completeProviderBooking",
    fixture.owner,
    {
      providerRequestId:
        fixture.providerRequestId,
    },
  );
  assert.equal(completed.changed, true);
  assert.equal(completed.status, "completed");
  assert.equal(completed.mainEventStatus, "completed");

  const [
    completedRequest,
    completedEvent,
    timelineSnapshot,
    auditSnapshot,
    notificationSnapshot,
  ] = await Promise.all([
    db.collection("providerRequests")
      .doc(fixture.providerRequestId)
      .get(),
    db.collection("mainEvents")
      .doc(fixture.mainEventId)
      .get(),
    timeline(fixture.mainEventId),
    db.collection("adminLogs")
      .where("targetId", "==", fixture.providerRequestId)
      .get(),
    db.collection("notifications")
      .where("userId", "==", fixture.customerId)
      .get(),
  ]);

  assert.equal(completedRequest.data()?.status, "completed");
  assert.ok(completedRequest.data()?.completedAt);
  assert.equal(completedEvent.data()?.status, "completed");
  assert.ok(completedEvent.data()?.completedAt);
  assert.equal(timelineSnapshot.size, initialTimelineCount + 2);
  assert.deepEqual(
    new Set(
      timelineSnapshot.docs.map((document) =>
        document.data().type,
      ),
    ),
    new Set(["in_progress", "completed"]),
  );
  assert.deepEqual(
    new Set(
      auditSnapshot.docs.map((document) =>
        document.data().action,
      ),
    ),
    new Set([
      "provider_request.in_progress",
      "provider_request.completed",
    ]),
  );
  assert.equal(notificationSnapshot.size, 2);

  const completionReplay = await callFunction(
    "completeProviderBooking",
    fixture.owner,
    {
      providerRequestId:
        fixture.providerRequestId,
    },
  );
  assert.equal(completionReplay.changed, false);
}

function seedProviderOwner(uid, providerId) {
  return db.collection("users").doc(uid).set({
    uid,
    role: "provider",
    providerId,
    accountStatus: "active",
    isActive: true,
    isBlocked: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

function timeline(mainEventId) {
  return db.collection("mainEvents")
    .doc(mainEventId)
    .collection("timeline")
    .get();
}

async function callFunction(name, user, data) {
  const response = await fetch(
    `http://${functionsHost}/${projectId}/asia-southeast1/${name}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization:
          `Bearer ${await user.getIdToken(true)}`,
      },
      body: JSON.stringify({data}),
    },
  );
  const body = await response.json();

  if (!response.ok || body.error) {
    throw new Error(
      `${body.error?.status ?? response.status}: ` +
      `${body.error?.message ?? "Callable failed"}`,
    );
  }

  return body.result;
}

function requiredEnv(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required.`);
  return value;
}
