/**
 * Automatic refund-status fallback schedule.
 *
 * The payment-provider webhook remains the primary update. This schedule
 * only decides when an unresolved refund is due for another read of the
 * existing provider refund. It never creates a refund.
 *
 * Attempt 1 waits 1 minute. Later attempts wait 2, 5, 15, then 30 minutes.
 * Further unresolved checks wait 60 minutes. Eight consecutive technical
 * failures stop the schedule and leave the refund for review.
 */

export const REFUND_STATUS_CHECK_BATCH_SIZE = 8;
export const REFUND_STATUS_CHECK_BOOTSTRAP_SCAN = 25;
export const REFUND_STATUS_CHECK_BOOTSTRAP_LIMIT = 3;
export const REFUND_STATUS_CHECK_CLAIM_LEASE_MS = 90_000;
export const REFUND_STATUS_CHECK_MAX_FAILURES = 8;
export const REFUND_STATUS_CHECK_DELAYS_MS = [
  60_000,
  120_000,
  300_000,
  900_000,
  1_800_000,
] as const;
export const REFUND_STATUS_CHECK_MAX_DELAY_MS = 3_600_000;

const ATTEMPT_CEILING = 1_000;

export type RefundAutomaticCheckState = "scheduled" | "review" | "stopped";

export type RefundStatusCheckSnapshot = {
  status: string;
  attempts: number;
  failures: number;
  state: RefundAutomaticCheckState | null;
  dueAtMs: number | null;
  claimedUntilMs: number | null;
};

export type RefundStatusCheckOutcome =
  | "pending"
  | "temporary_failure"
  | "terminal"
  | "review";

export type AutomaticRefundLoad =
  | {kind: "ready"; gatewayRefundId: string}
  | {kind: "completed"}
  | {kind: "review"; reason: "missing_refund_reference" | "trusted_mismatch"};

export type AppliedRefundCheck =
  | "processing"
  | "completed"
  | "failed"
  | "stale"
  | "review"
  | "retry";

export function delayBeforeRefundStatusAttempt(attemptNumber: number): number {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    return REFUND_STATUS_CHECK_DELAYS_MS[0];
  }
  const index = attemptNumber - 1;
  if (index < REFUND_STATUS_CHECK_DELAYS_MS.length) {
    return REFUND_STATUS_CHECK_DELAYS_MS[index];
  }
  return REFUND_STATUS_CHECK_MAX_DELAY_MS;
}

export function refundStatusCheckSnapshotFromRecord(
  record: Record<string, unknown>,
): RefundStatusCheckSnapshot {
  const state = record.refundAutomaticCheckState;
  return {
    status: typeof record.status === "string" ? record.status : "",
    attempts: boundedCount(record.refundStatusCheckAttempts),
    failures: boundedCount(record.refundAutomaticCheckFailures),
    state: state === "scheduled" || state === "review" || state === "stopped" ? state : null,
    dueAtMs: millisOf(record.refundStatusCheckDueAt),
    claimedUntilMs: millisOf(record.refundStatusCheckClaimedUntil),
  };
}

export function decideRefundStatusCheckClaim(
  snapshot: RefundStatusCheckSnapshot,
  nowMs: number,
): "claim" | "skip" {
  if (snapshot.status !== "refund_processing" || snapshot.state === "review") return "skip";
  if (snapshot.claimedUntilMs !== null && snapshot.claimedUntilMs > nowMs) return "skip";
  if (snapshot.dueAtMs !== null && snapshot.dueAtMs > nowMs) return "skip";
  return "claim";
}

export function initialRefundStatusCheckPatch(
  record: Record<string, unknown>,
  nowMs: number,
): Record<string, unknown> {
  const snapshot = refundStatusCheckSnapshotFromRecord(record);
  if (snapshot.claimedUntilMs !== null && snapshot.claimedUntilMs > nowMs) return {};
  if (snapshot.state !== "review" && snapshot.dueAtMs !== null) return {};
  return {
    refundStatusCheckAttempts: snapshot.attempts,
    refundAutomaticCheckFailures: 0,
    refundAutomaticCheckState: "scheduled",
    refundAutomaticCheckReason: null,
    refundStatusCheckClaimedUntil: null,
    refundStatusCheckDueAt: nowMs + delayBeforeRefundStatusAttempt(snapshot.attempts + 1),
  };
}

