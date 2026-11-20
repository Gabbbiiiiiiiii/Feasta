const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  mockWithdrawalIdForRequest,
  parseMockWithdrawalRequest,
  planMockWithdrawal,
  applyMockWithdrawalAllocation,
  buildMockWithdrawalRecord,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "provider-finance",
  "provider-mock-withdrawal-domain.js",
));

function earning(overrides = {}) {
  return {
    schemaVersion: 1,
    earningId: "payment_11111111",
    paymentId: "payment_11111111",
    providerRequestId: "provider_request_11111111",
    mainEventId: "main_event_11111111",
    providerId: "provider_11111111",
    customerId: "customer_11111111",
    currency: "PHP",
    earningAmountInCentavos: 100000,
    pendingAmountInCentavos: 0,
    availableAmountInCentavos: 100000,
    paidAmountInCentavos: 0,
    reversedAmountInCentavos: 0,
    ...overrides,
  };
}

function settlement(overrides = {}) {
  return {
    schemaVersion: 1,
    settlementId: "settlement_11111111",
    earningId: "payment_11111111",
    paymentId: "payment_11111111",
    providerRequestId: "provider_request_11111111",
    mainEventId: "main_event_11111111",
    providerId: "provider_11111111",
    customerId: "customer_11111111",
    currency: "PHP",
    originalEarningAmountInCentavos: 100000,
    reversedAmountInCentavos: 0,
    netSettlementAmountInCentavos: 100000,
    reservedAmountInCentavos: 0,
    paidOutAmountInCentavos: 0,
    status: "ready",
    activePayoutAttemptId: null,
    lastPayoutAttemptId: null,
    reconciliationRequired: false,
    reconciliationReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    paidOutAt: null,
    ...overrides,
  };
}

test("mock withdrawal ids are deterministic per provider request", () => {
  const a = mockWithdrawalIdForRequest(
    "provider_11111111",
    "client-request-01",
  );
  const b = mockWithdrawalIdForRequest(
    "provider_11111111",
    "client-request-01",
  );

  assert.equal(a, b);
  assert.match(a, /^mock_wd_[a-f0-9]{32}$/u);
});

test("parses gcash and bank destination payloads", () => {
  const gcash = parseMockWithdrawalRequest({
    clientRequestId: "client-request-01",
    amountInCentavos: 25000,
    destinationType: "gcash",
    accountName: "Ana Reyes",
    mobileNumber: "09171234567",
  });

  assert.equal(gcash.destination.type, "gcash");
  assert.equal(gcash.destination.mobileNumber, "09171234567");

  const bank = parseMockWithdrawalRequest({
    clientRequestId: "client-request-02",
    amountInCentavos: 25000,
    destinationType: "bank",
    accountName: "Ana Reyes",
    bankName: "BDO",
    accountNumber: "1234567890",
  });

  assert.equal(bank.destination.type, "bank");
  assert.equal(bank.destination.accountNumber, "1234567890");
});

test("rejects browser authority fields and over-available amounts", () => {
  assert.throws(
    () => parseMockWithdrawalRequest({
      clientRequestId: "client-request-01",
      amountInCentavos: 100,
      destinationType: "gcash",
      accountName: "Ana Reyes",
      mobileNumber: "09171234567",
      payoutReady: true,
    }),
    /authority cannot be supplied/u,
  );

  assert.throws(
    () => planMockWithdrawal({
      providerId: "provider_11111111",
      withdrawalId: "mock_wd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      amountInCentavos: 150000,
      sources: [{settlement: settlement(), earning: earning()}],
      destination: {
        type: "gcash",
        accountName: "Ana Reyes",
        mobileNumber: "09171234567",
      },
    }),
    /exceeds available earnings/u,
  );
});

test("plans full and custom partial withdrawals then applies ledger updates", () => {
  const full = planMockWithdrawal({
    providerId: "provider_11111111",
    withdrawalId: "mock_wd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    amountInCentavos: 100000,
    sources: [{settlement: settlement(), earning: earning()}],
    destination: {
      type: "bank",
      accountName: "Ana Reyes",
      bankName: "BPI",
      accountNumber: "9876543210",
    },
  });

  assert.equal(full.amountInCentavos, 100000);
  assert.equal(full.allocations.length, 1);
  assert.equal(full.destination.accountNumberMasked.endsWith("3210"), true);

  const partial = planMockWithdrawal({
    providerId: "provider_11111111",
    withdrawalId: "mock_wd_cccccccccccccccccccccccccccccccc",
    amountInCentavos: 40000,
    sources: [{settlement: settlement(), earning: earning()}],
    destination: {
      type: "gcash",
      accountName: "Ana Reyes",
      mobileNumber: "09171234567",
    },
  });

  assert.equal(partial.allocations[0].amountInCentavos, 40000);

  const applied = applyMockWithdrawalAllocation({
    settlement: settlement(),
    earning: earning(),
    allocation: partial.allocations[0],
    withdrawalId: partial.withdrawalId,
    destination: partial.destination,
    timestamp: "now",
  });

  assert.equal(applied.earningUpdate.availableAmountInCentavos, 60000);
  assert.equal(applied.earningUpdate.paidAmountInCentavos, 40000);
  assert.equal(applied.settlementUpdate.paidOutAmountInCentavos, 40000);
  assert.equal(applied.settlementUpdate.status, "ready");
  assert.equal(applied.payoutAttemptRecord.gateway, "mock");
  assert.equal(applied.payoutAttemptRecord.status, "succeeded");

  const record = buildMockWithdrawalRecord({
    plan: partial,
    providerId: "provider_11111111",
    clientRequestId: "client-request-03",
    timestamp: "now",
  });

  assert.equal(record.status, "succeeded");
  assert.equal(record.mode, "mock");
  assert.equal(record.amountInCentavos, 40000);
});

test("fully paid custom amount marks settlement paid", () => {
  const plan = planMockWithdrawal({
    providerId: "provider_11111111",
    withdrawalId: "mock_wd_dddddddddddddddddddddddddddddddd",
    amountInCentavos: 100000,
    sources: [{settlement: settlement(), earning: earning()}],
    destination: {
      type: "gcash",
      accountName: "Ana Reyes",
      mobileNumber: "09171234567",
    },
  });

  const applied = applyMockWithdrawalAllocation({
    settlement: settlement(),
    earning: earning(),
    allocation: plan.allocations[0],
    withdrawalId: plan.withdrawalId,
    destination: plan.destination,
    timestamp: "now",
  });

  assert.equal(applied.settlementUpdate.status, "paid");
  assert.equal(applied.earningUpdate.status, "paid");
  assert.equal(applied.earningUpdate.availableAmountInCentavos, 0);
});
