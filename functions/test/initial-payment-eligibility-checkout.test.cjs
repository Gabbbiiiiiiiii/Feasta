const test = require("node:test");
const assert = require("node:assert/strict");
const {initializeApp} = require("firebase-admin/app");
const {Timestamp} = require("firebase-admin/firestore");
initializeApp({projectId: "demo-feasta-eligibility-unit"});

// Isolate the real checkout reservation transaction. No Firestore or gateway I/O.
let records = new Map();
let writes = [];
let sequence = 0;
const ref = (path) => ({path, id: path.split("/").at(-1), collection: (name) => collection(`${path}/${name}`)});
const collection = (path) => ({path, doc: (id) => ref(`${path}/${id ?? `auto_${++sequence}`}`),
  where: () => ({queryCollection: path})});
const snapshot = (reference) => ({id: reference.id, ref: reference, exists: records.has(reference.path),
  data: () => records.get(reference.path)});
const db = {collection, async runTransaction(callback) {
  const result = await callback({
    getAll: async (...references) => references.map(snapshot),
    get: async (reference) => reference.queryCollection
      ? {docs: [...records.keys()].filter((key) => key.startsWith(`${reference.queryCollection}/`)).map((key) => snapshot(ref(key)))}
      : snapshot(reference),
    update: (reference, data) => writes.push({kind: "update", path: reference.path, data}),
    create: (reference, data) => writes.push({kind: "create", path: reference.path, data}),
    set: (reference, data) => writes.push({kind: "set", path: reference.path, data}),
  });
  // The test stops at the reservation boundary instead of dispatching a checkout.
  return {...result, checkoutUrl: "https://checkout.paymongo.com/unit-test"};
}};
const firestoreModule = require.resolve("../lib/shared/firestore.js");
require.cache[firestoreModule] = {id: firestoreModule, filename: firestoreModule, loaded: true, exports: {db}};
const {createPaymentSessionForCustomer} = require("../lib/payments/create-payment-session.js");
const {buildBookingPaymentPolicySnapshot} = require("../lib/bookings/booking-payment-eligibility-policy.js");
const {evaluateInitialPaymentEligibility} = require("../lib/payments/initial-payment-eligibility.js");

function seed(acceptanceTime, legacy = false) {
  writes = []; records = new Map();
  const frozen = buildBookingPaymentPolicySnapshot({platformSettings: null,
    serviceCategoryCode: "catering_service", serviceCategory: {}, packageId: "package_test", packageData: {}});
  const terms = {schemaVersion: 2, source: "canonical_package", paymentPolicy: "deposit_then_balance",
    depositRateBps: 3000, balanceDueDaysBeforeEvent: null, balanceDueHoursBeforeEvent: 24, usesLegacyPaymentTerms: false};
  const eligibility = evaluateInitialPaymentEligibility({eventDate: new Date("2026-10-25T00:00:00+08:00"),
    eventTime: "10:00", acceptanceTime: new Date(acceptanceTime), packagePaymentTerms: terms,
    bookingPaymentPolicySnapshot: frozen});
  records.set("providerRequests/request_test", {
    providerRequestId: "request_test", mainEventId: "event_test", bookingId: "event_test",
    customerId: "customer_test", providerId: "provider_test", status: "waiting_for_down_payment", paymentStatus: "unpaid",
    financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
      requiredUpfrontAmountInCentavos: 30000, remainingBalanceInCentavos: 70000, packagePaymentTerms: terms},
    ...(legacy ? {} : {bookingPaymentPolicySnapshot: frozen, initialPaymentEligibilitySchemaVersion: 1,
      initialPaymentEligibility: {...eligibility, evaluatedAt: Timestamp.fromDate(eligibility.evaluatedAt),
        eventStartAt: Timestamp.fromDate(eligibility.eventStartAt)}}),
  });
  records.set("mainEvents/event_test", {mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test",
    providerRequestIds: ["request_test"], status: "waiting_for_down_payment"});
  records.set("providers/provider_test", {ownerId: "owner_test", verificationStatus: "approved", isActive: true});
  records.set("users/owner_test", {role: "provider", providerId: "provider_test", accountStatus: "active"});
  records.set("providerPaymentAccounts/provider_test", {providerId: "provider_test", schemaVersion: 1,
    setupStatus: "ready", linkedAccountType: "merchant", payoutReady: true, paymongoAccountId: "org_unit_test"});
}
const checkout = (paymentChoice) => createPaymentSessionForCustomer({customerId: "customer_test",
  providerRequestId: "request_test", paymentChoice, clientKey: "eligibility_unit_test", secretKey: "unused",
  successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel",
  createCheckout: async () => {throw new Error("No gateway dispatch expected in reservation test");}});

test("actual checkout transaction rejects short-notice minimum before any reservation", async () => {
  seed("2026-10-23T10:01:00+08:00");
  await assert.rejects(checkout("minimum"), (error) => error.code === "failed-precondition" &&
    error.details.reason === "deposit_not_available_for_short_notice_booking");
  assert.equal(writes.length, 0);
});
test("actual checkout transaction reserves full gross for a short-notice deposit package", async () => {
  seed("2026-10-23T10:01:00+08:00");
  await checkout("full");
  const payment = writes.find((write) => write.kind === "create" && write.path.startsWith("payments/"));
  assert.equal(payment.data.paymentChoice, "full");
  assert.equal(payment.data.amountInCentavos, 100000);
  assert.equal(records.get("providerRequests/request_test").financialSnapshot.packagePaymentTerms.depositRateBps, 3000);
});
test("actual checkout transaction still reserves eligible and legacy minimum amounts", async () => {
  for (const legacy of [false, true]) {
    seed("2026-10-23T10:00:00+08:00", legacy);
    await checkout("minimum");
    const payment = writes.find((write) => write.kind === "create" && write.path.startsWith("payments/"));
    assert.equal(payment.data.paymentChoice, "minimum");
    assert.equal(payment.data.amountInCentavos, 30000);
  }
});
