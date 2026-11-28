const test = require("node:test");
const assert = require("node:assert/strict");
const {getApps, initializeApp} = require("firebase-admin/app");
const {Timestamp} = require("firebase-admin/firestore");
if (!getApps().length) initializeApp({projectId: "demo-arranged-payment-offline"});

const {
  makeArrangedPaymentOffer,
  parseArrangedPaymentOffer,
  requireArrangedPaymentEligibility,
} = require("../lib/provider-requests/arranged-payment-offer.js");
const {
  bookingPolicyTimingV3,
  bookingPolicyV3Evidence,
  frozenBookingPolicyTimingV3,
} = require("../lib/bookings/booking-policy-v3.js");
const {
  buildBookingPaymentPolicySnapshot,
} = require("../lib/bookings/booking-payment-eligibility-policy.js");
const {
  evaluateSubmissionPaymentEligibility,
  enforceInitialPaymentEligibility,
} = require("../lib/payments/initial-payment-eligibility.js");
const {
  originalInitialPaymentDeadline,
  INITIAL_PAYMENT_DEADLINE_POLICY_VERSION,
} = require("../lib/payments/initial-payment-deadline.js");
const {
  existingAcceptancePlan,
} = require("../lib/provider-requests/existing-acceptance-plan.js");
const {
  initialExpirationDecision,
} = require("../lib/payments/initial-payment-expiration.js");
const {
  settledDepositRefundEvidence,
} = require("../lib/refunds/system-balance-deadline-refund.js");
const {
  paymentIdForProviderRequestChoice,
} = require("../lib/payments/payment-obligation.js");
const {
  buildProviderRequestFinancialSnapshot,
} = require("../lib/provider-requests/provider-request-financial-snapshot.js");
const {
  buildSuccessfulPaymentFinancialAllocation,
} = require("../lib/payments/financial-ledger-domain.js");

const EVENT_START = new Date("2026-10-20T18:00:00+08:00");
const EVENT_DATE = new Date("2026-10-20T00:00:00+08:00");
const SUBMITTED_AT = new Date("2026-10-10T10:00:00+08:00");
const OFFERED_AT = new Date("2026-10-10T12:00:00+08:00");
const ACCEPTED_AT = new Date("2026-10-10T15:00:00+08:00");
const STANDARD_TIMING = bookingPolicyTimingV3(EVENT_START);
const POLICY_ALLOWED = buildBookingPaymentPolicySnapshot({
  platformSettings: null,
  serviceCategoryCode: "catering_service",
  serviceCategory: {},
  packageId: "pkg_catering_1",
  packageData: {},
});

function packageTerms(paymentPolicy = "deposit_then_balance") {
  return {
    schemaVersion: 2,
    source: "canonical_package",
    paymentPolicy,
    depositRateBps: paymentPolicy === "full_payment" ? 10000 : 5000,
    balanceDueDaysBeforeEvent: null,
    balanceDueHoursBeforeEvent: paymentPolicy === "full_payment" ? null : 24,
    usesLegacyPaymentTerms: false,
  };
}

function buildPendingCateringRequest({paymentPolicy = "deposit_then_balance", submittedAt = SUBMITTED_AT} = {}) {
  const terms = packageTerms(paymentPolicy);
  const evaluated = evaluateSubmissionPaymentEligibility({
    eventDate: EVENT_DATE,
    eventTime: "18:00",
    submissionTime: submittedAt,
    packagePaymentTerms: terms,
    bookingPaymentPolicySnapshot: POLICY_ALLOWED,
  });
  return {
    type: "catering",
    packageId: "pkg_catering_1",
    providerOwnerId: "owner_gabriel",
    amount: 30000,
    downPaymentAmount: paymentPolicy === "full_payment" ? 30000 : 15000,
    remainingBalance: paymentPolicy === "full_payment" ? 0 : 15000,
    status: "pending",
    paymentStatus: "unpaid",
    createdAt: Timestamp.fromDate(submittedAt),
    eventDate: Timestamp.fromDate(EVENT_DATE),
    eventTime: "18:00",
    eventEndTime: "22:00",
    packagePaymentTerms: terms,
    bookingPaymentPolicySnapshot: POLICY_ALLOWED,
    initialPaymentEligibilitySchemaVersion: 2,
    initialPaymentEligibility: {
      ...evaluated,
      evaluatedAt: Timestamp.fromDate(submittedAt),
      submittedAt: Timestamp.fromDate(submittedAt),
      eventStartAt: Timestamp.fromDate(EVENT_START),
    },
    ...bookingPolicyV3Evidence(EVENT_START, Timestamp.fromDate),
    initialPaymentWriteProtocolVersion: 1,
  };
}

