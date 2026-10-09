const test = require('node:test');
const assert = require('node:assert/strict');
const {Timestamp} = require('firebase-admin/firestore');
const {bookingPolicyTimingV3, frozenBookingPolicyTimingV3, balanceStatusV3,
  effectiveBookingStageV3, paymentDefaultAllocation, bookingPolicyV3Evidence} = require('../lib/bookings/booking-policy-v3.js');
const {evaluateSubmissionPaymentEligibility, enforceInitialPaymentEligibility} = require('../lib/payments/initial-payment-eligibility.js');
const {buildBookingPaymentPolicySnapshot} = require('../lib/bookings/booking-payment-eligibility-policy.js');
const {rejectClientBookingFinancialAuthority} = require('../lib/bookings/booking-package-offer.js');
const event = new Date('2026-10-16T18:00:00+08:00');
const timing = bookingPolicyTimingV3(event);
const frozenTiming = Object.fromEntries(Object.entries(timing).map(([key, value]) => [key, Timestamp.fromDate(value)]));
const request = () => ({...frozenTiming, ...bookingPolicyV3Evidence(event, Timestamp.fromDate), status: 'confirmed',
  settlementStatus: 'fully_settled', outstandingAmountInCentavos: 0});
const terms = {schemaVersion: 2, source: 'canonical_package', paymentPolicy: 'deposit_then_balance',
  depositRateBps: 5000, balanceDueDaysBeforeEvent: null, balanceDueHoursBeforeEvent: 24, usesLegacyPaymentTerms: false};
const policy = buildBookingPaymentPolicySnapshot({platformSettings: null, serviceCategoryCode: 'catering_service',
  serviceCategory: {}, packageId: 'package_test', packageData: {}});

test('Manila 72/48/24/0 boundaries and strict immutable v3 parser', () => {
  for (const [key, date] of [['depositEligibilityCutoffAt', '2026-10-13T10:00:00.000Z'],
    ['remainingBalanceDueAt', '2026-10-14T10:00:00.000Z'], ['hardPaymentDeadlineAt', '2026-10-15T10:00:00.000Z'],
    ['preparationStartsAt', '2026-10-15T10:00:00.000Z'], ['eventStartAt', '2026-10-16T10:00:00.000Z']]) {
    assert.equal(timing[key].toISOString(), date);
    assert.equal(frozenBookingPolicyTimingV3(request())[key].toISOString(), date);
    assert.throws(() => frozenBookingPolicyTimingV3({...request(), [key]: Timestamp.fromMillis(0)}));
  }
  assert.throws(() => frozenBookingPolicyTimingV3({...request(), remainingBalanceTimingSchemaVersion: 2}));
});
for (const [offset, eligible] of [[-1000, true], [0, true], [1000, false]]) {
  test(`submission cutoff offset ${offset} freezes eligibility`, () => {
    const submitted = new Date(timing.depositEligibilityCutoffAt.getTime() + offset);
    const evaluated = evaluateSubmissionPaymentEligibility({eventDate: event, eventTime: '18:00',
      submissionTime: submitted, packagePaymentTerms: terms, bookingPaymentPolicySnapshot: policy});
    assert.equal(evaluated.depositEligible, eligible);
    const evidence = {initialPaymentEligibilitySchemaVersion: 2, bookingPaymentPolicySnapshot: policy,
      initialPaymentEligibility: {...evaluated, evaluatedAt: Timestamp.fromDate(submitted),
        submittedAt: Timestamp.fromDate(submitted), eventStartAt: Timestamp.fromDate(event)}};
    for (const delay of [300000, 8 * 3600000]) {
      const accepted = {...evidence, acceptedAt: Timestamp.fromMillis(submitted.getTime() + delay)};
      assert.doesNotThrow(() => enforceInitialPaymentEligibility(accepted, 'full'));
      if (eligible) assert.doesNotThrow(() => enforceInitialPaymentEligibility(accepted, 'minimum'));
      else assert.throws(() => enforceInitialPaymentEligibility(accepted, 'minimum'));
    }
    assert.throws(() => enforceInitialPaymentEligibility({...evidence, initialPaymentEligibility: {
      ...evidence.initialPaymentEligibility, submittedAt: Timestamp.fromMillis(submitted.getTime() + 1)}}, 'full'));
  });
}
test('browser cannot author new submission/agreement financial authorities', () => {
  for (const field of ['submittedAt', 'submissionTime', 'evaluatedAt', 'authorityTimeSource',
    'bookingPaymentAgreement', 'agreementSchemaVersion', 'customerDefaultRefundRateBps',
    'providerReservationCompRateBps', 'feastaCancellationFeeRateBps', 'hardPaymentDeadlineAt', 'preparationStartsAt']) {
    assert.throws(() => rejectClientBookingFinancialAuthority({[field]: true}));
  }
});
test('balance due, grace, deadline and processing hold are separate', () => {
  const status = (now, patch = {}) => balanceStatusV3({...timing, now: new Date(now), outstandingAmountInCentavos: 500000, ...patch});
  assert.equal(status(timing.remainingBalanceDueAt.getTime() - 1), 'not_due');
  assert.equal(status(timing.remainingBalanceDueAt), 'due');
  assert.equal(status(timing.remainingBalanceDueAt.getTime() + 1), 'grace_period');
  assert.equal(status(timing.hardPaymentDeadlineAt.getTime() - 1), 'grace_period');
  assert.equal(status(timing.hardPaymentDeadlineAt), 'overdue');
  assert.equal(status(timing.hardPaymentDeadlineAt, {paymentConfirmationHold: true}), 'payment_confirmation_hold');
  assert.equal(status(timing.hardPaymentDeadlineAt, {outstandingAmountInCentavos: 0}), 'paid');
  assert.equal(status(timing.hardPaymentDeadlineAt, {cancelled: true}), 'cancelled');
});
test('automatic preparation and event boundaries require fully settled unlocked booking', () => {
  const stage = (now, patch = {}) => effectiveBookingStageV3({request: {...request(), ...patch}, now: new Date(now)});
  assert.equal(stage(timing.preparationStartsAt.getTime() - 1), 'upcoming');
  assert.equal(stage(timing.preparationStartsAt), 'preparation_started');
  assert.equal(stage(event.getTime() - 1), 'preparation_started');
  assert.equal(stage(event), 'service_started');
  for (const patch of [{outstandingAmountInCentavos: 1}, {settlementStatus: 'deposit_settled'},
    {remainingBalanceEnforcement: {status: 'on_hold'}}, {activeCancellationRequestId: 'locked'},
    {refundEligibilityState: {activeCancellationRequestId: 'locked'}}]) assert.equal(stage(event, patch), 'blocked');
  assert.equal(stage(event, {status: 'cancelled'}), 'cancelled');
  assert.equal(stage(event.getTime() + 86400000), 'service_started'); // Completion remains provider-confirmed.
});
test('70/20/10 allocation uses paid deposit with deterministic centavo residual', () => {
  const allocation = paymentDefaultAllocation(500000);
  assert.equal(allocation.customerDefaultRefundAmountInCentavos, 350000);
  assert.equal(allocation.providerReservationCompAmountInCentavos, 100000);
  assert.equal(allocation.feastaCancellationFeeAmountInCentavos, 50000);
  for (const amount of [1, 2, 7, 11, 101, 250001, 500009, Number.MAX_SAFE_INTEGER]) {
    const result = paymentDefaultAllocation(amount);
    assert.equal(result.customerDefaultRefundAmountInCentavos + result.providerReservationCompAmountInCentavos +
      result.feastaCancellationFeeAmountInCentavos, amount);
    assert.equal(result.customerRefundRateBps + result.providerReservationCompRateBps + result.feastaCancellationFeeRateBps, 10000);
    assert.deepEqual(paymentDefaultAllocation(amount), result);
  }
  for (const amount of [0, -1, 0.1, NaN, Infinity]) assert.throws(() => paymentDefaultAllocation(amount));
});

