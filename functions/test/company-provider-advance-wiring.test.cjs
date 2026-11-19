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

test("payment success credits commission into company float", () => {
  assert.match(
    webhookSource,
    /applyCompanyFloatPaymentSideEffectsInTransaction/,
  );
  assert.match(webhookSource, /commissionAccruedInCentavos/);
});
