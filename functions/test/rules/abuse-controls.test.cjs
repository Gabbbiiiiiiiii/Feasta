const assert = require("node:assert/strict");
const {after, before, beforeEach, test} = require("node:test");

const {createRulesTestEnvironment} = require("./rules-test-helpers.cjs");

let testEnv;
let idempotency;
let rateLimit;

before(async () => {
  testEnv = await createRulesTestEnvironment();
  require("../../lib/shared/firebase-admin.js");
  idempotency = require("../../lib/shared/idempotency.js");
  rateLimit = require("../../lib/shared/rate-limit.js");
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test("duplicate idempotent invocation replays one stored result", async () => {
  const key = idempotency.createIdempotencyKey({
    operation: "testOperation",
    actorId: "user-one",
    clientKey: "request-one",
  });
  let sideEffects = 0;
  const invoke = () => idempotency.executeIdempotently({
    key,
    operation: "testOperation",
    actorId: "user-one",
    handler: async () => {
      sideEffects++;
      return {createdId: "fixed-result"};
    },
  });

  const first = await invoke();
  const duplicate = await invoke();

  assert.equal(first.replayed, false);
  assert.equal(duplicate.replayed, true);
  assert.deepEqual(duplicate.result, first.result);
  assert.equal(sideEffects, 1);
});

test("rate limit uses an atomic bucket and returns retry timing", async () => {
  const input = {
    scope: "test.limit",
    subject: "user:user-one",
    limit: 2,
    windowSeconds: 60,
  };

  await rateLimit.enforceRateLimit(input);
  await rateLimit.enforceRateLimit(input);
  await assert.rejects(
    rateLimit.enforceRateLimit(input),
    (error) => {
      assert.equal(error.code, "resource-exhausted");
      assert.equal(error.details.limit, 2);
      assert.ok(error.details.retryAfterSeconds >= 1);
      return true;
    },
  );
});
