const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, ...relativePath.split("/")),
    "utf8",
  );
}

test("P11 Admin details expose canonical booking financial truth", () => {
  const types = read("apps/web/src/lib/admin/payments/admin-payment-types.ts");

  for (const field of [
    "bookingValueInCentavos",
    "collectedAmountInCentavos",
    "remainingCustomerBalanceInCentavos",
    "remainingBalanceStatus",
    "providerTaxType",
    "providerVatNetInCentavos",
    "commissionAccruedInCentavos",
    "commissionReversedInCentavos",
    "commissionEarnedInCentavos",
    "platformVatNetInCentavos",
    "financialPolicyVersion",
  ]) {
    assert.match(types, new RegExp(field, "u"));
  }
});

test("P11 finance summary reads the frozen booking snapshot and cumulative accounting", () => {
  const service = read("apps/web/src/lib/admin/payments/admin-payment-service.ts");

  assert.match(service, /data\.financialSnapshot/u);
  assert.match(service, /grossAmountInCentavos/u);
  assert.match(service, /grossSettledAmountInCentavos/u);
  assert.match(service, /outstandingAmountInCentavos/u);
  assert.match(service, /providerVatNetInCentavos/u);
  assert.match(service, /commissionEarnedInCentavos/u);
  assert.match(service, /platformVatNetInCentavos/u);
});

test("P11 Admin payout-account status is loaded server-side by Provider ID", () => {
  const service = read("apps/web/src/lib/admin/payments/admin-payment-service.ts");

  assert.match(service, /providerPaymentAccounts/u);
  assert.match(service, /\.doc\(payment\.providerId\)/u);
  assert.match(service, /settlementTransportReady/u);
  assert.match(service, /payoutReady/u);
});

test("P11 does not invent a canonical pending commission bucket", () => {
  const types = read("apps/web/src/lib/admin/payments/admin-payment-types.ts");
  const service = read("apps/web/src/lib/admin/payments/admin-payment-service.ts");

  assert.doesNotMatch(types, /commissionPendingInCentavos/u);
  assert.doesNotMatch(service, /commissionPendingInCentavos/u);
});

test("P11-A1 projection does not add Admin finance mutation controls", () => {
  const service = read("apps/web/src/lib/admin/payments/admin-payment-service.ts");

  const start = service.indexOf("function mapAdminPaymentFinancialSummary");
  const end = service.indexOf("const ADMIN_PROVIDER_EARNING_STATUSES", start);

  assert.ok(start >= 0 && end > start);

  const projection = service.slice(start, end);

  assert.doesNotMatch(projection, /transaction\.(?:create|set|update|delete)/u);
  assert.doesNotMatch(projection, /\.set\(/u);
  assert.doesNotMatch(projection, /\.update\(/u);
  assert.doesNotMatch(projection, /\.delete\(/u);
});
