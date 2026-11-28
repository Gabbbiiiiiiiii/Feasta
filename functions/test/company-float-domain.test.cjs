const test = require("node:test");
const assert = require("node:assert/strict");

const domain = require("../lib/provider-finance/company-float-domain.js");

test("funding increases available company float balance", () => {
  const next = domain.planCompanyFloatFunding({
    float: domain.emptyCompanyFloat(),
    amountInCentavos: 250_000,
  });
  assert.equal(next.availableBalanceInCentavos, 250_000);
});

test("commission credit accrues to commission wallet, not float", () => {
  const first = domain.planCompanyCommissionCredit({
    commission: domain.emptyCompanyCommission(),
    commissionInCentavos: 5_000,
    alreadyCredited: false,
  });
  assert.equal(first.credited, true);
  assert.equal(first.commission.availableBalanceInCentavos, 5_000);
  assert.equal(first.commission.transferredToFloatInCentavos, 0);
  assert.equal(first.commission.withdrawnInCentavos, 0);

  const second = domain.planCompanyCommissionCredit({
    commission: first.commission,
    commissionInCentavos: 5_000,
    alreadyCredited: true,
  });
  assert.equal(second.credited, false);
  assert.equal(second.commission.availableBalanceInCentavos, 5_000);
});

test("admin can transfer available commission into company float", () => {
  const credited = domain.planCompanyCommissionCredit({
    commission: domain.emptyCompanyCommission(),
    commissionInCentavos: 8_000,
    alreadyCredited: false,
  });
  const transferred = domain.planCompanyCommissionTransferToFloat({
    commission: credited.commission,
    float: domain.emptyCompanyFloat(),
    amountInCentavos: 5_000,
  });
  assert.equal(transferred.commission.availableBalanceInCentavos, 3_000);
  assert.equal(transferred.commission.transferredToFloatInCentavos, 5_000);
  assert.equal(transferred.float.availableBalanceInCentavos, 5_000);
});

test("admin can withdraw available commission", () => {
  const credited = domain.planCompanyCommissionCredit({
    commission: domain.emptyCompanyCommission(),
    commissionInCentavos: 8_000,
    alreadyCredited: false,
  });
  const withdrawn = domain.planCompanyCommissionWithdrawal({
    commission: credited.commission,
    amountInCentavos: 3_000,
  });
  assert.equal(withdrawn.commission.availableBalanceInCentavos, 5_000);
  assert.equal(withdrawn.commission.withdrawnInCentavos, 3_000);
});

test("provider can request advance after customer payment", () => {
  const request = domain.planCompanyAdvanceRequest({
    providerRequestId: "request_1",
    providerId: "provider_1",
    mainEventId: "event_1",
    customerId: "customer_1",
    requestedByUid: "owner_1",
    providerNote: null,
    settlementStatus: "deposit_settled",
    existingRequestStatus: null,
    existingAdvanceStatus: null,
  });
  assert.equal(request.status, "pending");
  assert.equal(request.attemptCount, 1);
  assert.equal(request.remainingAfterRequest, 2);
});

test("immediate fund requests allow up to three attempts after rejection", () => {
  const second = domain.planCompanyAdvanceAttemptCount({
    existingAttemptCount: 1,
    existingRequestStatus: "rejected",
    requestExists: true,
  });
  assert.equal(second.attemptCount, 2);
  assert.equal(second.remainingAfterRequest, 1);

  const third = domain.planCompanyAdvanceAttemptCount({
    existingAttemptCount: 2,
    existingRequestStatus: "rejected",
    requestExists: true,
  });
  assert.equal(third.attemptCount, 3);
  assert.equal(third.remainingAfterRequest, 0);

  assert.throws(
    () =>
      domain.planCompanyAdvanceAttemptCount({
        existingAttemptCount: 3,
        existingRequestStatus: "rejected",
        requestExists: true,
      }),
    /all 3 immediate funding requests/u,
  );
});

test("deposit advance approval stays outstanding and tracks float debt", () => {
  const funded = domain.planCompanyFloatFunding({
    float: domain.emptyCompanyFloat(),
    amountInCentavos: 250_000,
  });
  const amounts = domain.computeProviderAdvanceAmounts({
    grossSettledAmountInCentavos: 100_000,
    commissionAccruedInCentavos: 10_000,
  });
  assert.equal(amounts.providerNetAmountInCentavos, 90_000);
  const planned = domain.planCompanyAdvanceApproval({
    float: funded,
    amountInCentavos: amounts.providerNetAmountInCentavos,
    maxAmountInCentavos: amounts.providerNetAmountInCentavos,
    advanceRequestId: "company_adv_req_1",
    providerRequestId: "request_1",
    providerId: "provider_1",
    mainEventId: "event_1",
    issuedByAdminUid: "admin_1",
    requestStatus: "pending",
    settlementStatus: "deposit_settled",
  });
  assert.equal(planned.float.availableBalanceInCentavos, 160_000);
  assert.equal(planned.float.outstandingAdvanceInCentavos, 90_000);
  assert.equal(planned.advance.outstandingAmountInCentavos, 90_000);
  assert.equal(planned.advance.status, "outstanding");
  assert.equal(planned.advance.repaidAmountInCentavos, 0);
});

