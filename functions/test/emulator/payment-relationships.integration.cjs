const assert = require("node:assert/strict");
const {test, after} = require("node:test");
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getFirestore, Timestamp, FieldValue} = require("firebase-admin/firestore");

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Firestore emulator is required");
const app = initializeApp({projectId: process.env.GCLOUD_PROJECT ?? "demo-feasta-phase3"});
const db = getFirestore(app);
const {createPaymentSessionForCustomer} = require("../../lib/payments/create-payment-session.js");
const {paymentIdForProviderRequest} = require("../../lib/payments/payment-lifecycle.js");
const {requireProviderRequestDocuments, requireActiveProviderRequest} =
  require("../../lib/provider-requests/provider-request-relationship-integrity.js");
after(() => deleteApp(app));

async function seed(suffix, version = 2) {
  const eventId = `event_relationship_${suffix}`;
  const ids = Object.fromEntries(["A", "B", "C", "D"].map((key) =>
    [key, `request_relationship_${suffix}_${key}`]));
  const scope = {eventType: "Wedding", eventDate: Timestamp.fromMillis(2000000000000),
    eventTime: "10:00", eventEndTime: "14:00", eventLocation: "Venue",
    eventAddress: "Venue address", guestCount: 100};
  const batch = db.batch();
  batch.set(db.doc(`mainEvents/${eventId}`), {mainEventId: eventId, bookingId: eventId,
    customerId: "customer_relationship", status: "waiting_for_down_payment", ...scope,
    providerRequestIds: Object.values(ids),
    ...(version === 2 ? {providerRequestRelationshipVersion: 2,
      activeProviderRequestIds: [ids.A, ids.B, ids.D]} : {}),
  });
  for (const [key, id] of Object.entries(ids)) {
    const providerId = `provider_relationship_${suffix}_${key}`;
    const ownerId = `owner_relationship_${suffix}_${key}`;
    batch.set(db.doc(`providerRequests/${id}`), {providerRequestId: id,
      mainEventId: eventId, bookingId: eventId, customerId: "customer_relationship", providerId,
      ...scope, type: "addon", packageId: null, packageName: null,
      services: [{serviceId: `service_${id}`, name: "Photographer", category: "photography",
        price: 100, downPaymentPercentage: 20, downPaymentAmount: 20}],
      status: "waiting_for_down_payment", paymentStatus: "unpaid", amount: 100,
      downPaymentAmount: 20, remainingBalance: 80, requestedAt: Timestamp.fromMillis(2000),
      ...(version === 2 && key === "C" ? {status: "rejected", replacementStatus: "required",
        rejectedAt: Timestamp.fromMillis(1000), respondedAt: Timestamp.fromMillis(1000),
        rejectionReason: "Unavailable for this date"} : {}),
      ...(version === 2 && key === "D" ? {replacesProviderRequestId: ids.C} : {}),
    });
    batch.set(db.doc(`providers/${providerId}`), {ownerId, verificationStatus: "approved",
      isActive: true, isSuspended: false, isDeleted: false});
    batch.set(db.doc(`users/${ownerId}`), {role: "provider", providerId, accountStatus: "active",
      isActive: true, isBlocked: false});
  }
  await batch.commit();
  return {eventId, ids};
}

function checkout(id, createCheckout = async () => ({id: `cs_${id}`,
  checkoutUrl: `https://checkout.paymongo.com/${id}`})) {
  return createPaymentSessionForCustomer({customerId: "customer_relationship",
    providerRequestId: id, clientKey: `key_${id}`, secretKey: "stub-secret",
    successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel",
    createCheckout});
}

test("v1 checkout and cached retry retain complete readiness", async () => {
  const {ids} = await seed("v1", 1);
  assert.equal((await checkout(ids.D)).created, true);
  assert.equal((await checkout(ids.D)).created, false);
  await db.doc(`providerRequests/${ids.C}`).update({status: "rejected"});
  await assert.rejects(checkout(ids.D), {code: "failed-precondition"});
});

