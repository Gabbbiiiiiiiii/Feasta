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

test("commission credit is idempotent when already credited", () => {
  const funded = domain.planCompanyFloatFunding({
    float: domain.emptyCompanyFloat(),
    amountInCentavos: 10_000,
  });
  const first = domain.planCompanyFloatCommissionCredit({
    float: funded,
    commissionInCentavos: 5_000,
    alreadyCredited: false,
  });
  assert.equal(first.credited, true);
  assert.equal(first.float.availableBalanceInCentavos, 15_000);

  const second = domain.planCompanyFloatCommissionCredit({
    float: first.float,
    commissionInCentavos: 5_000,
    alreadyCredited: true,
  });
  assert.equal(second.credited, false);
  assert.equal(second.float.availableBalanceInCentavos, 15_000);
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
});

test("advance approval debits float by provider net amount", () => {
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
  });
  assert.equal(planned.float.availableBalanceInCentavos, 160_000);
  assert.equal(planned.advance.outstandingAmountInCentavos, 90_000);
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
