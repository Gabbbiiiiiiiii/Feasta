const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {canonicalBalanceTiming, scheduledEventStart, frozenCanonicalBalanceTiming,
  canonicalBalanceSchedule} = require("../lib/payments/canonical-balance-timing.js");
const {remainingBalanceLifecyclePlan} = require("../lib/payments/remaining-balance-lifecycle-domain.js");
const {parseCanonicalPackageWrite, assertPackagePaymentTermsWithinPolicy} = require("../lib/packages/package-domain.js");
const {buildPackagePaymentTermsSnapshot, parsePackagePaymentTermsSnapshot} = require("../lib/payments/package-payment-terms.js");
const {requireNewBookingCanonicalPaymentTerms} = require("../lib/bookings/canonical-booking-payment-policy.js");
const {depositReceivedNotification} = require("../lib/payments/payment-lifecycle-messaging.js");
const {validateTrustedPaymentUpdate} = require("../lib/payments/payment-security.js");
const ts = (date) => ({toDate: () => new Date(date)});
const eventDate = new Date("2026-10-25T00:00:00+08:00");
const timing = canonicalBalanceTiming(eventDate, "10:00");
const request = () => ({status: "confirmed", settlementStatus: "deposit_settled",
  remainingBalanceTimingSchemaVersion: 2, balanceDueHoursBeforeEvent: 24,
  remainingBalanceStatus: "not_due", remainingBalanceDueAt: ts(timing.dueAt),
  eventStartAt: ts(timing.eventStartAt),
  remainingBalanceReminderAt: ts(timing.reminderAt), outstandingAmountInCentavos: 70000,
  financialSnapshot: {schemaVersion: 1, currency: "PHP", remainingBalanceInCentavos: 70000},
});

test("Manila event clock produces exact T-24 due and T-48 reminder", () => {
  assert.equal(timing.eventStartAt.toISOString(), "2026-10-25T02:00:00.000Z");
  assert.equal(timing.dueAt.toISOString(), "2026-10-24T02:00:00.000Z");
  assert.equal(timing.reminderAt.toISOString(), "2026-10-23T02:00:00.000Z");
  assert.equal(canonicalBalanceTiming(eventDate, "19:30").dueAt.toISOString(), "2026-10-24T11:30:00.000Z");
  assert.equal(canonicalBalanceTiming(eventDate, "00:00").dueAt.toISOString(), "2026-10-23T16:00:00.000Z");
});
test("event start rejects invalid authoritative clocks", () => {
  for (const clock of [null, "24:00", "10:60", "10", "10:00 AM"]) assert.throws(() => scheduledEventStart(eventDate, clock));
  assert.throws(() => scheduledEventStart(new Date(NaN), "10:00"));
});

