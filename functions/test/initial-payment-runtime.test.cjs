const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {initializeApp} = require("firebase-admin/app");
initializeApp({projectId: "demo-phase-a-runtime-offline"});
const functions = [
  ["payments/create-payment-session", "createPaymentSession", 30, ["PAYMONGO_SECRET_KEY"]],
  ["provider-requests/accept-provider-request", "acceptProviderRequest", 30, []],
  ["bookings/submit-booking-request", "submitBookingRequest", 30, []],
  ["bookings/booking-lifecycle-v3", "reconcileBookingPolicyV3", 60, ["PAYMONGO_SECRET_KEY"]],
];
for (const [file, name, timeout, secrets] of functions) {
  test(`compiled ${name} retains deployed runtime, trigger and secret configuration`, () => {
    // Inspect the serialized Firebase manifest: SDK ResetValue sentinels emit JSON null.
    const endpoint = JSON.parse(JSON.stringify(require(`../lib/${file}.js`)[name].__endpoint));
    assert.equal(endpoint.platform, "gcfv2");
    assert.deepEqual(endpoint.region, ["asia-southeast1"]);
    assert.equal(endpoint.availableMemoryMb, 256);
    assert.equal(endpoint.maxInstances, 20);
    assert.equal(endpoint.timeoutSeconds, timeout);
    assert.equal(endpoint.concurrency, 80);
    assert.deepEqual((endpoint.secretEnvironmentVariables ?? []).map(secret => secret.key), secrets);
    for (const field of ["serviceAccountEmail", "ingressSettings", "vpc", "minInstances"]) assert.equal(endpoint[field], null);
    if (name === "reconcileBookingPolicyV3") {
      assert.deepEqual(endpoint.scheduleTrigger, {schedule: "every 1 minutes", timeZone: "Asia/Manila", retryConfig: {retryCount: 2}});
      assert.equal(endpoint.callableTrigger, undefined);
    } else {
      assert.deepEqual(endpoint.callableTrigger, {});
      assert.equal(endpoint.scheduleTrigger, undefined);
      const source = fs.readFileSync(path.join(__dirname, `../src/${file}.ts`), "utf8");
      assert.match(source, /\.\.\.appCheckCallableOptions/u);
    }
  });
}
test("Node.js 22 and shared App Check/IAM options remain authoritative", () => {
  assert.equal(require("../package.json").engines.node, "22");
  const {appCheckCallableOptions, shouldEnforceAppCheck} = require("../lib/shared/function-options.js");
  assert.equal(shouldEnforceAppCheck({}), true);
  assert.equal(appCheckCallableOptions.invoker, "public");
  assert.equal(appCheckCallableOptions.region, "asia-southeast1");
});
