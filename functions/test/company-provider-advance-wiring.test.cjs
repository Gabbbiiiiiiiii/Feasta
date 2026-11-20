const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "index.ts"),
  "utf8",
);
const advanceSource = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "src",
    "provider-finance",
    "company-provider-advance.ts",
  ),
  "utf8",
);
const webhookSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "payments", "process-webhook.ts"),
  "utf8",
);

test("company float and advance request callables are exported", () => {
  assert.match(indexSource, /fundCompanyFloat/);
  assert.match(indexSource, /requestCompanyAdvance/);
  assert.match(indexSource, /approveCompanyAdvanceRequest/);
  assert.match(indexSource, /rejectCompanyAdvanceRequest/);
  assert.doesNotMatch(indexSource, /issueCompanyProviderAdvance/);
});

test("advance approval and requests are role gated", () => {
  assert.match(advanceSource, /USER_ROLES\.admin/);
  assert.match(advanceSource, /USER_ROLES\.provider/);
  assert.match(advanceSource, /ADVANCE_CONFIRMATION_PHRASE/);
});

test("advance rejection notifies the provider owner", () => {
  assert.match(advanceSource, /provider_immediate_fund_rejected/);
  assert.match(advanceSource, /Immediate funding rejected/);
  assert.match(advanceSource, /companyAdvanceProviderRejectionNotificationId/);
});

test("immediate fund requests enforce a three-attempt limit", () => {
  assert.match(advanceSource, /COMPANY_ADVANCE_MAX_ATTEMPTS/);
  assert.match(advanceSource, /companyAdvanceRequestAttemptCount/);
  assert.match(advanceSource, /remainingAttempts/);
  assert.match(advanceSource, /attemptCount: planned\.attemptCount/);
});

test("advance approval releases pending earnings into available", () => {
  assert.match(advanceSource, /loadCompanyAdvanceEarningReleasePlans/);
  assert.match(advanceSource, /planProviderEarningAdvanceAvailability/);
  assert.match(advanceSource, /companyAdvanceAvailabilityReleasedAt/);
});

test("advance approval persists settlement-based advance status", () => {
  assert.match(advanceSource, /settlementStatus: booking\.settlementStatus/);
  assert.match(advanceSource, /companyAdvanceStatus: planned\.advance\.status/);
  assert.match(
    advanceSource,
    /companyAdvanceOutstandingInCentavos:\s*\n\s*planned\.advance\.outstandingAmountInCentavos/,
  );
});

test("payment success credits commission into company commission wallet", () => {
  assert.match(
    webhookSource,
    /applyCompanyFloatPaymentSideEffectsInTransaction/,
  );
  assert.match(webhookSource, /COMPANY_COMMISSION_DOC_PATH/);
  assert.match(webhookSource, /commissionSnap: companyCommissionSnapshot/);
  assert.match(webhookSource, /commissionAccruedInCentavos/);
  assert.match(indexSource, /transferCompanyCommissionToFloat/);
  assert.match(indexSource, /requestMockCompanyCommissionWithdrawal/);
});
