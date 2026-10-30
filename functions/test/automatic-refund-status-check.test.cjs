const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const schedule = require("../lib/refunds/refund-status-check-schedule.js");

const now = Date.parse("2026-10-06T12:00:00.000Z");
const lease = now + schedule.REFUND_STATUS_CHECK_CLAIM_LEASE_MS;

function snapshot(patch = {}) {
  return {
    status: "refund_processing",
    attempts: 0,
    failures: 0,
    state: "scheduled",
    dueAtMs: now - 1,
    claimedUntilMs: lease,
    ...patch,
  };
}

test("refund status checks wait longer after each attempt and then stay hourly", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((attempt) => schedule.delayBeforeRefundStatusAttempt(attempt)),
    [60_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000, 3_600_000],
  );
});

test("an in-flight claim is not replaced by the first schedule arm", () => {
  const patch = schedule.initialRefundStatusCheckPatch({
    status: "refund_processing",
    refundStatusCheckClaimedUntil: {toMillis: () => now + 60_000},
  }, now);
  assert.deepEqual(patch, {});
});

test("terminal refund states have no next automatic check", () => {
  const patch = schedule.refundStatusCheckUpdate(snapshot(), now, "terminal", {ownedClaimUntilMs: lease});
  assert.equal(patch.refundStatusCheckDueAt, null);
  assert.equal(patch.refundAutomaticCheckState, "stopped");
});

test("a due pending refund is claimable and a future, busy, review, or confirmed refund is not", () => {
  assert.equal(schedule.decideRefundStatusCheckClaim(snapshot({claimedUntilMs: null}), now), "claim");
  assert.equal(schedule.decideRefundStatusCheckClaim(snapshot({dueAtMs: now + 1, claimedUntilMs: null}), now), "skip");
  assert.equal(schedule.decideRefundStatusCheckClaim(snapshot({claimedUntilMs: now + 1}), now), "skip");
  assert.equal(schedule.decideRefundStatusCheckClaim(snapshot({state: "review", claimedUntilMs: null}), now), "skip");
  assert.equal(schedule.decideRefundStatusCheckClaim(snapshot({status: "refund_completed", claimedUntilMs: null}), now), "skip");
});

test("two workers can claim the same refund only once", async () => {
  let claimedUntil = null;
  let retrieves = 0;
  const claim = async () => {
    const decision = schedule.decideRefundStatusCheckClaim(snapshot({claimedUntilMs: claimedUntil, dueAtMs: now - 1}), now);
    if (decision !== "claim") return {claimed: false, claimUntilMs: null};
    claimedUntil = lease;
    return {claimed: true, claimUntilMs: lease};
  };
  const run = () => schedule.executeAutomaticRefundStatusCheck({
    nowMs: now,
    claim,
    load: async () => ({kind: "ready", gatewayRefundId: "ref_123"}),
    retrieve: async () => {retrieves += 1; return "pending";},
    apply: async () => "processing",
    commit: async () => {},
  });
  const [first, second] = await Promise.all([run(), run()]);
  assert.deepEqual([first, second].sort(), ["pending", "skipped"]);
  assert.equal(retrieves, 1);
});

test("a pending provider result stays pending and schedules the next backoff", async () => {
  const record = snapshot({attempts: 0, failures: 2, claimedUntilMs: null, dueAtMs: now - 1});
  const result = await schedule.executeAutomaticRefundStatusCheck({
    nowMs: now,
    claim: async () => ({claimed: true, claimUntilMs: lease}),
    load: async () => ({kind: "ready", gatewayRefundId: "ref_123"}),
    retrieve: async () => "pending",
    apply: async () => "processing",
    commit: async (outcome) => {
      Object.assign(record, schedule.refundStatusCheckUpdate(
        {...record, claimedUntilMs: lease}, now, outcome, {ownedClaimUntilMs: lease},
      ));
    },
  });
  assert.equal(result, "pending");
  assert.equal(record.status, "refund_processing");
  assert.equal(record.refundStatusCheckAttempts, 1);
  assert.equal(record.refundAutomaticCheckFailures, 0);
  assert.equal(record.refundStatusCheckDueAt, now + 120_000);
});

