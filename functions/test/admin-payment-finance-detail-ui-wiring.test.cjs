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

const drawer = read(
  "apps/web/src/components/admin/payments/payment-details-drawer.tsx",
);

test("P11 Admin drawer renders Customer booking financial truth", () => {
  for (const text of [
    "Booking financial summary",
    "Booking value",
    "Customer collected",
    "Remaining customer balance",
    "Remaining balance status",
    "Customer fully settled",
    "Financial policy version",
  ]) {
    assert.match(drawer, new RegExp(text, "u"));
  }
});

test("P11 Admin drawer renders Provider tax and VAT truth", () => {
  for (const text of [
    "Provider tax and VAT",
    "Provider tax classification",
    "Tax verification",
    "Provider VAT accrued",
    "Provider VAT reversed",
    "Provider VAT net",
  ]) {
    assert.match(drawer, new RegExp(text, "u"));
  }
});

test("P11 Admin drawer renders canonical FEASTA commission and tax values", () => {
  for (const text of [
    "FEASTA commission and tax",
    "Commission rate",
    "Commission accrued",
    "Commission reversed",
    "Commission earned",
    "FEASTA VAT accrued",
    "FEASTA VAT reversed",
    "FEASTA VAT net",
  ]) {
    assert.match(drawer, new RegExp(text, "u"));
  }

  assert.doesNotMatch(
    drawer,
    /commissionPendingInCentavos/u,
  );
});

test("P11 Admin drawer separates payout-account readiness from settlement transport", () => {
  assert.match(drawer, /Provider payout account/u);
  assert.match(drawer, /Account onboarding ready/u);
  assert.match(drawer, /Settlement transport mode/u);
  assert.match(drawer, /Settlement transport ready/u);
  assert.match(
    drawer,
    /onboarding\s+readiness\s+does\s+not\s+mean\s+FEASTA/u,
  );
});

test("P11 finance detail UI remains read-only for Provider settlement", () => {
  for (const forbidden of [
    "Retry payout",
    "Force reconcile",
    "Mark paid",
    "Release settlement",
    "Send payout",
    "Withdraw payout",
  ]) {
    assert.doesNotMatch(
      drawer,
      new RegExp(forbidden, "iu"),
    );
  }

  assert.match(
    drawer,
    /Admin monitoring[\s\S]*does not authorize payout[\s\S]*dispatch/u,
  );
});

test("P11 finance UI consumes server DTOs instead of reading finance collections directly", () => {
  assert.doesNotMatch(drawer, /providerPaymentAccounts/u);
  assert.doesNotMatch(drawer, /providerEarnings/u);
  assert.doesNotMatch(drawer, /providerSettlements/u);
  assert.doesNotMatch(drawer, /providerPayoutAttempts/u);
});
