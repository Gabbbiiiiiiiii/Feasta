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

const types = read(
  "apps/web/src/lib/admin/payments/admin-payment-types.ts",
);

const service = read(
  "apps/web/src/lib/admin/payments/admin-payment-service.ts",
);

const client = read(
  "apps/web/src/components/admin/payments/payment-monitoring-client.tsx",
);

test("P11 Payment Monitoring exposes finance-health statistics", () => {
  for (const field of [
    "failedPaymentCount",
    "failedPayoutCount",
    "reconciliationRequiredCount",
  ]) {
    assert.match(types, new RegExp(field, "u"));
    assert.match(service, new RegExp(field, "u"));
  }
});

test("P11 finance-health counts use bounded Firestore aggregate queries", () => {
  assert.match(service, /providerPayoutAttempts/u);
  assert.match(service, /providerSettlements/u);
  assert.match(service, /"status",[\s\S]*"failed"[\s\S]*\.count\(\)/u);
  assert.match(service, /"reconciliation_required"[\s\S]*\.count\(\)/u);
});

test("P11 Payment Monitoring clearly separates failed Customer payments and Provider payouts", () => {
  for (const label of [
    "Currently paid amount",
    "Failed payments",
    "Failed provider payouts",
    "Payments to review",
    "Refunded amount",
  ]) {
    assert.match(client, new RegExp(label, "u"));
  }
});

test("P11 Payment Monitoring exposes the existing issue filter", () => {
  assert.match(client, /label="Record review"/u);
  assert.match(client, /value="with_issues"/u);
  assert.match(client, /value="without_issues"/u);
  assert.match(client, /filters\.issue/u);
});

test("P11 page-level monitoring does not perform payout mutations", () => {
  for (const forbidden of [
    "retry payout",
    "force reconcile",
    "mark paid",
    "release settlement",
    "send payout",
    "withdraw payout",
  ]) {
    assert.doesNotMatch(
      client,
      new RegExp(forbidden, "iu"),
    );
  }
});