export function clearedRefundStatusCheckPatch(): Record<string, unknown> {
  return {
    refundStatusCheckDueAt: null,
    refundStatusCheckClaimedUntil: null,
    refundAutomaticCheckState: "stopped",
  };
}

export function refundStatusCheckUpdate(
  snapshot: RefundStatusCheckSnapshot,
  nowMs: number,
  outcome: RefundStatusCheckOutcome,
  options: {ownedClaimUntilMs: number; reason?: string},
): Record<string, unknown> | null {
  if (snapshot.claimedUntilMs !== options.ownedClaimUntilMs) return null;
  if (snapshot.status !== "refund_processing" || outcome === "terminal") {
    return {
      refundStatusCheckDueAt: null,
      refundStatusCheckClaimedUntil: null,
      refundAutomaticCheckState: snapshot.state === "review" ? "review" : "stopped",
    };
  }
  const attempts = Math.min(ATTEMPT_CEILING, snapshot.attempts + 1);
  if (outcome === "review" || (
    outcome === "temporary_failure" &&
    snapshot.failures + 1 >= REFUND_STATUS_CHECK_MAX_FAILURES
  )) {
    return {
      refundStatusCheckAttempts: attempts,
      refundAutomaticCheckFailures: outcome === "temporary_failure"
        ? snapshot.failures + 1
        : snapshot.failures,
      refundAutomaticCheckState: "review",
      refundAutomaticCheckReason: options.reason ?? (
        outcome === "temporary_failure" ? "automatic_checks_exhausted" : "trusted_mismatch"
      ),
      refundStatusCheckClaimedUntil: null,
      refundStatusCheckDueAt: null,
    };
  }
  const failures = outcome === "temporary_failure" ? snapshot.failures + 1 : 0;
  return {
    refundStatusCheckAttempts: attempts,
    refundAutomaticCheckFailures: failures,
    refundAutomaticCheckState: "scheduled",
    refundAutomaticCheckReason: null,
    refundStatusCheckClaimedUntil: null,
    refundStatusCheckDueAt: nowMs + delayBeforeRefundStatusAttempt(attempts + 1),
  };
}

export async function executeAutomaticRefundStatusCheck(input: {
  nowMs: number;
  claim: () => Promise<{claimed: boolean; claimUntilMs: number | null}>;
  load: () => Promise<AutomaticRefundLoad>;
  retrieve: (gatewayRefundId: string) => Promise<"pending" | "processing" | "succeeded" | "failed">;
  apply: (
    providerStatus: "pending" | "processing" | "succeeded" | "failed",
  ) => Promise<AppliedRefundCheck>;
  commit: (outcome: RefundStatusCheckOutcome, reason?: string) => Promise<void>;
}): Promise<"skipped" | "pending" | "confirmed" | "failed" | "review" | "retry"> {
  const claim = await input.claim();
  if (!claim.claimed || claim.claimUntilMs === null) return "skipped";
  let loaded: AutomaticRefundLoad;
  try {
    loaded = await input.load();
  } catch {
    await input.commit("temporary_failure");
    return "retry";
  }
  if (loaded.kind === "review") {
    await input.commit("review", loaded.reason);
    return "review";
  }
  if (loaded.kind === "completed") {
    await input.commit("terminal");
    return "confirmed";
  }
  let providerStatus: "pending" | "processing" | "succeeded" | "failed";
  try {
    providerStatus = await input.retrieve(loaded.gatewayRefundId);
  } catch {
    await input.commit("temporary_failure");
    return "retry";
  }
  const applied = await input.apply(providerStatus);
  if (applied === "retry") {
    await input.commit("temporary_failure");
    return "retry";
  }
  if (applied === "review") {
    await input.commit("review", "trusted_mismatch");
    return "review";
  }
  if (applied === "processing") {
    await input.commit("pending");
    return "pending";
  }
  await input.commit("terminal");
  return applied === "failed" ? "failed" : "confirmed";
}

function boundedCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= ATTEMPT_CEILING
    ? value
    : 0;
}

function millisOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    const millis = value.toMillis();
    return typeof millis === "number" && Number.isFinite(millis) ? millis : null;
  }
  return null;
}
