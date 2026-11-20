import {Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {defineSecret} from "firebase-functions/params";
import {HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {
  retrievePayMongoRefund,
  type PayMongoRefundResource,
} from "../payments/paymongo-client.js";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {
  prepareExistingRefundReconciliation,
  reconcileGatewayRefund,
} from "./refund-execution.js";
import {
  REFUND_STATUS_CHECK_BATCH_SIZE,
  REFUND_STATUS_CHECK_BOOTSTRAP_LIMIT,
  REFUND_STATUS_CHECK_BOOTSTRAP_SCAN,
  REFUND_STATUS_CHECK_CLAIM_LEASE_MS,
  decideRefundStatusCheckClaim,
  executeAutomaticRefundStatusCheck,
  refundStatusCheckSnapshotFromRecord,
  refundStatusCheckUpdate,
  type AutomaticRefundLoad,
  type RefundStatusCheckOutcome,
} from "./refund-status-check-schedule.js";

const payMongoSecretKey = defineSecret("PAYMONGO_SECRET_KEY");
const CANCELLATIONS = "providerRequestCancellationRequests";

/**
 * Recover unresolved refunds when a webhook is delayed or missed.
 * Each run reads only due processing refunds, in a bounded batch, and
 * retrieves the existing provider refund. It does not create one.
 */
export const reconcileUnresolvedRefundStatuses = onSchedule(
  {
    schedule: "* * * * *",
    timeZone: "Asia/Manila",
    region: "asia-southeast1",
    retryCount: 0,
    timeoutSeconds: 120,
    maxInstances: 1,
    secrets: [payMongoSecretKey],
  },
  async (event) => {
    const now = new Date(event.scheduleTime);
    if (!Number.isFinite(now.getTime())) {
      throw new Error("Scheduled refund check time is invalid.");
    }
    await sweepUnresolvedRefundStatuses(now);
  },
);

export async function sweepUnresolvedRefundStatuses(now: Date): Promise<void> {
  const nowMs = now.getTime();
  const due = await db.collection(CANCELLATIONS)
    .where("status", "==", "refund_processing")
    .where("refundStatusCheckDueAt", "<=", Timestamp.fromMillis(nowMs))
    .orderBy("refundStatusCheckDueAt", "asc")
    .limit(REFUND_STATUS_CHECK_BATCH_SIZE)
    .get();
  const ids = new Set(due.docs.map((doc) => doc.id));
  if (ids.size < REFUND_STATUS_CHECK_BATCH_SIZE) {
    const processing = await db.collection(CANCELLATIONS)
      .where("status", "==", "refund_processing")
      .limit(REFUND_STATUS_CHECK_BOOTSTRAP_SCAN)
      .get();
    let bootstrapCount = 0;
    for (const doc of processing.docs) {
      if (bootstrapCount >= REFUND_STATUS_CHECK_BOOTSTRAP_LIMIT || ids.size >= REFUND_STATUS_CHECK_BATCH_SIZE) break;
      const data = doc.data();
      const updatedAtMs = timestampMillis(data.updatedAt);
      const recentlyStarted = updatedAtMs !== null && nowMs - updatedAtMs < 120_000;
      if (!recentlyStarted && data.refundStatusCheckDueAt == null &&
        data.refundAutomaticCheckState !== "review" && !ids.has(doc.id)) {
        ids.add(doc.id);
        bootstrapCount += 1;
      }
    }
  }
  for (const cancellationRequestId of ids) {
    try {
      await checkUnresolvedRefund(cancellationRequestId, nowMs);
    } catch (error) {
      logger.error("automatic refund check failed closed", {
        cancellationRequestId,
        reason: error instanceof HttpsError ? error.code : "unexpected",
      });
    }
  }
}

async function checkUnresolvedRefund(cancellationRequestId: string, nowMs: number): Promise<void> {
  let ownedClaimUntilMs: number | null = null;
  let paymentId = "";
  let operationId = "";
  let retrieved: PayMongoRefundResource | null = null;
  const outcome = await executeAutomaticRefundStatusCheck({
    nowMs,
    claim: async () => {
      const claimed = await claimRefundStatusCheck(cancellationRequestId, nowMs);
      ownedClaimUntilMs = claimed.claimUntilMs;
      if (claimed.claimed) logger.info("automatic refund check started", {cancellationRequestId});
      return claimed;
    },
    load: () => loadExistingRefund(cancellationRequestId, (prepared) => {
      paymentId = prepared.paymentId;
      operationId = prepared.operationId;
    }),
    retrieve: async (refundId) => {
      retrieved = await retrievePayMongoRefund(payMongoSecretKey.value(), refundId);
      return retrieved.status;
    },
    apply: async (providerStatus) => {
      if (!retrieved || retrieved.status !== providerStatus || !paymentId || !operationId) return "review";
      try {
        const reconciled = await reconcileGatewayRefund({
          paymentId,
          refundOperationId: operationId,
          refund: retrieved,
          actorId: "system",
          source: "automatic_reconciliation",
        });
        if (reconciled.status === "completed") return reconciled.replayed ? "stale" : "completed";
        if (reconciled.status === "failed") return "failed";
        return "processing";
      } catch (error) {
        if (isTemporary(error)) return "retry";
        return "review";
      }
    },
    commit: (result, reason) => {
      if (ownedClaimUntilMs === null) return Promise.resolve();
      return commitRefundStatusCheck({
        cancellationRequestId,
        nowMs,
        outcome: result,
        ownedClaimUntilMs,
        reason,
      });
    },
  });
  if (outcome === "skipped") return;
  logger.info(logMessage(outcome), {cancellationRequestId, outcome});
}

async function loadExistingRefund(
  cancellationRequestId: string,
  remember: (prepared: {paymentId: string; operationId: string}) => void,
): Promise<AutomaticRefundLoad> {
  try {
    const prepared = await prepareExistingRefundReconciliation({
      cancellationRequestId,
      actorId: "system",
      source: "automatic_reconciliation",
    });
    remember(prepared);
    return prepared.completed
      ? {kind: "completed"}
      : {kind: "ready", gatewayRefundId: prepared.gatewayRefundId};
  } catch (error) {
    if (isTemporary(error)) throw error;
    return {kind: "review", reason: reviewReason(error)};
  }
}

async function claimRefundStatusCheck(
  cancellationRequestId: string,
  nowMs: number,
): Promise<{claimed: boolean; claimUntilMs: number | null}> {
  const reference = db.collection(CANCELLATIONS).doc(cancellationRequestId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return {claimed: false, claimUntilMs: null};
    const current = refundStatusCheckSnapshotFromRecord(snapshot.data() ?? {});
    if (decideRefundStatusCheckClaim(current, nowMs) !== "claim") {
      return {claimed: false, claimUntilMs: null};
    }
    const claimUntilMs = nowMs + REFUND_STATUS_CHECK_CLAIM_LEASE_MS;
    transaction.update(reference, {
      refundStatusCheckClaimedUntil: Timestamp.fromMillis(claimUntilMs),
    });
    return {claimed: true, claimUntilMs};
  });
}

async function commitRefundStatusCheck(input: {
  cancellationRequestId: string;
  nowMs: number;
  outcome: RefundStatusCheckOutcome;
  ownedClaimUntilMs: number;
  reason?: string;
}): Promise<void> {
  const reference = db.collection(CANCELLATIONS).doc(input.cancellationRequestId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return;
    const current = refundStatusCheckSnapshotFromRecord(snapshot.data() ?? {});
    const patch = refundStatusCheckUpdate(current, input.nowMs, input.outcome, {
      ownedClaimUntilMs: input.ownedClaimUntilMs,
      reason: input.reason,
    });
    if (!patch) return;
    transaction.update(reference, {
      ...firestoreSchedulePatch(patch),
      updatedAt: serverTimestamp(),
    });
  });
}

