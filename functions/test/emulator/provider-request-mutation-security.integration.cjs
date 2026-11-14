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
  "demo-feasta-provider-request-security";
const authHost = requiredEnv("FIREBASE_AUTH_EMULATOR_HOST");
const functionsHost =
  process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:55201";
const password = "FeastaTest!2026";
const clientApp = initializeApp(
  {apiKey: "fake-api-key", projectId},
  `provider-request-security-${Date.now()}`,
);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${authHost}`, {disableWarnings: true});
const adminApp = initializeAdminApp(
  {projectId},
  `provider-request-security-admin-${Date.now()}`,
);
const db = getFirestore(adminApp);

void run();

async function run() {
  try {
    const actors = await createActors();

    await assertAcceptedNonCateringRequest(actors);
    await assertRejectedStaleRequest(actors);
    await assertActorIsolation(actors);
    await assertCoreLinkageRejections(actors);
    await assertParentStatusGuards(actors);
    await assertReplacementParentAllowsResponse(actors);
    await assertEventStartGuard(actors);
    const acceptanceActors = await createActors("_acceptance");
    await assertAllProvidersFirst(acceptanceActors);
    await assertFailedSiblingPreserved(acceptanceActors);
    await assertConcurrentAcceptance(acceptanceActors);
    await assertCanonicalSetBeforeAcceptance(acceptanceActors);
    await assertNearEventPaymentDeadline(acceptanceActors);

    console.log("Provider request mutation security integration passed.");
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(clientApp);
    await deleteAdminApp(adminApp);
  }
}

async function createActors(suffix = "") {
  const owner = (await createUserWithEmailAndPassword(
    auth,
    `request.security.owner${suffix}@feasta.test`,
    password,
  )).user;
  const otherOwner = (await createUserWithEmailAndPassword(
    auth,
    `request.security.other${suffix}@feasta.test`,
    password,
  )).user;
  const customer = (await createUserWithEmailAndPassword(
    auth,
    `request.security.customer${suffix}@feasta.test`,
    password,
  )).user;
  const providerId = `provider_photography_security${suffix}`;
  const otherProviderId = `provider_styling_security${suffix}`;

  await Promise.all([
    seedUser(owner.uid, "provider", providerId),
    seedUser(otherOwner.uid, "provider", otherProviderId),
    seedUser(customer.uid, "customer", null),
    seedProvider(owner.uid, providerId, "photographer"),
    seedProvider(otherOwner.uid, otherProviderId, "decorator_event_stylist"),
  ]);

  return {
    owner,
    otherOwner,
    customer,
    providerId,
    otherProviderId,
    customerId: customer.uid,
  };
}

async function assertAcceptedNonCateringRequest(actors) {
  const fixture = await seedIndependentRequest(actors, "accept_valid");
  const before = await sideEffectCounts(fixture);
  const result = await callFunction("acceptProviderRequest", actors.owner, {
    providerRequestId: fixture.requestId,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.status, "waiting_for_down_payment");
  const [request, event, after] = await Promise.all([
    fixture.requestReference.get(),
    fixture.eventReference.get(),
    sideEffectCounts(fixture),
  ]);
  assert.equal(request.data()?.status, "waiting_for_down_payment");
  assert.equal(event.data()?.status, "waiting_for_down_payment");
  assert.deepEqual(event.data()?.providerRequestIds, [fixture.requestId]);
  assert.deepEqual(after, {
    timeline: before.timeline + 1,
    notifications: before.notifications + 1,
    auditLogs: before.auditLogs + 1,
  });

  await fixture.eventReference.update({status: "confirmed"});
  const replay = await callFunction("acceptProviderRequest", actors.owner, {
    providerRequestId: fixture.requestId,
  });
  assert.equal(replay.accepted, false);
  assert.equal(replay.status, "waiting_for_down_payment");
  assert.deepEqual(await sideEffectCounts(fixture), after);
}

async function assertRejectedStaleRequest(actors) {
  const pastDate = Timestamp.fromDate(new Date("2020-01-01T12:00:00+08:00"));
  const fixture = await seedIndependentRequest(actors, "reject_stale", {
    request: {
      eventDate: pastDate,
      eventTime: "malformed",
      eventEndTime: "also-malformed",
      guestCount: 999999,
      services: [],
      amount: 1,
      downPaymentAmount: 0,
      remainingBalance: 1,
    },
  });
  const before = await sideEffectCounts(fixture);
  const result = await callFunction("rejectProviderRequest", actors.owner, {
    providerRequestId: fixture.requestId,
    reason: "The stale schedule cannot be supported.",
  });

  assert.equal(result.rejected, true);
  assert.equal(result.status, "rejected");
  const [request, event, after] = await Promise.all([
    fixture.requestReference.get(),
    fixture.eventReference.get(),
    sideEffectCounts(fixture),
  ]);
  assert.equal(request.data()?.status, "rejected");
  assert.equal(
    request.data()?.rejectionReason,
    "The stale schedule cannot be supported.",
  );
  assert.equal(event.data()?.status, "needs_provider_replacement");
  assert.equal(event.data()?.recoveryStatus, "required");
  assert.deepEqual(after, {
    timeline: before.timeline + 1,
    notifications: before.notifications + 1,
    auditLogs: before.auditLogs + 1,
  });

  await fixture.eventReference.update({status: "confirmed"});
  const replay = await callFunction("rejectProviderRequest", actors.owner, {
    providerRequestId: fixture.requestId,
    reason: "A different replay reason must not overwrite state.",
  });
  assert.equal(replay.rejected, false);
  assert.deepEqual(await sideEffectCounts(fixture), after);
  assert.equal(
    (await fixture.requestReference.get()).data()?.rejectionReason,
    "The stale schedule cannot be supported.",
  );
}

async function assertActorIsolation(actors) {
  const fixture = await seedIndependentRequest(actors, "actor_isolation");

  await assert.rejects(
    () => callFunction("acceptProviderRequest", actors.customer, {
      providerRequestId: fixture.requestId,
    }),
    /PERMISSION_DENIED/u,
  );
  await assert.rejects(
    () => callFunction("rejectProviderRequest", actors.customer, {
      providerRequestId: fixture.requestId,
      reason: "A customer must not reject this request.",
    }),
    /PERMISSION_DENIED/u,
  );
  await assert.rejects(
    () => callFunction("acceptProviderRequest", actors.otherOwner, {
      providerRequestId: fixture.requestId,
    }),
    /PERMISSION_DENIED/u,
  );
  await assert.rejects(
    () => callFunction("rejectProviderRequest", actors.otherOwner, {
      providerRequestId: fixture.requestId,
      reason: "Another provider must not reject this request.",
    }),
    /PERMISSION_DENIED/u,
  );
}

async function assertCoreLinkageRejections(actors) {
  const cases = [
    ["unlinked", {event: {providerRequestIds: []}}],
    ["customer_mismatch", {event: {customerId: "customer_other_security"}}],
    ["booking_mismatch", {request: {bookingId: "event_other_security"}}],
    ["stored_id_mismatch", {
      request: {providerRequestId: "request_other_security"},
    }],
  ];

  for (const [suffix, overrides] of cases) {
    const fixture = await seedIndependentRequest(actors, suffix, overrides);
    await assert.rejects(
      () => callFunction("acceptProviderRequest", actors.owner, {
        providerRequestId: fixture.requestId,
      }),
      /FAILED_PRECONDITION/u,
      suffix,
    );
    assert.equal((await fixture.requestReference.get()).data()?.status, "pending");
  }
}

async function assertParentStatusGuards(actors) {
  for (const status of [
    "draft",
    "waiting_for_down_payment",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "expired",
  ]) {
    const fixture = await seedIndependentRequest(
      actors,
      `parent_${status}`,
      {event: {status}},
    );
    await assert.rejects(
      () => callFunction("acceptProviderRequest", actors.owner, {
        providerRequestId: fixture.requestId,
      }),
      /FAILED_PRECONDITION/u,
      status,
    );
    await assert.rejects(
      () => callFunction("rejectProviderRequest", actors.owner, {
        providerRequestId: fixture.requestId,
        reason: "This parent status must reject a new response.",
      }),
      /FAILED_PRECONDITION/u,
      status,
    );
  }
}

async function assertReplacementParentAllowsResponse(actors) {
  const eventDate = futureEventDate(31);
  const fixture = await seedIndependentRequest(actors, "replacement_valid", {
    event: {
      status: "needs_provider_replacement",
      eventDate,
    },
    request: {eventDate},
  });
  const result = await callFunction("acceptProviderRequest", actors.owner, {
    providerRequestId: fixture.requestId,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.status, "waiting_for_down_payment");
}

async function assertEventStartGuard(actors) {
  const now = new Date();
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).format(now);
  const eventDate = Timestamp.fromDate(new Date(`${dateKey}T12:00:00+08:00`));
  const fixture = await seedIndependentRequest(actors, "event_started", {
    event: {
      eventDate,
      eventTime: "00:00",
      eventEndTime: "00:01",
    },
    request: {
      eventDate,
      eventTime: "00:00",
      eventEndTime: "00:01",
    },
  });

  await assert.rejects(
    () => callFunction("acceptProviderRequest", actors.owner, {
      providerRequestId: fixture.requestId,
    }),
    /FAILED_PRECONDITION/u,
  );
}

let lineupSequence = 40;

async function seedLineup(actors, suffix, siblingStatus = "pending", freeSibling = false) {
  const eventDate = futureEventDate(lineupSequence++);
  const fixture = await seedIndependentRequest(actors, suffix, {
    event: {eventDate}, request: {eventDate},
  });
  const event = (await fixture.eventReference.get()).data();
  const first = (await fixture.requestReference.get()).data();
  const siblingId = `${fixture.requestId}_sibling`;
  const serviceId = `styling_${suffix}`;
  const siblingReference = db.collection("providerRequests").doc(siblingId);
  const percentage = freeSibling ? 0 : 25;
  await siblingReference.set({
    ...first, providerRequestId: siblingId, providerId: actors.otherProviderId,
    status: siblingStatus, downPaymentPercentage: percentage,
    downPaymentAmount: freeSibling ? 0 : 3000, remainingBalance: freeSibling ? 12000 : 9000,
    services: [{serviceId, name: "Event Styling", category: "decorator_event_stylist",
      price: 12000, downPaymentPercentage: percentage, downPaymentAmount: freeSibling ? 0 : 3000}],
    expiresAt: null,
  });
  await fixture.eventReference.update({
    providerRequestIds: [fixture.requestId, siblingId],
    selectedAddOns: [...event.selectedAddOns, {
      addonId: serviceId, providerId: actors.otherProviderId, ownerId: actors.otherOwner.uid,
      name: "Event Styling", category: "decorator_event_stylist", price: 12000,
      downPaymentPercentage: percentage, source: "marketplace",
    }],
  });
  return {...fixture, siblingId, siblingReference};
}

async function assertAllProvidersFirst(actors) {
  // A zero-deposit final responder must also release the held paid service.
  const fixture = await seedLineup(actors, "held_acceptance", "pending", true);
  const first = await callFunction("acceptProviderRequest", actors.owner, {
    providerRequestId: fixture.requestId,
  });
  assert.equal(first.status, "accepted");
  const held = (await fixture.requestReference.get()).data();
  assert.equal(held.expiresAt, null);
  assert.equal(held.confirmedAt, null);
  assert.equal((await fixture.eventReference.get()).data().status, "pending_provider_approval");
  const effects = await sideEffectCounts(fixture);
  const replay = await callFunction("acceptProviderRequest", actors.owner, {
    providerRequestId: fixture.requestId,
  });
  assert.equal(replay.accepted, false);
  assert.deepEqual(await sideEffectCounts(fixture), effects);
  const before = Date.now();
  await callFunction("acceptProviderRequest", actors.otherOwner, {
    providerRequestId: fixture.siblingId,
  });
  const [paid, free, event] = await Promise.all([
    fixture.requestReference.get(), fixture.siblingReference.get(), fixture.eventReference.get(),
  ]);
  assert.equal(paid.data().status, "waiting_for_down_payment");
  assert.equal(free.data().status, "confirmed");
  assert.equal(free.data().expiresAt, null);
  assert.equal(event.data().status, "waiting_for_down_payment");
  assert.deepEqual(event.data().providerRequestIds, [fixture.requestId, fixture.siblingId]);
  assert.equal(paid.data().acceptedAt.toMillis(), held.acceptedAt.toMillis());
  const notices = await db.collection("notifications")
    .where("relatedId", "==", fixture.siblingId).get();
  assert.ok(notices.docs.some((notice) => notice.data().message.includes("down payments")));
  assert.ok(paid.data().expiresAt.toMillis() >= before + 24 * 60 * 60 * 1000);
  assert.ok(paid.data().expiresAt.toMillis() <= Date.now() + 24 * 60 * 60 * 1000);
}

async function assertFailedSiblingPreserved(actors) {
  for (const status of ["rejected", "expired"]) {
    const fixture = await seedLineup(actors, `held_${status}`, status);
    await fixture.eventReference.update({status: "needs_provider_replacement", recoveryStatus: "required"});
    const failedBefore = (await fixture.siblingReference.get()).data();
    const result = await callFunction("acceptProviderRequest", actors.owner, {
      providerRequestId: fixture.requestId,
    });
    assert.equal(result.status, "accepted");
    assert.deepEqual((await fixture.siblingReference.get()).data(), failedBefore);
    assert.equal((await fixture.requestReference.get()).data().expiresAt, null);
    const event = (await fixture.eventReference.get()).data();
    assert.equal(event.status, "needs_provider_replacement");
    assert.deepEqual(event.providerRequestIds, [fixture.requestId, fixture.siblingId]);
  }
}

async function assertConcurrentAcceptance(actors) {
  const fixture = await seedLineup(actors, "concurrent_acceptance");
  await Promise.all([
    callFunction("acceptProviderRequest", actors.owner, {providerRequestId: fixture.requestId}),
    callFunction("acceptProviderRequest", actors.otherOwner, {providerRequestId: fixture.siblingId}),
  ]);
  const first = (await fixture.requestReference.get()).data();
  const second = (await fixture.siblingReference.get()).data();
  assert.equal(first.status, "waiting_for_down_payment");
  assert.equal(second.status, "waiting_for_down_payment");
  assert.equal(first.expiresAt.toMillis(), second.expiresAt.toMillis());
  assert.equal((await fixture.eventReference.get()).data().acceptedProviderRequestCount, 0);
}

async function assertCanonicalSetBeforeAcceptance(actors) {
  const fixture = await seedLineup(actors, "invalid_acceptance_set");
  await fixture.eventReference.update({providerRequestIds: [fixture.requestId]});
  const before = await sideEffectCounts(fixture);
  await assert.rejects(() => callFunction("acceptProviderRequest", actors.owner, {
    providerRequestId: fixture.requestId,
  }), /FAILED_PRECONDITION/u);
  assert.equal((await fixture.requestReference.get()).data().status, "pending");
  assert.deepEqual(await sideEffectCounts(fixture), before);
}

async function assertNearEventPaymentDeadline(actors) {
  const date = futureEventDate(1);
  const fixture = await seedIndependentRequest(actors, "near_event_deadline", {
    event: {eventDate: date, eventTime: "00:00", eventEndTime: "01:00"},
    request: {eventDate: date, eventTime: "00:00", eventEndTime: "01:00"},
  });
  await callFunction("acceptProviderRequest", actors.owner, {providerRequestId: fixture.requestId});
  // The fixture date is noon in Manila; the event starts at midnight that day.
  assert.equal((await fixture.requestReference.get()).data().expiresAt.toMillis(),
    date.toMillis() - 12 * 60 * 60 * 1000);
}

async function seedIndependentRequest(actors, suffix, overrides = {}) {
  const eventId = `security_event_${suffix}`;
  const requestId = `security_request_${suffix}`;
  const serviceId = `security_service_${suffix}`;
  const eventDate = futureEventDate();
  const event = {
    bookingId: eventId,
    mainEventId: eventId,
    customerId: actors.customerId,
    status: "pending_provider_approval",
    providerRequestIds: [requestId],
    providerRequestCount: 1,
    pendingProviderRequestCount: 1,
    eventDate,
    eventTime: "10:00",
    eventEndTime: "14:00",
    eventType: "wedding",
    guestCount: 100,
    eventLocation: "Ormoc City",
    eventAddress: "123 Security Street",
    selectedAddOns: [{
      addonId: serviceId,
      providerId: actors.providerId,
      ownerId: actors.owner.uid,
      name: "Wedding Photography",
      category: "photographer",
      price: 12000,
      downPaymentPercentage: 25,
      source: "marketplace",
    }],
    recoveryStatus: "none",
    rejectedByProviderIds: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides.event,
  };
  const request = {
    providerRequestId: requestId,
    bookingId: eventId,
    mainEventId: eventId,
    customerId: actors.customerId,
    providerId: actors.providerId,
    type: "addon",
    status: "pending",
    isRequired: true,
    eventDate: event.eventDate,
    eventTime: event.eventTime,
    eventEndTime: event.eventEndTime,
    eventType: event.eventType,
    guestCount: event.guestCount,
    eventLocation: event.eventLocation,
    eventAddress: event.eventAddress,
    packageId: null,
    packageName: null,
    services: [{
      serviceId,
      name: "Wedding Photography",
      category: "photographer",
      price: 12000,
      downPaymentPercentage: 25,
      downPaymentAmount: 3000,
    }],
    amount: 12000,
    downPaymentPercentage: 25,
    downPaymentAmount: 3000,
    remainingBalance: 9000,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides.request,
  };
  const eventReference = db.collection("mainEvents").doc(eventId);
  const requestReference = db.collection("providerRequests").doc(requestId);

  await Promise.all([
    eventReference.set(event),
    requestReference.set(request),
  ]);

  return {
    eventId,
    requestId,
    eventReference,
    requestReference,
    customerId: actors.customerId,
  };
}

async function sideEffectCounts(fixture) {
  const [timeline, notifications, auditLogs] = await Promise.all([
    fixture.eventReference.collection("timeline").get(),
    db.collection("notifications")
      .where("relatedId", "==", fixture.requestId)
      .get(),
    db.collection("adminLogs")
      .where("targetId", "==", fixture.requestId)
      .get(),
  ]);

  return {
    timeline: timeline.size,
    notifications: notifications.size,
    auditLogs: auditLogs.size,
  };
}

function seedUser(uid, role, providerId) {
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

function seedProvider(ownerId, providerId, category) {
  return db.collection("providers").doc(providerId).set({
    ownerId,
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    providerServiceType: "addon",
    providerCategory: category,
    serviceCategories: [category],
    operatingDays: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ],
    unavailableDates: [],
    bookingLeadTimeDays: 0,
    acceptsMultipleEventsPerDay: true,
    maxEventsPerDay: 50,
    minGuestsPerEvent: 0,
    maxGuestsPerEvent: 0,
    availableStaffCount: 0,
    availableEquipmentCount: 0,
  });
}

function futureEventDate(days = 30) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const key = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).format(date);

  return Timestamp.fromDate(new Date(`${key}T12:00:00+08:00`));
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