test("a completed provider result confirms the refund and stops future checks", async () => {
  const record = snapshot();
  let created = 0;
  const result = await schedule.executeAutomaticRefundStatusCheck({
    nowMs: now,
    claim: async () => ({claimed: true, claimUntilMs: lease}),
    load: async () => ({kind: "ready", gatewayRefundId: "ref_123"}),
    retrieve: async () => "succeeded",
    apply: async () => {record.status = "refund_completed"; return "completed";},
    commit: async (outcome) => Object.assign(record, schedule.refundStatusCheckUpdate(record, now, outcome, {ownedClaimUntilMs: lease})),
  });
  assert.equal(result, "confirmed");
  assert.equal(created, 0);
  assert.equal(record.refundStatusCheckDueAt, null);
  assert.equal(record.refundAutomaticCheckState, "stopped");
});

test("an explicit provider failure records failure without scheduling another check", async () => {
  const record = snapshot();
  const result = await schedule.executeAutomaticRefundStatusCheck({
    nowMs: now,
    claim: async () => ({claimed: true, claimUntilMs: lease}),
    load: async () => ({kind: "ready", gatewayRefundId: "ref_123"}),
    retrieve: async () => "failed",
    apply: async () => {record.status = "refund_failed"; return "failed";},
    commit: async (outcome) => Object.assign(record, schedule.refundStatusCheckUpdate(record, now, outcome, {ownedClaimUntilMs: lease})),
  });
  assert.equal(result, "failed");
  assert.equal(record.refundAutomaticCheckState, "stopped");
  assert.equal(record.refundStatusCheckDueAt, null);
});

test("a trusted mismatch needs review and does not create a refund", async () => {
  let retrieved = 0;
  const record = snapshot();
  const result = await schedule.executeAutomaticRefundStatusCheck({
    nowMs: now,
    claim: async () => ({claimed: true, claimUntilMs: lease}),
    load: async () => ({kind: "ready", gatewayRefundId: "ref_123"}),
    retrieve: async () => {retrieved += 1; return "succeeded";},
    apply: async () => "review",
    commit: async (outcome, reason) => Object.assign(record, schedule.refundStatusCheckUpdate(
      record, now, outcome, {ownedClaimUntilMs: lease, reason},
    )),
  });
  assert.equal(result, "review");
  assert.equal(retrieved, 1);
  assert.equal(record.refundAutomaticCheckState, "review");
  assert.equal(record.refundAutomaticCheckReason, "trusted_mismatch");
  assert.equal(record.status, "refund_processing");
});

test("missing refund evidence needs review and never calls the provider", async () => {
  let retrieved = 0;
  const record = snapshot({claimedUntilMs: null});
  const result = await schedule.executeAutomaticRefundStatusCheck({
    nowMs: now,
    claim: async () => ({claimed: true, claimUntilMs: lease}),
    load: async () => ({kind: "review", reason: "missing_refund_reference"}),
    retrieve: async () => {retrieved += 1; return "pending";},
    apply: async () => {throw new Error("refund creation is not allowed");},
    commit: async (outcome, reason) => Object.assign(record, schedule.refundStatusCheckUpdate(
      {...record, claimedUntilMs: lease}, now, outcome, {ownedClaimUntilMs: lease, reason},
    )),
  });
  assert.equal(result, "review");
  assert.equal(retrieved, 0);
  assert.equal(record.refundAutomaticCheckReason, "missing_refund_reference");
});

test("a temporary provider error retries without marking the refund failed", async () => {
  const record = snapshot({failures: 1});
  const result = await schedule.executeAutomaticRefundStatusCheck({
    nowMs: now,
    claim: async () => ({claimed: true, claimUntilMs: lease}),
    load: async () => ({kind: "ready", gatewayRefundId: "ref_123"}),
    retrieve: async () => {throw new Error("network down");},
    apply: async () => {throw new Error("must not apply");},
    commit: async (outcome) => Object.assign(record, schedule.refundStatusCheckUpdate(record, now, outcome, {ownedClaimUntilMs: lease})),
  });
  assert.equal(result, "retry");
  assert.equal(record.status, "refund_processing");
  assert.equal(record.refundAutomaticCheckFailures, 2);
  assert.equal(record.refundAutomaticCheckState, "scheduled");
  assert.equal(record.refundStatusCheckDueAt, now + 120_000);
});

test("repeated temporary failures stop at review instead of failing the refund", () => {
  const patch = schedule.refundStatusCheckUpdate(
    snapshot({failures: schedule.REFUND_STATUS_CHECK_MAX_FAILURES - 1, attempts: 4}),
    now,
    "temporary_failure",
    {ownedClaimUntilMs: lease},
  );
  assert.equal(patch.refundAutomaticCheckState, "review");
  assert.equal(patch.refundAutomaticCheckReason, "automatic_checks_exhausted");
  assert.equal(patch.refundStatusCheckDueAt, null);
  assert.equal(patch.status, undefined);
});

