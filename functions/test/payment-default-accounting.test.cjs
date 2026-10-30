const test = require('node:test');
const assert = require('node:assert/strict');
const {paymentDefaultAllocation} = require('../lib/bookings/booking-policy-v3.js');
const {paymentDefaultAccountingPlan, requirePaymentDefaultAllocation} = require('../lib/payments/payment-default-accounting-domain.js');
const fixture = (commission = 50000) => ({allocation: paymentDefaultAllocation(500000),
  payment: {paymentId: 'payment_test', amountInCentavos: 500000, currency: 'PHP', financialLedgerSchemaVersion: 1,
    commissionAccruedInCentavos: commission, withholdingInCentavos: 0},
  request: {providerRequestId: 'request_test', mainEventId: 'event_test', providerId: 'provider_test', customerId: 'customer_test',
    status: 'cancelled', cancellationReason: 'remaining_balance_unpaid_at_deadline', financialLedgerSchemaVersion: 1,
    commissionAccruedInCentavos: commission, withholdingAccruedInCentavos: 0},
  earning: {schemaVersion: 1, paymentId: 'payment_test', providerRequestId: 'request_test', currency: 'PHP', status: 'pending',
    earningAmountInCentavos: 500000 - commission, pendingAmountInCentavos: 500000 - commission,
    availableAmountInCentavos: 0, paidAmountInCentavos: 0, reversedAmountInCentavos: 0},
  completedCustomerRefundInCentavos: 350000, timestamp: 'trusted_completion', ledgerEntryId: 'default_ledger_test'});
for (const commission of [0, 25000, 50000, 100000]) test(`default compensation is independent of normal commission ${commission}`, () => {
  const input = fixture(commission);
  const plan = paymentDefaultAccountingPlan(input);
  assert.equal(plan.earningUpdate.netEarningAmountInCentavos, 100000);
  assert.equal(plan.earningUpdate.availableAmountInCentavos, 100000);
  assert.equal(plan.earningUpdate.paidAmountInCentavos, 0);
  assert.equal(plan.providerRequestUpdate.commissionEarnedInCentavos, 0);
  assert.equal(plan.paymentUpdate.commissionReversedInCentavos, commission);
  assert.equal(plan.providerRequestUpdate.feastaCancellationFeeEarnedInCentavos, 50000);
  assert.equal(plan.ledgerRecord.customerRefundCompletedInCentavos, 350000);
  assert.equal(plan.ledgerRecord.providerEconomicEntitlementInCentavos +
    plan.ledgerRecord.feastaCancellationFeeEarnedInCentavos + plan.ledgerRecord.customerRefundCompletedInCentavos, 500000);
  assert.equal(plan.ledgerRecord.entryType, 'payment_default_allocation_completed');
  assert.equal(plan.earningUpdate.pendingAmountInCentavos + plan.earningUpdate.availableAmountInCentavos +
    plan.earningUpdate.paidAmountInCentavos + plan.earningUpdate.reversedAmountInCentavos, input.earning.earningAmountInCentavos);
});
test('pending or incomplete refund cannot finalize economic money movement', () => {
  for (const amount of [0, 100000, 349999, 350001, 500000]) {
    assert.throws(() => paymentDefaultAccountingPlan({...fixture(), completedCustomerRefundInCentavos: amount}));
  }
});
test('dedicated commission adjustment excludes the already recorded proportional reversal', () => {
  const plan = paymentDefaultAccountingPlan({...fixture(), proportionalCommissionReversedInCentavos: 35000});
  assert.equal(plan.ledgerRecord.ordinaryCommissionAdjustmentInCentavos, 15000);
  assert.equal(plan.ledgerRecord.ordinaryCommissionReversedAfterInCentavos, 50000);
  assert.equal(plan.providerRequestUpdate.commissionEarnedInCentavos, 0);
});
test('paid out provider earnings fail closed without rewriting settlement history', () => {
  const input = fixture();
  const earning = {...input.earning, paidAmountInCentavos: 450000, pendingAmountInCentavos: 0, status: 'paid'};
  const before = structuredClone(earning);
  assert.throws(() => paymentDefaultAccountingPlan({...input, earning}), /payout requires reconciliation/);
  assert.deepEqual(earning, before);
});
test('withholding and forged allocation require reconciliation', () => {
  assert.throws(() => paymentDefaultAccountingPlan({...fixture(), payment: {...fixture().payment, withholdingInCentavos: 1}}));
  for (const field of Object.keys(paymentDefaultAllocation(500000))) {
    const forged = {...paymentDefaultAllocation(500000), [field]: 42};
    assert.throws(() => requirePaymentDefaultAllocation(forged, 500000));
  }
});
