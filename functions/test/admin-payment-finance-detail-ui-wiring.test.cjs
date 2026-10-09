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
    "Total customer payments",
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
    "Tax details",
    "Provider tax classification",
    "Tax verification",
    "Provider VAT accrued",
    "Provider VAT reversed",
    "Provider VAT net",
  ]) {
    assert.match(drawer, new RegExp(text, "u"));
  }
});

test("P11 Admin drawer renders canonical FEASTA fee and tax values", () => {
  for (const text of [
    "FEASTA fees and tax",
    "FEASTA fee rate",
    "FEASTA fees before refunds",
    "Refunded FEASTA fees",
    "Recorded FEASTA fees",
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
    /Completing account setup does not mean a provider payout can be sent yet\./u,
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
    /This payout account information is read-only\./u,
  );
});

test("P11 finance UI consumes server DTOs instead of reading finance collections directly", () => {
  assert.doesNotMatch(drawer, /providerPaymentAccounts/u);
  assert.doesNotMatch(drawer, /providerEarnings/u);
  assert.doesNotMatch(drawer, /providerSettlements/u);
  assert.doesNotMatch(drawer, /providerPayoutAttempts/u);
});
