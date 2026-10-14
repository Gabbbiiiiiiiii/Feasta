const assert = require("node:assert/strict");
const {before, after, test} = require("node:test");

// Fail closed: this suite must never initialize against a real Firebase project.
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Firestore emulator required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "Auth emulator required");
assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
require("firebase-admin/app").initializeApp({projectId: process.env.GCLOUD_PROJECT});
const {getAuth} = require("firebase-admin/auth");
const {db} = require("../../lib/shared/firestore.js");
const handlers = require("../../lib/admin/service-category-management.js");
const capacityCapabilities = {requiresGuestCapacity: false, usesStaffCapacity: true, usesEquipmentCapacity: false};
const adminUid = "classification-admin";
const customerUid = "classification-customer";
const request = (data, uid = adminUid) => ({data, auth: {uid, token: {}}, rawRequest: {headers: {}, ip: "127.0.0.1"}});
const call = (name, data, uid) => handlers[name].run(request(data, uid));
const ref = code => db.collection("serviceCategories").doc(code);
const create = (code, serviceType = "addon") => call("createServiceCategory", {code, name: code.replaceAll("_", " "), serviceType, capacityCapabilities});
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);

before(async () => {
  for (const [uid, role] of [[adminUid, "admin"], [customerUid, "customer"]]) {
    await getAuth().createUser({uid});
    await db.collection("users").doc(uid).set({uid, role, accountStatus: "active", isActive: true, isBlocked: false});
  }
});
after(async () => {await db.terminate();});

for (const serviceType of ["catering", "addon"]) {
  test(`creates and edits ${serviceType} with original serialization and capacity flags`, async () => {
    const code = `classification_${serviceType}`;
    await create(code, serviceType);
    assert.equal((await ref(code).get()).data().serviceType, serviceType);
    await call("updateServiceCategory", {code, name: "Updated category", serviceType, capacityCapabilities});
    const stored = (await ref(code).get()).data();
    assert.equal(stored.serviceType, serviceType);
    assert.deepEqual(stored.capacityCapabilities, capacityCapabilities);
    const audits = await db.collection("adminLogs").where("targetId", "==", code).get();
    assert.ok(audits.size >= 2, "creation and editing remain audited");
  });
}
test("unknown and combined category identifiers are rejected", async () => {
  for (const serviceType of ["both", "Other Event Services", "unknown"]) {
    await rejects(() => create("classification_invalid", serviceType), "invalid-argument");
    assert.equal((await ref("classification_invalid").get()).exists, false);
  }
});
test("active categories cannot change classification or be deleted", async () => {
  const code = "classification_active"; await create(code);
  await rejects(() => call("updateServiceCategory", {code, name: "Active category", serviceType: "catering", capacityCapabilities}), "failed-precondition");
  await rejects(() => call("deleteServiceCategory", {code}), "failed-precondition");
  assert.equal((await ref(code).get()).data().serviceType, "addon");
});
test("discontinuation and reactivation preserve combined providers and category associations", async () => {
  const code = "classification_used"; await create(code);
  const provider = {providerServiceType: "both", providerCategory: code, serviceCategories: ["catering_service", code]};
  await db.collection("providers").doc("classification-provider").set(provider);
  await call("discontinueServiceCategory", {code});
  assert.equal((await ref(code).get()).data().status, "discontinued");
  await rejects(() => call("deleteServiceCategory", {code}), "failed-precondition");
  await rejects(() => call("updateServiceCategory", {code, name: "Used category", serviceType: "catering", capacityCapabilities}), "failed-precondition");
  await call("reactivateServiceCategory", {code});
  assert.equal((await ref(code).get()).data().status, "active");
  assert.equal((await ref(code).get()).data().serviceType, "addon");
  assert.deepEqual((await db.collection("providers").doc("classification-provider").get()).data(), provider);
});
test("booking add-on associations and prices prevent category deletion and stay unchanged", async () => {
  const code = "classification_priced"; await create(code);
  const addon = {category: code, name: "Optional photography", price: 4500, providerId: "classification-provider"};
  await db.collection("addons").doc("classification-addon").set(addon);
  await call("discontinueServiceCategory", {code});
  await rejects(() => call("deleteServiceCategory", {code}), "failed-precondition");
  assert.deepEqual((await db.collection("addons").doc("classification-addon").get()).data(), addon);
});
test("unused discontinued categories can be deleted", async () => {
  const code = "classification_unused"; await create(code);
  await call("discontinueServiceCategory", {code}); await call("deleteServiceCategory", {code});
  assert.equal((await ref(code).get()).exists, false);
});
test("customers remain unable to manage categories", async () => {
  await rejects(() => call("createServiceCategory", {code: "classification_denied", name: "Denied category", serviceType: "addon", capacityCapabilities}, customerUid), "permission-denied");
  assert.equal((await ref("classification_denied").get()).exists, false);
});