function buildAcceptedArrangedRequest({paymentPolicy = "deposit_then_balance", balanceDue = "2026-10-17T18:00"} = {}) {
  const base = buildPendingCateringRequest({paymentPolicy});
  const offer = makeArrangedPaymentOffer({
    grossInCentavos: 3_000_000,
    upfrontInCentavos: 500_000,
    initialDueAt: "2026-10-12T17:00",
    balanceDueAt: balanceDue,
    providerOwnerId: "owner_gabriel",
    now: OFFERED_AT,
    standardBalanceDueAt: STANDARD_TIMING.remainingBalanceDueAt,
  });
  const acceptedOffer = {
    ...offer,
    status: "accepted",
    respondedAt: Timestamp.fromDate(ACCEPTED_AT),
  };
  const financialSnapshot = buildProviderRequestFinancialSnapshot({
    providerId: "prov_gabriel",
    providerOwnerId: "owner_gabriel",
    providerRequest: {
      ...base,
      downPaymentAmount: 5000,
      remainingBalance: 25000,
    },
    platformSettings: null,
    providerTaxProfile: null,
  });
  const arrangedDue = acceptedOffer.balanceDueAt.toDate();
  const arrangedHard = new Date(arrangedDue.getTime() + 24 * 3_600_000);
  return {
    ...base,
    status: "waiting_for_down_payment",
    acceptedAt: Timestamp.fromDate(ACCEPTED_AT),
    financialSnapshotCapturedAt: Timestamp.fromDate(ACCEPTED_AT),
    initialPaymentDeadlinePolicyVersion: INITIAL_PAYMENT_DEADLINE_POLICY_VERSION,
    initialPaymentDeadlineAt: acceptedOffer.initialDueAt,
    expiresAt: acceptedOffer.initialDueAt,
    financialSnapshot,
    arrangedPaymentOffer: acceptedOffer,
    remainingBalanceDueAt: acceptedOffer.balanceDueAt,
    hardPaymentDeadlineAt: Timestamp.fromDate(arrangedHard),
    remainingBalanceGraceEndsAt: Timestamp.fromDate(arrangedHard),
    remainingBalanceNextCheckAt: acceptedOffer.balanceDueAt,
  };
}

