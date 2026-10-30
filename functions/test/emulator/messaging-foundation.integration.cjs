const assert = require("node:assert/strict");

const {
  deleteApp: deleteAdminApp,
  initializeApp: initializeAdminApp,
} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {deleteApp, initializeApp} = require("firebase/app");
const {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} = require("firebase/auth");

const projectId = process.env.GCLOUD_PROJECT ??
  "demo-feasta-messaging";
const authHost = requiredEnv("FIREBASE_AUTH_EMULATOR_HOST");
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:5001";
const password = "FeastaTest!2026";
const clientApp = initializeApp(
  {apiKey: "fake-api-key", projectId},
  `messaging-${Date.now()}`,
);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${authHost}`, {disableWarnings: true});
const adminApp = initializeAdminApp(
  {projectId},
  `messaging-admin-${Date.now()}`,
);
const db = getFirestore(adminApp);

void run();

async function run() {
  try {
    await assert.rejects(
      () => callFunction("openProviderRequestChat", null, {
        providerRequestId: "request_missing",
      }),
      /UNAUTHENTICATED/u,
    );

    const fixture = await createFixture();
    await assertCanonicalAndMultiProviderFlow(fixture);
    await assertCrossParticipantDenial(fixture);
    await assertLegacyCompatibility(fixture);
    await assertTerminalAndInactiveDenial(fixture);

    console.log("Messaging foundation integration passed.");
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(clientApp);
    await deleteAdminApp(adminApp);
  }
}

async function createFixture() {
  const customer = (
    await createUserWithEmailAndPassword(
      auth,
      "messaging.customer@feasta.test",
      password,
    )
  ).user;
  const otherCustomer = (
    await createUserWithEmailAndPassword(
      auth,
      "messaging.customer.other@feasta.test",
      password,
    )
  ).user;
  const providerA = (
    await createUserWithEmailAndPassword(
      auth,
      "messaging.provider.a@feasta.test",
      password,
    )
  ).user;
  const providerB = (
    await createUserWithEmailAndPassword(
      auth,
      "messaging.provider.b@feasta.test",
      password,
    )
  ).user;
  const providerAId = "provider_message_a";
  const providerBId = "provider_message_b";
  const mainEventId = "main_event_messages";
  const requestAId = "provider_request_message_a";
  const requestBId = "provider_request_message_b";
  const eventDate = Timestamp.fromDate(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );

  await Promise.all([
    seedUser(customer.uid, "customer", null),
    seedUser(otherCustomer.uid, "customer", null),
    seedUser(providerA.uid, "provider", providerAId),
    seedUser(providerB.uid, "provider", providerBId),
    seedProvider(providerAId, providerA.uid, "Provider A"),
    seedProvider(providerBId, providerB.uid, "Provider B"),
    db.collection("mainEvents").doc(mainEventId).set({
      mainEventId,
      customerId: customer.uid,
      providerId: providerAId,
      providerRequestIds: [requestAId, requestBId],
      status: "pending_provider_approval",
      eventType: "Wedding",
      eventDate,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }),
    seedRequest({
      id: requestAId,
      mainEventId,
      customerId: customer.uid,
      providerId: providerAId,
      status: "pending",
      eventDate,
      serviceName: "Photography",
    }),
    seedRequest({
      id: requestBId,
      mainEventId,
      customerId: customer.uid,
      providerId: providerBId,
      status: "pending",
      eventDate,
      serviceName: "Sound system",
    }),
  ]);

  return {
    customer,
    otherCustomer,
    providerA,
    providerB,
    providerAId,
    providerBId,
    mainEventId,
    requestAId,
    requestBId,
    eventDate,
  };
}

async function assertCanonicalAndMultiProviderFlow(fixture) {
  const openedA = await callFunction(
    "openProviderRequestChat",
    fixture.customer,
    {providerRequestId: fixture.requestAId},
  );
  assert.equal(openedA.chatRoomId, fixture.requestAId);
  assert.equal(openedA.created, true);
  assert.equal(openedA.isLegacy, false);

  const sentA = await callFunction(
    "sendChatMessage",
    fixture.customer,
    {chatRoomId: openedA.chatRoomId, message: "  Hello Provider A  "},
  );
  assert.equal(sentA.chatRoomId, fixture.requestAId);
  assert.deepEqual(
    Object.keys(sentA).sort(),
    ["chatRoomId", "messageId"],
  );
  assert.equal("recipientId" in sentA, false);

  const roomA = await db.collection("chatRooms").doc(fixture.requestAId).get();
  assert.equal(roomA.data()?.lastMessage, "Hello Provider A");
  assert.equal(roomA.data()?.unreadCountProvider, 1);
  assert.equal(roomA.data()?.unreadCountCustomer, 0);
  const messagesA = await roomA.ref.collection("messages").get();
  assert.equal(messagesA.size, 1);
  assert.equal(messagesA.docs[0].data().senderId, fixture.customer.uid);
  assert.equal(messagesA.docs[0].data().senderRole, "customer");
  assert.equal(messagesA.docs[0].data().messageType, "text");
  assert.equal("attachmentUrl" in messagesA.docs[0].data(), false);
  assert.equal("isRead" in messagesA.docs[0].data(), false);

  const providerNotification = await db.collection("notifications")
    .where("userId", "==", fixture.providerA.uid)
    .where("relatedId", "==", fixture.requestAId)
    .get();
  assert.equal(providerNotification.size, 1);
  assert.equal(providerNotification.docs[0].data().type, "new_message");
  assert.equal(providerNotification.docs[0].data().isRead, false);

  const reopenedA = await callFunction(
    "openProviderRequestChat",
    fixture.customer,
    {providerRequestId: fixture.requestAId},
  );
  assert.equal(reopenedA.created, false);
  const preservedA = await roomA.ref.get();
  assert.equal(preservedA.data()?.lastMessage, "Hello Provider A");
  assert.equal(preservedA.data()?.unreadCountProvider, 1);
  assert.equal((await roomA.ref.collection("messages").get()).size, 1);

  const openedB = await callFunction(
    "openProviderRequestChat",
    fixture.customer,
    {providerRequestId: fixture.requestBId},
  );
  assert.equal(openedB.chatRoomId, fixture.requestBId);
  assert.notEqual(openedB.chatRoomId, openedA.chatRoomId);

  await assert.rejects(
    () => callFunction("openProviderRequestChat", fixture.providerA, {
      providerRequestId: fixture.requestBId,
    }),
    /PERMISSION_DENIED/u,
  );
  await assert.rejects(
    () => callFunction("sendChatMessage", fixture.providerA, {
      chatRoomId: fixture.requestBId,
      message: "Cross-provider attempt",
    }),
    /PERMISSION_DENIED/u,
  );
  assert.equal(
    (await db.collection("chatRooms").doc(fixture.requestBId)
      .collection("messages").get()).size,
    0,
  );

  await callFunction("sendChatMessage", fixture.providerA, {
    chatRoomId: fixture.requestAId,
    message: "Hello customer",
  });
  const afterProviderSend = await roomA.ref.get();
  assert.equal(afterProviderSend.data()?.unreadCountCustomer, 1);
  assert.equal(afterProviderSend.data()?.unreadCountProvider, 1);

  const marked = await callFunction(
    "markChatRoomRead",
    fixture.customer,
    {chatRoomId: fixture.requestAId},
  );
  assert.equal(marked.changed, true);
  const afterRead = await roomA.ref.get();
  assert.equal(afterRead.data()?.unreadCountCustomer, 0);
  assert.equal(afterRead.data()?.unreadCountProvider, 1);
  await assert.rejects(
    () => callFunction("markChatRoomRead", fixture.providerB, {
      chatRoomId: fixture.requestAId,
    }),
    /PERMISSION_DENIED/u,
  );
  await assert.rejects(
    () => callFunction("markChatRoomRead", fixture.customer, {
      chatRoomId: fixture.requestAId,
      currentRole: "customer",
    }),
    /INVALID_ARGUMENT/u,
  );
}

async function assertCrossParticipantDenial(fixture) {
  for (const [callableName, data] of [
    ["openProviderRequestChat", {providerRequestId: fixture.requestAId}],
    ["sendChatMessage", {
      chatRoomId: fixture.requestAId,
      message: "Cross-customer attempt",
    }],
    ["markChatRoomRead", {chatRoomId: fixture.requestAId}],
  ]) {
    await assert.rejects(
      () => callFunction(callableName, fixture.otherCustomer, data),
      /PERMISSION_DENIED/u,
    );
  }

  await assert.rejects(
    () => callFunction("openProviderRequestChat", fixture.customer, {
      providerRequestId: fixture.requestAId,
      customerId: fixture.otherCustomer.uid,
    }),
    /INVALID_ARGUMENT/u,
  );
  await assert.rejects(
    () => callFunction("sendChatMessage", fixture.customer, {
      chatRoomId: fixture.requestAId,
      message: "Spoofed identity attempt",
      senderId: fixture.providerA.uid,
      senderRole: "provider",
    }),
    /INVALID_ARGUMENT/u,
  );
}

async function assertLegacyCompatibility(fixture) {
  const eventId = "legacy_event_messages";
  const requestId = "legacy_request_messages";
  await Promise.all([
    db.collection("mainEvents").doc(eventId).set({
      mainEventId: eventId,
      customerId: fixture.customer.uid,
      providerId: fixture.providerAId,
      providerRequestIds: [requestId],
      status: "confirmed",
      eventType: "Birthday",
      eventDate: fixture.eventDate,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }),
    seedRequest({
      id: requestId,
      mainEventId: eventId,
      customerId: fixture.customer.uid,
      providerId: fixture.providerAId,
      status: "confirmed",
      eventDate: fixture.eventDate,
      serviceName: "Legacy service",
    }),
    db.collection("chatRooms").doc(eventId).set({
      bookingId: eventId,
      customerId: fixture.customer.uid,
      providerId: fixture.providerAId,
      providerOwnerId: fixture.providerA.uid,
      customerFirstName: "Legacy",
      customerLastName: "Customer",
      providerBusinessName: "Provider A",
      lastMessage: "Existing history",
      lastMessageAt: Timestamp.now(),
      lastMessageSenderId: fixture.customer.uid,
      unreadCountCustomer: 2,
      unreadCountProvider: 3,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }),
  ]);

  const opened = await callFunction(
    "openProviderRequestChat",
    fixture.customer,
    {providerRequestId: requestId},
  );
  assert.equal(opened.chatRoomId, eventId);
  assert.equal(opened.isLegacy, true);
  assert.equal(opened.created, false);
  assert.equal((await db.collection("chatRooms").doc(requestId).get()).exists, false);
  const preserved = (await db.collection("chatRooms").doc(eventId).get()).data();
  assert.equal(preserved.lastMessage, "Existing history");
  assert.equal(preserved.unreadCountCustomer, 2);
  assert.equal(preserved.unreadCountProvider, 3);
}

async function assertTerminalAndInactiveDenial(fixture) {
  const room = db.collection("chatRooms").doc(fixture.requestAId);
  const beforeMessages = (await room.collection("messages").get()).size;
  const beforeNotifications = (
    await db.collection("notifications")
      .where("relatedId", "==", fixture.requestAId)
      .get()
  ).size;

  await room.update({isActive: false});
  await assert.rejects(
    () => callFunction("sendChatMessage", fixture.customer, {
      chatRoomId: fixture.requestAId,
      message: "Must roll back",
    }),
    /FAILED_PRECONDITION/u,
  );
  assert.equal((await room.collection("messages").get()).size, beforeMessages);
  assert.equal((await db.collection("notifications")
    .where("relatedId", "==", fixture.requestAId).get()).size, beforeNotifications);

  await room.update({isActive: true});
  await db.collection("providerRequests").doc(fixture.requestAId).update({
    status: "completed",
  });
  await db.collection("mainEvents").doc(fixture.mainEventId).update({
    status: "completed",
  });
  await assert.rejects(
    () => callFunction("sendChatMessage", fixture.customer, {
      chatRoomId: fixture.requestAId,
      message: "Terminal message",
    }),
    /FAILED_PRECONDITION/u,
  );
}

async function seedUser(uid, role, providerId) {
  await db.collection("users").doc(uid).set({
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

async function seedProvider(id, ownerId, businessName) {
  await db.collection("providers").doc(id).set({
    ownerId,
    businessName,
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

async function seedRequest(input) {
  await db.collection("providerRequests").doc(input.id).set({
    providerRequestId: input.id,
    mainEventId: input.mainEventId,
    bookingId: input.mainEventId,
    customerId: input.customerId,
    customerFirstName: "Customer",
    customerLastName: "One",
    providerId: input.providerId,
    providerBusinessName: input.providerId,
    type: "addon",
    services: [{name: input.serviceName}],
    status: input.status,
    eventType: "Wedding",
    eventDate: input.eventDate,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

async function callFunction(name, user, data) {
  const headers = {"content-type": "application/json"};
  if (user) headers.authorization = `Bearer ${await user.getIdToken(true)}`;
  const response = await fetch(
    `http://${functionsHost}/${projectId}/asia-southeast1/${name}`,
    {method: "POST", headers, body: JSON.stringify({data})},
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