for (const [label, now, expected] of [
  ["before reminder", new Date(timing.reminderAt - 1), "not_due"],
  ["at reminder", timing.reminderAt, "due_soon"],
  ["at deadline", timing.dueAt, "due"],
]) {
  test(`Provider acceptance initializes v2 status ${expected} ${label}`, () => {
    const schedule = canonicalBalanceSchedule({...timing, now, remainingAmountInCentavos: 70000});
    assert.equal(schedule.status, expected);
    const source = fs.readFileSync(path.join(__dirname, "../src/provider-requests/accept-provider-request.ts"), "utf8");
    assert.match(source, /canonicalBalanceSchedule\(\{\.\.\.canonicalTiming, now: acceptanceTime,/);
    assert.match(source, /canonicalTiming && remainingBalanceTiming\s*\? \{remainingBalanceStatus: remainingBalanceTiming\.status\}\s*: \{\}/);
    assert.doesNotMatch(source, /remainingBalanceStatus: "not_due"/);
  });
}
test("new booking terms from old canonical packages upgrade to v2 while old snapshots stay v1", () => {
  const old = buildPackagePaymentTermsSnapshot({paymentPolicy: "deposit_then_balance", depositPercentage: 50,
    downPaymentPercentage: 50, balanceDueDaysBeforeEvent: 30});
  assert.deepEqual(parsePackagePaymentTermsSnapshot(old), old);
  const current = requireNewBookingCanonicalPaymentTerms(old);
  assert.equal(current.schemaVersion, 2);
  assert.equal(current.balanceDueHoursBeforeEvent, 24);
  assert.equal(current.balanceDueDaysBeforeEvent, null);
  assert.equal(old.balanceDueDaysBeforeEvent, 30);
});
test("new package writes ignore Provider deadline input and obsolete Admin day bounds", () => {
  const base = {name: "Catering", description: "A complete catering package", eventType: "wedding", price: 5000,
    paymentPolicy: "deposit_then_balance", depositPercentage: 50, minimumGuests: 20, maximumGuests: 100};
  for (const deadline of [undefined, 0, 30, 365, "malicious"]) {
    const result = parseCanonicalPackageWrite({...base, balanceDueDaysBeforeEvent: deadline, balanceDueHoursBeforeEvent: 300});
    assert.equal(result.balanceDueDaysBeforeEvent, null);
    assert.doesNotThrow(() => assertPackagePaymentTermsWithinPolicy(result, {
      minimumDepositRateBps: 2000, maximumDepositRateBps: 8000,
      minimumBalanceDueDaysBeforeEvent: 20, maximumBalanceDueDaysBeforeEvent: 30,
    }));
  }
});
test("obsolete malformed day settings cannot override valid Admin deposit bounds", () => {
  const {packagePaymentPolicyBoundsFromData} = require("../lib/packages/package-payment-policy.js");
  const result = packagePaymentPolicyBoundsFromData({minimumDepositRateBps: 3000,
    maximumDepositRateBps: 7000, minimumBalanceDueDaysBeforeEvent: "obsolete"});
  assert.equal(result.minimumDepositRateBps, 3000);
  assert.equal(result.maximumDepositRateBps, 7000);
});
test("v2 full-payment terms carry no remaining deadline", () => {
  const terms = buildPackagePaymentTermsSnapshot({paymentTermsSchemaVersion: 2, paymentPolicy: "full_payment",
    depositPercentage: 100, downPaymentPercentage: 100, balanceDueHoursBeforeEvent: null, balanceDueDaysBeforeEvent: null});
  assert.equal(terms.schemaVersion, 2);
  assert.equal(terms.balanceDueHoursBeforeEvent, null);
  assert.equal(terms.balanceDueDaysBeforeEvent, null);
});
test("frozen v2 timestamps survive later package, event and legacy policy edits", () => {
  const saved = request();
  Object.assign(saved, {eventDate: ts("2027-01-01"), eventTime: "19:30", balanceDueDaysBeforeEvent: 30,
    remainingBalanceGracePeriodDays: 10, packagePaymentTerms: {balanceDueHoursBeforeEvent: 300}});
  assert.deepEqual(frozenCanonicalBalanceTiming(saved), {dueAt: timing.dueAt, reminderAt: timing.reminderAt});
});
test("v2 lifecycle starts due-soon exactly at reminderAt and due exactly at dueAt without grace", () => {
  for (const [now, status, title] of [
    [new Date(timing.reminderAt - 1), "not_due", undefined],
    [timing.reminderAt, "due_soon", "Remaining balance due tomorrow"],
    [new Date(timing.dueAt - 1), "due_soon", "Remaining balance due tomorrow"],
    [timing.dueAt, "due", "Remaining balance due now"],
    [new Date(timing.dueAt.getTime() + 3 * 86400000), "due", "Remaining balance due now"],
  ]) {
    const plan = remainingBalanceLifecyclePlan({providerRequestId: "request_test", providerRequest: request(), now});
    assert.equal(plan.nextStatus, status);
    assert.equal(plan.reminder?.title, title);
    assert.equal(plan.graceEndsAt, null);
    if (title) { assert.match(plan.reminder.message, /700\.00/); assert.match(plan.reminder.message, /October 24, 2026/); assert.match(plan.reminder.message, /10:00/); }
    const rerun = remainingBalanceLifecyclePlan({providerRequestId: "request_test",
      providerRequest: {...request(), remainingBalanceStatus: status}, now});
    assert.equal(rerun.reminder, null);
    assert.equal(rerun.changed, false);
  }
});
test("v2 remaining balance can be paid early", () => {
  assert.equal(canonicalBalanceSchedule({...timing, remainingAmountInCentavos: 0,
    now: new Date("2026-10-01")}).status, "paid");
});
test("deposit notification uses settled authoritative amount and frozen exact deadline", () => {
  const input = {status: "paid", paymentChoice: "minimum", providerRequest: request(),
    settlementUpdate: {settlementStatus: "deposit_settled", outstandingAmountInCentavos: 70000}};
  const notification = depositReceivedNotification(input);
  assert.equal(notification.title, "Deposit received");
  assert.match(notification.message, /700\.00/);
  assert.match(notification.message, /October 24, 2026/);
  assert.match(notification.message, /10:00/);
  for (const paymentChoice of ["full", "remaining_balance"]) assert.equal(depositReceivedNotification({...input, paymentChoice}), null);
  assert.equal(depositReceivedNotification({...input, status: "failed"}), null);
  assert.equal(depositReceivedNotification({...input, settlementUpdate: {...input.settlementUpdate, outstandingAmountInCentavos: 1}}), null);
});
test("webhook replay is rejected before the deposit notification transaction write", () => {
  assert.equal(validateTrustedPaymentUpdate({currentStatus: "paid", nextStatus: "paid",
    expectedAmountInCentavos: 30000, actualAmountInCentavos: 30000, expectedCurrency: "PHP", actualCurrency: "PHP"}), "already_applied");
  const source = fs.readFileSync(path.join(__dirname, "../src/payments/process-webhook.ts"), "utf8");
  assert.ok(source.indexOf("if (eventSnapshot.exists)") < source.indexOf("const depositNotification ="));
  assert.ok(source.indexOf("if (validationReason)") < source.indexOf("const depositNotification ="));
  assert.match(source, /settlementUpdate: requestPaymentUpdate\.update/);
});
