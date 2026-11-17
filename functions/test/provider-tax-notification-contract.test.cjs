const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const source = fs.readFileSync(path.resolve(__dirname, "../src/providers/provider-tax-profile.ts"), "utf8");
test("tax notifications are transactionally written with stable IDs", () => {
  assert.match(source, /createNotificationWithIdInTransaction\(/);
  assert.match(source, /taxNotificationId\("submit"/);
  assert.match(source, /taxNotificationId\("review"/);
  assert.match(source, /changed: false/);
  assert.match(source, /where\("role", "==", USER_ROLES\.admin\)/);
  assert.match(source, /data\.accountStatus === "active"/);
  assert.doesNotMatch(source, /(?:title|message):[^\r\n]*\bTIN\b/i);
});