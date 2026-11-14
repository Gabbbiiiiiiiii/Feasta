const assert = require("node:assert/strict");
const test = require("node:test");

const {
  accountSecurityAction,
  correlationIdFromHeaders,
  maskEmail,
  maskPhone,
} = require("../lib/shared/security-events.js");

test("security correlation IDs accept safe request IDs and reject injection", () => {
  assert.equal(
    correlationIdFromHeaders({"x-request-id": "request-12345678"}),
    "request-12345678",
  );
  const generated = correlationIdFromHeaders({
    "x-request-id": "bad request\nforged-header",
  });
  assert.match(generated, /^[0-9a-f-]{36}$/u);
});

test("security-event PII helpers mask email and phone values", () => {
  assert.equal(maskEmail("person@example.test"), "p***@example.test");
  assert.equal(maskPhone("+63 917 123 4567"), "***4567");
});

test("account security audit classifies block and unblock changes", () => {
  assert.equal(accountSecurityAction(false, true), "account_blocked");
  assert.equal(accountSecurityAction(true, false), "account_unblocked");
  assert.equal(accountSecurityAction(false, false), "account_status_changed");
});
