const {before, after, test} = require("node:test");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const {initializeTestEnvironment, assertFails, assertSucceeds} =
  require("@firebase/rules-unit-testing");
const {doc, setDoc, updateDoc, deleteField} = require("firebase/firestore");
const {authenticated, seedDocuments, userData} = require("./rules-test-helpers.cjs");
let environment;
before(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  environment = await initializeTestEnvironment({projectId: "demo-feasta-relationships",
    firestore: {host, port: Number(port), rules: readFileSync(
      path.resolve(__dirname, "../../../firebase/firestore.rules"), "utf8")}});
  await seedDocuments(environment, {
    "users/customer_relationship": userData("customer_relationship", "customer",
      {isPhoneVerified: true}),
    "users/admin_relationship": userData("admin_relationship", "admin"),
    "users/provider_relationship": userData("provider_relationship", "provider"),
    "providers/provider_relationship-provider": {ownerId: "provider_relationship"},
    "mainEvents/event_relationship": {customerId: "customer_relationship", status: "draft",
      providerRequestRelationshipVersion: 2, activeProviderRequestIds: ["request_active"],
      replacesProviderRequestId: null},
    "providerRequests/request_relationship": {customerId: "customer_relationship",
      providerId: "provider_relationship-provider", mainEventId: "event_relationship",
      replacesProviderRequestId: null},
  });
});
after(async () => environment?.cleanup());

test("normal customer draft creation remains allowed", async () => {
  const db = authenticated(environment, "customer_relationship", "customer").firestore();
  await assertSucceeds(setDoc(doc(db, "mainEvents/plain_draft"),
    {customerId: "customer_relationship", status: "draft"}));
});

test("customer cannot inject relationship fields into a draft", async () => {
  const db = authenticated(environment, "customer_relationship", "customer").firestore();
  for (const [field, value] of Object.entries({providerRequestRelationshipVersion: 2,
    activeProviderRequestIds: ["request_active"], replacesProviderRequestId: "request_previous"})) {
    await assertFails(setDoc(doc(db, `mainEvents/forged_${field}`),
      {customerId: "customer_relationship", status: "draft", [field]: value}));
  }
});

test("customer and browser admin cannot change or delete existing event relationship fields", async () => {
  for (const role of ["customer", "admin"]) {
    const db = authenticated(environment, `${role}_relationship`, role).firestore();
    for (const [field, value] of Object.entries({providerRequestRelationshipVersion: 1,
      activeProviderRequestIds: [], replacesProviderRequestId: "request_previous"})) {
      await assertFails(updateDoc(doc(db, "mainEvents/event_relationship"), {[field]: value}));
      await assertFails(updateDoc(doc(db, "mainEvents/event_relationship"), {[field]: deleteField()}));
    }
  }
});

test("provider/customer/admin clients cannot create requests or forge predecessor evidence", async () => {
  for (const role of ["provider", "customer", "admin"]) {
    const db = authenticated(environment, `${role}_relationship`, role).firestore();
    await assertFails(setDoc(doc(db, `providerRequests/forged_${role}`),
      {replacesProviderRequestId: "request_previous"}));
    await assertFails(updateDoc(doc(db, "providerRequests/request_relationship"),
      {replacesProviderRequestId: "request_previous"}));
    await assertFails(updateDoc(doc(db, "providerRequests/request_relationship"),
      {replacesProviderRequestId: deleteField()}));
  }
});