test("makeArrangedPaymentOffer validates amounts, Manila deadlines, and 48h cutoff", () => {
  const offer = makeArrangedPaymentOffer({
    grossInCentavos: 3_000_000,
    upfrontInCentavos: 500_000,
    initialDueAt: "2026-10-12T17:00",
    balanceDueAt: "2026-10-18T18:00",
    providerOwnerId: "owner_gabriel",
    now: OFFERED_AT,
    standardBalanceDueAt: STANDARD_TIMING.remainingBalanceDueAt,
  });
  assert.equal(offer.status, "offered");
  assert.equal(offer.upfrontInCentavos, 500_000);
  assert.equal(offer.grossInCentavos, 3_000_000);
  assert.equal(parseArrangedPaymentOffer(offer)?.id, offer.id);

  // Under ₱1 upfront or remaining balance rejected
  assert.throws(() => makeArrangedPaymentOffer({
    grossInCentavos: 3_000_000, upfrontInCentavos: 99,
    initialDueAt: "2026-10-12T17:00", balanceDueAt: "2026-10-18T18:00",
    providerOwnerId: "owner_gabriel", now: OFFERED_AT,
    standardBalanceDueAt: STANDARD_TIMING.remainingBalanceDueAt,
  }), {code: "invalid-argument"});

  assert.throws(() => makeArrangedPaymentOffer({
    grossInCentavos: 3_000_000, upfrontInCentavos: 2_999_950,
    initialDueAt: "2026-10-12T17:00", balanceDueAt: "2026-10-18T18:00",
    providerOwnerId: "owner_gabriel", now: OFFERED_AT,
    standardBalanceDueAt: STANDARD_TIMING.remainingBalanceDueAt,
  }), {code: "invalid-argument"});

  // Balance due after standard T-48h cutoff rejected
  assert.throws(() => makeArrangedPaymentOffer({
    grossInCentavos: 3_000_000, upfrontInCentavos: 500_000,
    initialDueAt: "2026-10-12T17:00", balanceDueAt: "2026-10-18T18:01",
    providerOwnerId: "owner_gabriel", now: OFFERED_AT,
    standardBalanceDueAt: STANDARD_TIMING.remainingBalanceDueAt,
  }), {code: "invalid-argument"});

  // Offering after T-48h cutoff already elapsed fails closed
  assert.throws(() => makeArrangedPaymentOffer({
    grossInCentavos: 3_000_000, upfrontInCentavos: 500_000,
    initialDueAt: "2026-10-19T10:00", balanceDueAt: "2026-10-19T12:00",
    providerOwnerId: "owner_gabriel", now: STANDARD_TIMING.remainingBalanceDueAt,
    standardBalanceDueAt: STANDARD_TIMING.remainingBalanceDueAt,
  }), {code: "failed-precondition"});

  // Withdrawn offer after initialDueAt still parses cleanly (e.g. rejected request)
  const withdrawnLate = {
    ...offer,
    status: "withdrawn",
    respondedAt: Timestamp.fromDate(new Date("2026-10-13T09:00:00+08:00")),
  };
  assert.equal(parseArrangedPaymentOffer(withdrawnLate)?.status, "withdrawn");

  // Accepted offer at/after initialDueAt still fails closed
  const acceptedLate = {
    ...offer,
    status: "accepted",
    respondedAt: offer.initialDueAt,
  };
  assert.throws(() => parseArrangedPaymentOffer(acceptedLate), {code: "failed-precondition"});
});

test("requireArrangedPaymentEligibility allows both Full Payment and Down Payment catering packages >= 72h ahead", () => {
  assert.doesNotThrow(() => requireArrangedPaymentEligibility(buildPendingCateringRequest({paymentPolicy: "deposit_then_balance"}), true));
  assert.doesNotThrow(() => requireArrangedPaymentEligibility(buildPendingCateringRequest({paymentPolicy: "full_payment"}), true));

  // Disallowed by policy or short notice (< 72h)
  assert.throws(() => requireArrangedPaymentEligibility(buildPendingCateringRequest(), false), {code: "failed-precondition"});
  const shortNotice = buildPendingCateringRequest({submittedAt: new Date(STANDARD_TIMING.depositEligibilityCutoffAt.getTime() + 1000)});
  assert.throws(() => requireArrangedPaymentEligibility(shortNotice, true), {code: "failed-precondition"});
  assert.throws(() => requireArrangedPaymentEligibility({...buildPendingCateringRequest(), type: "addon"}, true), {code: "failed-precondition"});
});

test("accepted arranged payment updates frozen v3 timing, initial deadline, and eligibility for Full Payment and Down Payment packages", () => {
  for (const paymentPolicy of ["deposit_then_balance", "full_payment"]) {
    const req = buildAcceptedArrangedRequest({paymentPolicy, balanceDue: "2026-10-17T18:00"});
    const timing = frozenBookingPolicyTimingV3(req);
    assert.equal(timing.remainingBalanceDueAt.toISOString(), new Date("2026-10-17T18:00:00+08:00").toISOString());
    assert.equal(timing.hardPaymentDeadlineAt.toISOString(), new Date("2026-10-18T18:00:00+08:00").toISOString());
    assert.equal(timing.preparationStartsAt.toISOString(), STANDARD_TIMING.preparationStartsAt.toISOString());

    assert.equal(originalInitialPaymentDeadline(req).toMillis(), req.arrangedPaymentOffer.initialDueAt.toMillis());
    assert.doesNotThrow(() => enforceInitialPaymentEligibility(req, "minimum"));
    assert.doesNotThrow(() => enforceInitialPaymentEligibility(req, "full"));
  }
});

