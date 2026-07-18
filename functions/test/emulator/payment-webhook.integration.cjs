const assert = require("node:assert/strict");
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

const projectId = process.env.GCLOUD_PROJECT ?? "demo-feasta-phase3";
const app = initializeApp({projectId});
const db = getFirestore(app);

(async () => {
  const {processPayMongoWebhook} = await import("../../lib/payments/process-webhook.js");
  try {
    await seed("payment-one", "processing");
    const paid = eventBody({eventId: "evt_paid", paymentId: "payment-one"});
    assert.deepEqual(await processPayMongoWebhook(paid), {duplicate: false, applied: true});
    const payment = (await db.doc("payments/payment-one").get()).data();
    assert.equal(payment.status, "paid");
    assert.ok(payment.paidAt instanceof Timestamp, "paidAt must be backend-generated");
    assert.equal((await db.doc("mainEvents/booking-one").get()).data().status, "confirmed");
    const logsBefore = (await db.collection("adminLogs").get()).size;
    const notificationsBefore = (await db.collection("notifications").get()).size;
    assert.deepEqual(await processPayMongoWebhook(paid), {duplicate: true, applied: false});
    assert.equal((await db.collection("adminLogs").get()).size, logsBefore);
    assert.equal((await db.collection("notifications").get()).size, notificationsBefore);

    await seed("payment-amount", "processing");
    const wrongAmount = eventBody({eventId: "evt_amount", paymentId: "payment-amount", amount: 1});
    assert.equal((await processPayMongoWebhook(wrongAmount)).reason, "amount_mismatch");
    assert.equal((await db.doc("payments/payment-amount").get()).data().status, "processing");

    await seed("payment-currency", "processing");
    const wrongCurrency = eventBody({eventId: "evt_currency", paymentId: "payment-currency", currency: "USD"});
    assert.equal((await processPayMongoWebhook(wrongCurrency)).reason, "currency_mismatch");

    await seed("payment-owner", "processing", {bookingCustomerId: "another-customer"});
    const wrongOwner = eventBody({eventId: "evt_owner", paymentId: "payment-owner"});
    assert.equal((await processPayMongoWebhook(wrongOwner)).reason, "ownership_mismatch");

    console.log("Payment webhook emulator integration passed.");
  } finally {
    await deleteApp(app);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function seed(paymentId, status, overrides = {}) {
  const batch = db.batch();
  batch.set(db.doc(`payments/${paymentId}`), {
    paymentId,
    bookingId: "booking-one",
    customerId: "customer-one",
    providerId: "provider-one",
    amount: 13500,
    amountInCentavos: 1350000,
    currency: "PHP",
    status,
    paidAt: null,
  });
  batch.set(db.doc("mainEvents/booking-one"), {
    customerId: overrides.bookingCustomerId ?? "customer-one",
    providerId: "provider-one",
    status: "waiting_for_down_payment",
  });
  batch.set(db.doc("providers/provider-one"), {ownerId: "provider-owner"});
  await batch.commit();
}

function eventBody({eventId, paymentId, amount = 1350000, currency = "PHP"}) {
  return Buffer.from(JSON.stringify({data: {
    id: eventId,
    type: "event",
    attributes: {
      type: "payment.paid",
      data: {id: `pay_${eventId}`, type: "payment", attributes: {
        amount,
        currency,
        metadata: {payment_id: paymentId},
      }},
    },
  }}));
}