test("v2 complete read retains C while only A/B/D contribute to checkout readiness", async () => {
  const {ids, eventId} = await seed("valid");
  await db.runTransaction(async (transaction) => {
    const event = await transaction.get(db.doc(`mainEvents/${eventId}`));
    const requests = await transaction.get(db.collection("providerRequests")
      .where("mainEventId", "==", eventId));
    const result = requireProviderRequestDocuments({mainEventId: eventId,
      mainEvent: event.data(), requests: requests.docs});
    assert.deepEqual(result.complete, Object.values(ids));
    assert.deepEqual(result.activeRequired, [ids.A, ids.B, ids.D]);
    assert.deepEqual(result.historical, [ids.C]);
    assert.throws(() => requireActiveProviderRequest(result, ids.C), {code: "failed-precondition"});
    requireActiveProviderRequest(result, ids.D);
  });
  const before = (await db.doc(`providerRequests/${ids.C}`).get()).data();
  await checkout(ids.D);
  assert.equal((await db.doc(`providerRequests/${ids.D}`).get()).data().status, "payment_processing");
  const event = (await db.doc(`mainEvents/${eventId}`).get()).data();
  assert.equal(event.providerRequestCount, 3);
  assert.equal(event.rejectedProviderRequestCount, 0);
  assert.deepEqual(event.providerRequestIds, Object.values(ids));
  assert.deepEqual((await db.doc(`providerRequests/${ids.C}`).get()).data(), before);
  await assert.rejects(checkout(ids.C), {code: "failed-precondition"});
});

test("every active request must be accepted before v2 payment, including cached checkout", async () => {
  const {ids} = await seed("all_active");
  for (const status of ["pending", "rejected", "expired", "cancelled"]) {
    await db.doc(`providerRequests/${ids.B}`).update({status});
    await assert.rejects(checkout(ids.D), {code: "failed-precondition"});
  }
  await db.doc(`providerRequests/${ids.B}`).update({status: "accepted"});
  await checkout(ids.D);
  await db.doc(`providerRequests/${ids.B}`).update({status: "pending"});
  await assert.rejects(checkout(ids.D), {code: "failed-precondition"});
});

const attacks = {
  no_predecessor: async ({ids}) => db.doc(`providerRequests/${ids.D}`)
    .update({replacesProviderRequestId: FieldValue.delete()}),
  stale_active: async ({eventId, ids}) => db.doc(`mainEvents/${eventId}`)
    .update({activeProviderRequestIds: Object.values(ids)}),
  missing_history: async ({eventId, ids}) => db.doc(`mainEvents/${eventId}`)
    .update({providerRequestIds: [ids.A, ids.B, ids.D]}),
  unlisted: async ({eventId, ids}) => db.doc(`providerRequests/${ids.A}_extra`)
    .set({...((await db.doc(`providerRequests/${ids.A}`).get()).data()),
      providerRequestId: `${ids.A}_extra`, mainEventId: eventId}),
  wrong_customer: async ({ids}) => db.doc(`providerRequests/${ids.B}`)
    .update({customerId: "customer_other"}),
};
for (const [name, attack] of Object.entries(attacks)) {
  test(`v2 checkout rejects ${name} before contacting gateway`, async () => {
    const fixture = await seed(name); await attack(fixture);
    let calls = 0;
    await assert.rejects(checkout(fixture.ids.D, async () => {calls++; throw Error("gateway");}),
      {code: "failed-precondition"});
    assert.equal(calls, 0);
    assert.equal((await db.doc(`payments/${paymentIdForProviderRequest(fixture.ids.D)}`).get()).exists,
      false);
  });
}

test("checkout persistence revalidates complete relationships after the gateway call", async () => {
  const fixture = await seed("gateway_race");
  await assert.rejects(checkout(fixture.ids.D, async () => {
    await attacks.no_predecessor(fixture);
    return {id: "cs_relationship_race", checkoutUrl: "https://checkout.paymongo.com/race"};
  }), {code: "unavailable"}); // Existing post-dispatch failure wrapper.
  assert.equal((await db.doc(`providerRequests/${fixture.ids.D}`).get()).data().status,
    "waiting_for_down_payment");
});
