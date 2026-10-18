const assert = require("node:assert/strict");
const test = require("node:test");
const {readFileSync} = require("node:fs");
require("firebase-admin/app").initializeApp({projectId: "local-unit-test"});
const {buildCalendarDates, parseCalendarInput} = require("../lib/provider-availability/get-customer-provider-calendar-availability.js");
const now = new Date("2026-10-15T16:00:00Z");
const provider = {ownerId: "owner_123", verificationStatus: "approved", isActive: true, isSuspended: false, isDeleted: false,
  providerServiceType: "catering", serviceCategories: ["catering_service"],
  operatingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  unavailableDates: [], bookingLeadTimeDays: 0, minGuestsPerEvent: 1, maxGuestsPerEvent: 100};
const booking = (status, extra = {}) => ({status, eventDate: new Date("2026-10-19T16:00:00Z"), ...extra});
const state = (records, settings = {}) => buildCalendarDates("2026-10", {...provider, ...settings}, records, now).find((d) => d.date === "2026-10-20")?.state;
for (const status of ["confirmed", "in_progress", "completed"]) test(`${status} blocks one Manila date`, () => assert.equal(state([booking(status)]), "booked"));
for (const status of ["accepted", "waiting_for_down_payment", "payment_processing"]) {
  test(`${status} active hold blocks; expiry releases`, () => {
    assert.equal(state([booking(status, {expiresAt: new Date(now.getTime() + 1000)})]), "on_hold");
    assert.equal(state([booking(status, {expiresAt: now})]), undefined);
  });
}
for (const status of ["pending", "rejected", "cancelled", "expired"]) test(`${status} does not occupy`, () => assert.equal(state([booking(status)]), undefined));
test("accepted fallback hold expires", () => {
  assert.equal(state([booking("accepted", {acceptedAt: now})]), "on_hold");
  assert.equal(state([booking("accepted", {acceptedAt: new Date(now.getTime()-86400000)})]), undefined);
});
test("manual blocks, closed days, lead time and Manila past days are unavailable", () => {
  assert.equal(state([], {unavailableDates: ["2026-10-20"]}), "unavailable");
  assert.equal(state([], {operatingDays: ["monday"]}), "unavailable");
  assert.equal(state([], {bookingLeadTimeDays: 5}), "unavailable");
  const dates = buildCalendarDates("2026-10", provider, [], now);
  assert.equal(dates.find((d) => d.date === "2026-10-15").state, "unavailable");
  assert.equal(dates.find((d) => d.date === "2026-10-16"), undefined);
});
test("month bounds and input validation", () => {
  assert.deepEqual(parseCalendarInput({providerId: "provider_123", month: "2026-10"}, now), {providerId: "provider_123", month: "2026-10"});
  for (const month of ["2026-09", "2026-13", "2029-01", "2026-1"]) assert.throws(() => parseCalendarInput({providerId: "provider_123", month}, now));
  assert.throws(() => parseCalendarInput({providerId: "../private", month: "2026-10"}, now));
  assert.throws(() => parseCalendarInput({providerId: "provider_123", month: "2026-10", extra: true}, now));
});
test("date boundary and safe projection contain no private request fields", () => {
  const dates = buildCalendarDates("2026-10", provider, [booking("confirmed", {customerName: "PRIVATE", paymentId: "PRIVATE", id: "PRIVATE"})], now);
  assert.equal(dates.find((d) => d.date === "2026-10-20").state, "booked");
  assert.equal(dates.find((d) => d.date === "2026-10-19"), undefined);
  assert.ok(dates.every((d) => Object.keys(d).sort().join() === "date,state"));
  assert.ok(!JSON.stringify(dates).includes("PRIVATE"));
});
test("callable scopes and bounds authoritative query and preserves security", () => {
  const source = readFileSync(require.resolve("../src/provider-availability/get-customer-provider-calendar-availability.ts"), "utf8");
  for (const fragment of ['requireAuth(request)', 'requireRole(actor.uid, [USER_ROLES.customer])', '...appCheckCallableOptions', 'enforceCallableRateLimit', 'isProviderPubliclyEligible', '.where("providerId", "==", providerId)', 'AVAILABILITY_COUNTED_REQUEST_STATUSES', '.limit(MAX_RECORDS + 1)', 'snapshot.size > MAX_RECORDS']) assert.ok(source.includes(fragment), fragment);
});

test("bounded monthly query isolates providers, uses Manila boundaries and fails closed on overflow", async () => {
  const {db} = require("../lib/shared/firestore.js");
  const {getCustomerProviderCalendarForInput} = require("../lib/provider-availability/get-customer-provider-calendar-availability.js");
  const original = db.collection;
  const filters = [];
  let limit;
  let overflow = false;
  const eligible = {...provider, ownerId: "owner_123", businessName: "Catering", description: "Description", address: "Street", city: "City", province: "Province"};
  const owner = {role: "provider", providerId: "provider_123", accountStatus: "active"};
  const records = [booking("confirmed", {providerId: "provider_123"}), booking("confirmed", {providerId: "provider_other", eventDate: new Date("2026-10-21T00:00:00+08:00")})];
  const query = {
    where(field, op, value) {filters.push([field, op, value]); return this;},
    limit(value) {limit = value; return this;},
    async get() {
      const docs = records.filter((r) => r.providerId === filters.find((f) => f[0] === "providerId")[2]).map((r) => ({data: () => r}));
      return {size: overflow ? 1001 : docs.length, docs};
    },
  };
  db.collection = (name) => name === "providerRequests" ? query : {doc: () => ({get: async () => ({exists: true, data: () => name === "providers" ? eligible : owner})})};
  try {
    const result = await getCustomerProviderCalendarForInput({providerId: "provider_123", month: "2026-10"}, now);
    assert.equal(result.dates.find((d) => d.date === "2026-10-20").state, "booked");
    assert.equal(result.dates.find((d) => d.date === "2026-10-21"), undefined);
    assert.equal(limit, 1001);
    assert.equal(filters.find((f) => f[0] === "eventDate" && f[1] === ">=")[2].toDate().toISOString(), "2026-09-30T16:00:00.000Z");
    assert.equal(filters.find((f) => f[0] === "eventDate" && f[1] === "<")[2].toDate().toISOString(), "2026-10-31T16:00:00.000Z");
    overflow = true;
    await assert.rejects(getCustomerProviderCalendarForInput({providerId: "provider_123", month: "2026-10"}, now), {code: "resource-exhausted"});
    eligible.verificationStatus = "pending";
    await assert.rejects(getCustomerProviderCalendarForInput({providerId: "provider_123", month: "2026-10"}, now), {code: "failed-precondition"});
  } finally {db.collection = original;}
});
