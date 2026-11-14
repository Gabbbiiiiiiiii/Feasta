require('firebase-admin/app').initializeApp({projectId: 'demo-v4-offline'});
const test = require('node:test');
const assert = require('node:assert/strict');
const {Timestamp} = require('firebase-admin/firestore');
const {calculateInitialPaymentDeadlineV4: calculate, originalInitialPaymentDeadline: original} = require('../lib/payments/initial-payment-deadline.js');
const {requireInitialPaymentHold} = require('../lib/payments/initial-payment-reservation.js');
const {providerRequestAvailabilityState: state} = require('../lib/provider-availability/validate-provider-availability.js');
const date = (day, time) => new Date(`2026-11-${day}T${time}:00+08:00`);
const hour = 3600000;
for (const [name, time, rush, expectedDay, expectedTime] of [
  ['standard accepted just before 7 AM', '06:59', false, '01', '10:00'],
  ['standard 9 AM', '09:00', false, '01', '15:00'],
  ['standard 3 PM', '15:00', false, '01', '21:00'],
  ['standard 5 PM', '17:00', false, '02', '10:00'],
  ['standard 11 PM', '23:00', false, '02', '10:00'],
  ['rush 1 PM', '13:00', true, '01', '15:00'],
  ['rush 8 PM / base exactly 10 PM', '20:00', true, '02', '10:00'],
  ['rush 1 AM', '01:00', true, '01', '10:00'],
  ['acceptance exactly 10 PM', '22:00', true, '02', '10:00'],
  ['acceptance exactly 7 AM', '07:00', false, '01', '13:00'],
  ['base exactly 7 AM / overnight acceptance', '01:00', false, '01', '10:00'],
]) test(name, () => {
  const acceptedAt = date('01', time);
  const eventStartAt = new Date(+acceptedAt + (rush ? 168 : 169) * hour);
  assert.equal(+calculate({acceptedAt, eventStartAt}), +date(expectedDay, expectedTime));
});
test('exactly 168 hours is rush; one millisecond more is standard', () => {
  const acceptedAt = date('01', '09:00');
  assert.equal(+calculate({acceptedAt, eventStartAt: new Date(+acceptedAt + 168 * hour)}), +acceptedAt + 2 * hour);
  assert.equal(+calculate({acceptedAt, eventStartAt: new Date(+acceptedAt + 168 * hour + 1)}), +acceptedAt + 6 * hour);
});
test('hard cutoff and legacy event start win; nonpositive and invalid windows rejected', () => {
  const acceptedAt = date('01', '20:00');
  assert.equal(+calculate({acceptedAt, eventStartAt: date('03', '21:00'), hardDeadlines: [date('01', '21:00')]}), +date('01', '21:00'));
  assert.equal(+calculate({acceptedAt, eventStartAt: date('01', '21:00')}), +date('01', '21:00'));
  assert.throws(() => calculate({acceptedAt, eventStartAt: acceptedAt}));
  assert.throws(() => calculate({acceptedAt, eventStartAt: new Date(NaN)}));
});
function frozen() {
  const acceptedAt = date('01', '09:00'), eventStartAt = date('12', '12:00');
  const deadline = calculate({acceptedAt, eventStartAt});
  return {status: 'waiting_for_down_payment', paymentStatus: 'unpaid', acceptedAt: Timestamp.fromDate(acceptedAt),
    eventDate: Timestamp.fromDate(date('12', '00:00')), eventTime: '12:00', eventStartAt: Timestamp.fromDate(eventStartAt),
    initialPaymentDeadlinePolicyVersion: 4, initialPaymentDeadlineAt: Timestamp.fromDate(deadline), expiresAt: Timestamp.fromDate(deadline)};
}
test('new frozen deadline synchronizes checkout and capacity independently of worker', () => {
  const request = frozen(), at = request.expiresAt.toDate();
  assert.equal(original(request).toMillis(), +at);
  assert.doesNotThrow(() => requireInitialPaymentHold(request, new Date(+at - 1)));
  assert.throws(() => requireInitialPaymentHold(request, at), {code: 'failed-precondition'});
  assert.equal(state({...request, now: new Date(+at - 1)}), 'temporary_hold');
  assert.equal(state({...request, now: at}), 'released');
  for (const patch of [{paymentId: 'pending'}, {initialPaymentDispatchReservedAt: request.acceptedAt}, {reconciliationRequired: true}]) {
    assert.equal(state({...request, ...patch, now: at}), 'payment_reconciliation');
  }
});
test('stale, malformed, unsupported and missing evidence fail closed', () => {
  const request = frozen();
  for (const patch of [{initialPaymentDeadlinePolicyVersion: 5}, {initialPaymentDeadlineAt: null},
    {expiresAt: Timestamp.fromMillis(request.expiresAt.toMillis() + 1)}, {eventStartAt: null},
    {acceptedAt: Timestamp.fromMillis(request.acceptedAt.toMillis() + 1)}, {eventTime: '13:00'}]) {
    assert.throws(() => original({...request, ...patch}));
    assert.throws(() => requireInitialPaymentHold({...request, ...patch}, request.acceptedAt.toDate()));
    assert.equal(state({...request, ...patch, now: request.expiresAt.toDate()}), 'payment_reconciliation');
  }
});
test('unversioned acceptance retains original 24-hour behavior', () => {
  const request = frozen(); delete request.initialPaymentDeadlinePolicyVersion; delete request.initialPaymentDeadlineAt;
  request.expiresAt = Timestamp.fromMillis(request.acceptedAt.toMillis() + 24 * hour);
  assert.equal(original(request).toMillis(), request.expiresAt.toMillis());
});
test('acceptance freezes V4 evidence on one server-controlled clock and preserves replay path', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/provider-requests/accept-provider-request.ts'), 'utf8');
  assert.match(source, /initialPaymentDeadlinePolicyVersion: INITIAL_PAYMENT_DEADLINE_POLICY_VERSION/);
  assert.match(source, /initialPaymentDeadlineAt: paymentDeadline/);
  assert.match(source, /acceptedAt:\s*Timestamp.fromDate\(acceptanceTime\)/);
  assert.match(source, /financialSnapshotCapturedAt:\s*Timestamp.fromDate\(acceptanceTime\)/);
  assert.ok(source.indexOf('existingAcceptancePlan(') < source.indexOf('calculateInitialPaymentDeadlineV4({'));
});

test('V4 frozen V3 hard cutoff truncates overnight protection and rejects altered evidence', () => {
  const {bookingPolicyV3Evidence} = require('../lib/bookings/booking-policy-v3.js');
  const acceptedAt = date('01', '20:00'), eventStartAt = date('02', '21:00');
  const evidence = bookingPolicyV3Evidence(eventStartAt, value => Timestamp.fromDate(value));
  const at = calculate({acceptedAt, eventStartAt, hardDeadlines: [evidence.hardPaymentDeadlineAt.toDate()]});
  const request = {...frozen(), ...evidence, acceptedAt: Timestamp.fromDate(acceptedAt),
    eventDate: Timestamp.fromDate(date('02', '00:00')), eventTime: '21:00',
    initialPaymentDeadlineAt: Timestamp.fromDate(at), expiresAt: Timestamp.fromDate(at)};
  assert.equal(original(request).toMillis(), +date('01', '21:00'));
  assert.throws(() => original({...request, hardPaymentDeadlineAt: Timestamp.fromMillis(+at + 1)}));
});
