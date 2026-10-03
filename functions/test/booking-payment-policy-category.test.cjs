const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const firestoreModule = require.resolve("../lib/shared/firestore.js");
require.cache[firestoreModule] = {id: firestoreModule, filename: firestoreModule, loaded: true,
  exports: {db: {collection: (collection) => ({doc: (id) => ({id, path: `${collection}/${id}`})})}}};
const {loadBookingPaymentPolicySnapshot} = require("../lib/bookings/load-booking-payment-policy.js");
const {evaluateInitialPaymentEligibility} = require("../lib/payments/initial-payment-eligibility.js");
const category = (code, hours) => ({code, name: code, serviceType: "catering", status: "active",
  bookingPolicy: {payment: {depositMinimumNoticeHours: hours}}});
function fixture(documents = {}) {
  const reads = [];
  return {reads, transaction: {get: async (ref) => {
    reads.push(ref.path);
    return {id: ref.id, exists: Object.hasOwn(documents, ref.path), data: () => documents[ref.path]};
  }}};
}
for (const [code, hours] of [["category_a", 48], ["category_b", 72]]) {
  test(`canonical package ${code} resolves its own category policy`, async () => {
    const {transaction, reads} = fixture({[`serviceCategories/${code}`]: category(code, hours)});
    const policy = await loadBookingPaymentPolicySnapshot({transaction, packageId: "package_test",
      packageData: {serviceCategoryCode: code}, platformSettings: null});
    assert.equal(policy.source.serviceCategoryCode, code);
    assert.equal(policy.depositMinimumNoticeHours, hours);
    assert.ok(reads.every((read) => read === `serviceCategories/${code}`));
  });
}
for (const [name, code, document] of [
  ["missing package category", undefined, undefined],
  ["invalid package category", "UI Category", undefined],
  ["missing category document", "category_a", undefined],
  ["malformed category document", "category_a", {}],
  ["mismatched category code", "category_a", category("category_b", 48)],
  ["inactive category", "category_a", {...category("category_a", 48), status: "discontinued"}],
  ["wrong service type", "category_a", {...category("category_a", 48), serviceType: "addon"}],
]) {
  test(`new package fails closed: ${name}`, async () => {
    const documents = {"serviceCategories/catering_service": category("catering_service", 48)};
    if (document !== undefined) documents[`serviceCategories/${code}`] = document;
    const {transaction, reads} = fixture(documents);
    await assert.rejects(loadBookingPaymentPolicySnapshot({transaction, packageId: "package_test",
      packageData: {serviceCategoryCode: code}, platformSettings: null}),
    (error) => ["invalid-argument", "failed-precondition"].includes(error.code));
    assert.ok(!reads.includes("serviceCategories/catering_service"));
  });
}
test("custom-menu full payment needs no category or fabricated policy", () => {
  const result = evaluateInitialPaymentEligibility({eventDate: new Date("2026-10-25T00:00:00+08:00"),
    eventTime: "10:00", acceptanceTime: new Date("2026-10-23T10:01:00+08:00"),
    packagePaymentTerms: {schemaVersion: 2, source: "canonical_package", paymentPolicy: "full_payment",
      depositRateBps: 10000, balanceDueDaysBeforeEvent: null, balanceDueHoursBeforeEvent: null,
      usesLegacyPaymentTerms: false}, bookingPaymentPolicySnapshot: null});
  assert.equal(result.mode, "full_only");
  assert.equal(result.reason, "package_full_payment");
  assert.equal(result.depositMinimumNoticeHours, null);
  const submission = fs.readFileSync(path.join(__dirname, "../src/bookings/submit-booking-request.ts"), "utf8");
  assert.match(submission, /cateringSelectionType === "package"\s*\? await loadBookingPaymentPolicySnapshot/);
  const acceptance = fs.readFileSync(path.join(__dirname, "../src/provider-requests/accept-provider-request.ts"), "utf8");
  assert.match(acceptance, /const legacyPolicyCapture = !bookingPaymentPolicySnapshot &&\s*packagePaymentTerms\?\.paymentPolicy === "deposit_then_balance"/);
  const loader = fs.readFileSync(path.join(__dirname, "../src/bookings/load-booking-payment-policy.ts"), "utf8");
  assert.doesNotMatch(loader, /catering_service|food_trays_packed_meals/);
});