test("unpaid expired arranged booking passes existingAcceptancePlan and is eligible for automatic expiration", () => {
  for (const paymentPolicy of ["deposit_then_balance", "full_payment"]) {
    const req = buildAcceptedArrangedRequest({paymentPolicy});
    const beforeExpiry = new Date(req.arrangedPaymentOffer.initialDueAt.toMillis() - 60_000);
    const afterExpiry = new Date(req.arrangedPaymentOffer.initialDueAt.toMillis() + 60_000);

    assert.equal(
      existingAcceptancePlan({...req, status: "accepted"}, beforeExpiry).expiresAt.toMillis(),
      req.arrangedPaymentOffer.initialDueAt.toMillis(),
    );
    assert.deepEqual(initialExpirationDecision(req, beforeExpiry), {kind: "waiting"});
    const decision = initialExpirationDecision(req, afterExpiry);
    assert.equal(decision.kind, "candidate");
    assert.equal(decision.deadline.toMillis(), req.arrangedPaymentOffer.initialDueAt.toMillis());
  }
});

test("settledDepositRefundEvidence supports accepted arranged payment on Full Payment packages while rejecting unarranged full-payment", () => {
  const providerRequestId = "req_arranged_full_1";
  const minPaymentId = paymentIdForProviderRequestChoice(providerRequestId, "minimum");
  const req = buildAcceptedArrangedRequest({paymentPolicy: "full_payment"});
  const confirmed = {
    ...req,
    status: "confirmed",
    paymentStatus: "paid",
    initialPaymentChoice: "minimum",
    initialPaymentId: minPaymentId,
    paymentId: minPaymentId,
    settlementSchemaVersion: 1,
    settlementStatus: "deposit_settled",
    grossSettledAmountInCentavos: 500_000,
    outstandingAmountInCentavos: 2_500_000,
  };
  const paymentSet = {
    mode: "p5",
    settlement: {
      grossSettledAmountInCentavos: 500_000,
      outstandingAmountInCentavos: 2_500_000,
      settledPaymentIds: [minPaymentId],
    },
    payments: [{
      id: minPaymentId,
      data: {
        status: "paid",
        amountInCentavos: 500_000,
        currency: "PHP",
        paymongoResourceId: "pay_test_arranged_1",
        reconciliationRequired: false,
        refundExecutionLock: null,
        refundAccountingSchemaVersion: 1,
        refundedAmountInCentavos: 0,
        refundReservedAmountInCentavos: 0,
      },
    }],
  };

  const evidence = settledDepositRefundEvidence({providerRequestId, providerRequest: confirmed, paymentSet});
  assert.equal(evidence.amountInCentavos, 500_000);
  assert.equal(evidence.paymentId, minPaymentId);

  // Without an accepted arrangement, full_payment package still fails closed
  assert.throws(() => settledDepositRefundEvidence({
    providerRequestId,
    providerRequest: {...confirmed, arrangedPaymentOffer: null},
    paymentSet,
  }));
});

test("FEASTA deducts commission proportionally as arranged payments settle", () => {
  const req = buildAcceptedArrangedRequest({paymentPolicy: "deposit_then_balance"});
  const firstPayment = buildSuccessfulPaymentFinancialAllocation({
    providerRequest: {...req, grossSettledAmountInCentavos: 0},
    paymentAmountInCentavos: 500_000,
  });
  const secondPayment = buildSuccessfulPaymentFinancialAllocation({
    providerRequest: {...req, grossSettledAmountInCentavos: 500_000},
    paymentAmountInCentavos: 2_500_000,
  });

  assert.ok(firstPayment.commissionAccruedForPaymentInCentavos > 0);
  assert.ok(secondPayment.commissionAccruedForPaymentInCentavos > 0);
  assert.equal(
    firstPayment.commissionAccruedForPaymentInCentavos + secondPayment.commissionAccruedForPaymentInCentavos,
    req.financialSnapshot.platformCommissionTotalInCentavos,
  );
  assert.equal(secondPayment.commissionAccruedAfterInCentavos, req.financialSnapshot.platformCommissionTotalInCentavos);
});
