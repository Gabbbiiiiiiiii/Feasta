const assert = require("node:assert/strict");
const {pathToFileURL} = require("node:url");
const path = require("node:path");
const test = require("node:test");

const moduleUrl = pathToFileURL(
  path.resolve(__dirname, "../lib/shared/function-options.js"),
).href;

test("callable App Check policy enforces deployment and permits emulator", async () => {
  const module = await import(moduleUrl);
  assert.equal(module.shouldEnforceAppCheck({}), true);
  assert.equal(module.shouldEnforceAppCheck({FUNCTIONS_EMULATOR: "true"}), false);
  assert.equal(module.shouldEnforceAppCheck({FUNCTIONS_EMULATOR: "false"}), true);
});
