const assert = require("node:assert/strict");
const test = require("node:test");

const {sanitizeForLog} = require("../lib/shared/logger.js");

test("structured logging redacts sensitive keys and credential-shaped values", () => {
  const gatewayCredential = ["sk", "test", "runtimecredential123"].join("_");
  const output = sanitizeForLog({
    authorization: `Bearer ${"x".repeat(30)}`,
    nested: {apiKey: "runtime-key", message: `failure ${gatewayCredential}`},
  });
  const serialized = JSON.stringify(output);
  assert.equal(serialized.includes("runtime-key"), false);
  assert.equal(serialized.includes(gatewayCredential), false);
  assert.equal(serialized.includes("x".repeat(30)), false);
  assert.ok(serialized.includes("[REDACTED]"));
});