test('v3 rejects missing or mixed lifecycle and grace evidence', () => {
  for (const patch of [{bookingLifecyclePolicySnapshot: null}, {balanceDueDaysBeforeEvent: 2},
    {remainingBalanceGracePeriodDays: 1}, {remainingBalanceGraceEndsAt: Timestamp.fromMillis(0)},
    {bookingLifecyclePolicySnapshot: {...request().bookingLifecyclePolicySnapshot, providerStartsManually: true}}]) {
    assert.throws(() => frozenBookingPolicyTimingV3({...request(), ...patch}));
  }
});

test('manual preparation is rejected for v3 and retains legacy authority', () => {
  const {initializeApp, getApps} = require('firebase-admin/app');
  if (!getApps().length) initializeApp({projectId: 'demo-feasta-policy-unit'});
  const {assertManualPreparationPolicy} = require('../lib/cancellations/advance-refund-eligibility-stage.js');
  assert.throws(() => assertManualPreparationPolicy(request()),
    error => error.code === 'failed-precondition' && error.details.reason === 'automatic_preparation_policy');
  for (const version of [undefined, 1, 2]) {
    assert.doesNotThrow(() => assertManualPreparationPolicy({remainingBalanceTimingSchemaVersion: version}));
  }
});

test('provider completion time rejects early completion and permits exact end including overnight service', () => {
  const {assertV3CompletionTime} = require('../lib/provider-requests/update-provider-booking-lifecycle.js');
  for (const [eventEndTime, end] of [['20:00', '2026-10-16T20:00:00+08:00'], ['02:00', '2026-10-17T02:00:00+08:00']]) {
    const saved = {...request(), eventDate: Timestamp.fromDate(event), eventEndTime};
    assert.throws(() => assertV3CompletionTime(saved, new Date(new Date(end).getTime() - 1)), /completion time/);
    assert.doesNotThrow(() => assertV3CompletionTime(saved, new Date(end)));
  }
  assert.throws(() => assertV3CompletionTime(request(), new Date(event)));
});