test("full-payment advance approval is repaid with no float debt", () => {
  const funded = domain.planCompanyFloatFunding({
    float: domain.emptyCompanyFloat(),
    amountInCentavos: 250_000,
  });
  const planned = domain.planCompanyAdvanceApproval({
    float: funded,
    amountInCentavos: 90_000,
    maxAmountInCentavos: 90_000,
    advanceRequestId: "company_adv_req_full_1",
    providerRequestId: "request_full_1",
    providerId: "provider_1",
    mainEventId: "event_1",
    issuedByAdminUid: "admin_1",
    requestStatus: "pending",
    settlementStatus: "fully_settled",
  });
  assert.equal(planned.float.availableBalanceInCentavos, 160_000);
  assert.equal(planned.float.outstandingAdvanceInCentavos, 0);
  assert.equal(planned.advance.status, "repaid");
  assert.equal(planned.advance.outstandingAmountInCentavos, 0);
  assert.equal(planned.advance.repaidAmountInCentavos, 90_000);
});

test("advance approval plans pending earnings into available", () => {
  const planned = domain.planProviderEarningAdvanceAvailability({
    pendingAmountInCentavos: 90_000,
    availableAmountInCentavos: 0,
    paidAmountInCentavos: 0,
    earningAmountInCentavos: 90_000,
  });
  assert.equal(planned.pendingAmountInCentavos, 0);
  assert.equal(planned.availableAmountInCentavos, 90_000);
  assert.equal(planned.status, "available");
  assert.equal(planned.releasedAmountInCentavos, 90_000);
});

test("advance availability plan is a no-op when nothing is pending", () => {
  assert.equal(
    domain.planProviderEarningAdvanceAvailability({
      pendingAmountInCentavos: 0,
      availableAmountInCentavos: 50_000,
      paidAmountInCentavos: 0,
      earningAmountInCentavos: 50_000,
    }),
    null,
  );
});

test("partial repayment reduces outstanding advance", () => {
  const funded = domain.planCompanyFloatFunding({
    float: domain.emptyCompanyFloat(),
    amountInCentavos: 250_000,
  });
  const issued = domain.planCompanyAdvanceApproval({
    float: funded,
    amountInCentavos: 90_000,
    maxAmountInCentavos: 90_000,
    advanceRequestId: "company_adv_req_1",
    providerRequestId: "request_1",
    providerId: "provider_1",
    mainEventId: "event_1",
    issuedByAdminUid: "admin_1",
    requestStatus: "pending",
    settlementStatus: "deposit_settled",
  });
  const repaid = domain.planCompanyAdvanceRepayment({
    float: issued.float,
    advance: issued.advance,
    repayAmountInCentavos: 40_000,
  });
  assert.equal(repaid.advanceUpdate.status, "outstanding");
  assert.equal(repaid.advanceUpdate.outstandingAmountInCentavos, 50_000);
  assert.equal(repaid.float.availableBalanceInCentavos, 200_000);
});

test("commission refund adjustment deducts reversed fees idempotently and clamps at zero", () => {
  const credited = domain.planCompanyCommissionCredit({
    commission: domain.emptyCompanyCommission(),
    commissionInCentavos: 25_000,
    alreadyCredited: false,
  });

  const reversed = domain.planCompanyCommissionRefundAdjustment({
    commission: credited.commission,
    commissionReversedInCentavos: 10_000,
    alreadyRecorded: false,
  });
  assert.equal(reversed.applied, true);
  assert.equal(reversed.netDeltaInCentavos, -10_000);
  assert.equal(reversed.commission.availableBalanceInCentavos, 15_000);

  const replayed = domain.planCompanyCommissionRefundAdjustment({
    commission: reversed.commission,
    commissionReversedInCentavos: 10_000,
    alreadyRecorded: true,
  });
  assert.equal(replayed.applied, false);
  assert.equal(replayed.commission.availableBalanceInCentavos, 15_000);

  const clamped = domain.planCompanyCommissionRefundAdjustment({
    commission: reversed.commission,
    commissionReversedInCentavos: 50_000,
    alreadyRecorded: false,
  });
  assert.equal(clamped.applied, true);
  assert.equal(clamped.commission.availableBalanceInCentavos, 0);

  const defaultFee = domain.planCompanyCommissionRefundAdjustment({
    commission: reversed.commission,
    commissionReversedInCentavos: 5_000,
    cancellationFeeEarnedInCentavos: 5_000,
    alreadyRecorded: false,
  });
  assert.equal(defaultFee.applied, false);
  assert.equal(defaultFee.commission.availableBalanceInCentavos, 15_000);

  assert.match(
    domain.companyCommissionRefundLedgerId("refund_op_1"),
    /^company_commission_refund_[a-f0-9]{32}$/u,
  );
});