function timestampMillis(value: unknown): number | null {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const millis = value.toMillis();
    return typeof millis === "number" && Number.isFinite(millis) ? millis : null;
  }
  return null;
}

function firestoreSchedulePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const dueAt = patch.refundStatusCheckDueAt;
  if (typeof dueAt !== "number") return patch;
  return {...patch, refundStatusCheckDueAt: Timestamp.fromMillis(dueAt)};
}

function isTemporary(error: unknown): boolean {
  return error instanceof HttpsError && (
    error.code === "unavailable" ||
    error.code === "deadline-exceeded" ||
    error.code === "resource-exhausted"
  );
}

function reviewReason(error: unknown): "missing_refund_reference" | "trusted_mismatch" {
  const reason = error instanceof HttpsError &&
    error.details &&
    typeof error.details === "object" &&
    "reason" in error.details
    ? String(error.details.reason)
    : "";
  return reason === "REFUND_OPERATION_NOT_FOUND" || reason === "REFUND_GATEWAY_LINKAGE_INVALID"
    ? "missing_refund_reference"
    : "trusted_mismatch";
}

function logMessage(outcome: string): string {
  if (outcome === "confirmed") return "refund confirmed";
  if (outcome === "pending") return "refund still pending";
  if (outcome === "review") return "refund needs review";
  if (outcome === "retry") return "automatic check temporarily failed";
  if (outcome === "failed") return "refund failed";
  return "automatic refund check started";
}
