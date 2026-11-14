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

test("P11 finance attention queue has explicit failed-payout and reconciliation kinds", () => {
  assert.match(types, /AdminFinanceAttentionQueue/u);
  assert.match(types, /"failed_payout"/u);
  assert.match(types, /"reconciliation_required"/u);
  assert.match(types, /payment: AdminPayment \| null/u);
});

test("P11 attention feed uses bounded status queries", () => {
  const start = service.indexOf(
    "export async function getAdminFinanceAttentionQueue",
  );
  const end = service.indexOf(
    "export async function getAdminPaymentDetails",
    start,
  );

  assert.ok(start >= 0 && end > start);

  const block = service.slice(start, end);

  assert.match(block, /providerPayoutAttempts/u);
  assert.match(block, /providerSettlements/u);
  assert.match(block, /"failed"/u);
  assert.match(block, /"reconciliation_required"/u);
  assert.match(block, /FINANCE_ATTENTION_PER_KIND_LIMIT/u);
  assert.doesNotMatch(block, /\.orderBy\(/u);
});

test("P11 failed-payout attention resolves settlement and payment through direct document reads", () => {
  assert.match(
    service,
    /\.collection\([\s\S]*providerSettlements[\s\S]*\.doc\(settlementId\)[\s\S]*\.get\(\)/u,
  );

  assert.match(
    service,
    /\.collection\([\s\S]*COLLECTIONS\.payments[\s\S]*\.doc\(paymentId\)[\s\S]*\.get\(\)/u,
  );
});

test("P11 attention feed fails closed when canonical linkage is invalid", () => {
  assert.match(service, /recordState:[\s\S]*"invalid"/u);
  assert.match(service, /schemaVersion !== 1/u);
  assert.match(service, /currency !== "PHP"/u);
  assert.match(service, /gateway !== "paymongo"/u);
  assert.match(service, /reconciliationRequired ===[\s\S]*true/u);
});

test("P11 attention backend is read-only", () => {
  const start = service.indexOf(
    "export async function getAdminFinanceAttentionQueue",
  );
  const end = service.indexOf(
    "export async function getAdminPaymentDetails",
    start,
  );

  const block = service.slice(start, end);

  assert.doesNotMatch(block, /\.set\(/u);
  assert.doesNotMatch(block, /\.update\(/u);
  assert.doesNotMatch(block, /\.delete\(/u);
  assert.doesNotMatch(block, /transaction\.(?:create|set|update|delete)/u);
});