test("a not-yet-due or already confirmed refund is skipped", async () => {
  let retrieved = 0;
  const retrieve = async () => {retrieved += 1; return "pending";};
  const skipped = await schedule.executeAutomaticRefundStatusCheck({
    nowMs: now,
    claim: async () => ({claimed: false, claimUntilMs: null}),
    load: async () => ({kind: "ready", gatewayRefundId: "ref_123"}),
    retrieve,
    apply: async () => "processing",
    commit: async () => {throw new Error("must not commit");},
  });
  assert.equal(skipped, "skipped");
  assert.equal(retrieved, 0);
});

test("a webhook confirmation that lands while the fallback is in flight is not overwritten", async () => {
  const record = snapshot({dueAtMs: now + 60_000});
  const result = await schedule.executeAutomaticRefundStatusCheck({
    nowMs: now,
    claim: async () => ({claimed: true, claimUntilMs: lease}),
    load: async () => ({kind: "ready", gatewayRefundId: "ref_123"}),
    retrieve: async () => "pending",
    apply: async () => {
      record.status = "refund_completed";
      record.refundStatusCheckDueAt = null;
      record.refundAutomaticCheckState = "stopped";
      record.claimedUntilMs = null;
      return "stale";
    },
    commit: async (outcome) => {
      const patch = schedule.refundStatusCheckUpdate(record, now, outcome, {ownedClaimUntilMs: lease});
      if (patch) Object.assign(record, patch);
    },
  });
  assert.equal(result, "confirmed");
  assert.equal(record.status, "refund_completed");
  assert.equal(record.refundStatusCheckDueAt, null);
  assert.notEqual(record.refundAutomaticCheckState, "scheduled");
});

test("automatic fallback retrieves an existing refund and does not create one", () => {
  const source = readFileSync(path.resolve(__dirname, "../src/refunds/automatic-refund-status-check.ts"), "utf8");
  const preparation = readFileSync(path.resolve(__dirname, "../src/refunds/refund-execution.ts"), "utf8");
  assert.match(source, /retrievePayMongoRefund/u);
  assert.doesNotMatch(source, /createPayMongoRefund/u);
  assert.match(source, /prepareExistingRefundReconciliation/u);
  assert.match(source, /source:\s*"automatic_reconciliation"/u);
  assert.match(preparation, /export async function prepareExistingRefundReconciliation/);
  const prepared = preparation.slice(
    preparation.indexOf("export async function prepareExistingRefundReconciliation"),
    preparation.indexOf("function assertAdminReconciliationEvidence"),
  );
  assert.match(prepared, /readTrustedProviderRequestPaymentSetInTransaction/u);
  assert.match(prepared, /readRefundOperationBindings/u);
  assert.doesNotMatch(prepared, /paymentIdForProviderRequest\(/u);
  assert.match(source, /schedule:\s*"\* \* \* \* \*"/u);
  assert.match(source, /limit\(REFUND_STATUS_CHECK_BATCH_SIZE\)/u);
});

test("webhook refund delivery stays verified, idempotent, and non-regressing", () => {
  const webhook = readFileSync(path.resolve(__dirname, "../src/payments/paymongo-webhook.ts"), "utf8");
  const processor = readFileSync(path.resolve(__dirname, "../src/payments/process-webhook.ts"), "utf8");
  const execution = readFileSync(path.resolve(__dirname, "../src/refunds/refund-execution.ts"), "utf8");
  const signature = webhook.indexOf("verifyPayMongoSignature");
  const processing = webhook.indexOf("processPayMongoWebhook");
  assert.ok(signature > -1 && signature < processing);
  assert.match(webhook, /invalid_signature/u);
  assert.match(processor, /reconcileGatewayRefund/u);
  const replay = execution.indexOf("if (eventSnapshot?.exists)");
  const completed = execution.indexOf("refund_already_completed");
  const completionWrite = execution.indexOf("refundedAmountInCentavos:", completed);
  const notification = execution.indexOf("Your approved Provider service refund was completed.");
  assert.ok(replay > -1 && completed > replay);
  assert.ok(completionWrite > completed && notification > completionWrite);
});
