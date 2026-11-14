import {MAIN_EVENT_STATUSES, parseProviderRequestStatus} from "../shared/constants.js";
import {resolveProviderRequestRelationships, type LinkedProviderRequest,
  type ProviderRequestRelationshipFailureReason}
  from "../provider-requests/provider-request-relationships.js";

type SnapshotData = Readonly<Record<string, unknown>>;

export type AwaitingProviderEvidence = {
  kind: "validated";
  relationshipVersion: 1;
  pendingProviderRequestCount: number;
  awaitingProvider: boolean;
} | {
  kind: "reconciliation_required";
  reason: ProviderRequestRelationshipFailureReason |
    "relationship-version-not-enabled" | "invalid-main-event-status" |
    "noncanonical-request-status" | "pending-request-has-response-evidence" |
    "invalid-stored-counts" | "stored-count-mismatch" |
    "pending-parent-status-mismatch";
};

/**
 * Audit-only pure prerequisite, deliberately not wired into lifecycle writers.
 * Requires exhaustive trusted linked snapshots and parent from one consistent
 * read. This function cannot prove input completeness or writer trust itself.
 * Unknown evidence is never converted to a zero count or false eligibility.
 */
export function inspectAwaitingProviderEvidence(input: {
  mainEventId: string;
  mainEvent: SnapshotData;
  linkedRequests: readonly LinkedProviderRequest[];
}): AwaitingProviderEvidence {
  const event = input.mainEvent;
  // Do not introduce a new v2 production consumer before compatibility rollout.
  if (event.providerRequestRelationshipVersion !== undefined &&
    event.providerRequestRelationshipVersion !== 1) {
    return {kind: "reconciliation_required", reason: "relationship-version-not-enabled"};
  }
  const relationships = resolveProviderRequestRelationships(input);
  if (!relationships.ok) {
    return {kind: "reconciliation_required", reason: relationships.reason};
  }
  if (!(MAIN_EVENT_STATUSES as readonly unknown[]).includes(event.status)) {
    return {kind: "reconciliation_required", reason: "invalid-main-event-status"};
  }
  const byId = new Map(input.linkedRequests.map(document => [document.id, document.data]));
  let pending = 0;
  for (const id of relationships.activeRequired) {
    const request = byId.get(id)!;
    const status = parseProviderRequestStatus(request.status);
    if (status !== request.status) {
      return {kind: "reconciliation_required", reason: "noncanonical-request-status"};
    }
    if (status !== "pending") continue;
    if (["respondedAt", "acceptedAt", "rejectedAt", "cancelledAt", "expiredAt",
      "confirmedAt", "completedAt"].some(field => request[field] != null)) {
      return {kind: "reconciliation_required", reason: "pending-request-has-response-evidence"};
    }
    pending++;
  }
  if (!safeCount(event.pendingProviderRequestCount) || !safeCount(event.providerRequestCount)) {
    return {kind: "reconciliation_required", reason: "invalid-stored-counts"};
  }
  if (event.pendingProviderRequestCount !== pending ||
    event.providerRequestCount !== relationships.activeRequired.length) {
    return {kind: "reconciliation_required", reason: "stored-count-mismatch"};
  }
  const pendingParent = event.status === "pending_provider_approval" ||
    event.status === "needs_provider_replacement";
  if (pending > 0 && !pendingParent) {
    return {kind: "reconciliation_required", reason: "pending-parent-status-mismatch"};
  }
  return {kind: "validated", relationshipVersion: 1,
    pendingProviderRequestCount: pending, awaitingProvider: pendingParent && pending > 0};
}

function safeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Schema-independent candidate query for all history / draft history only.
 * customerId MUST come from server authentication. This is not a public input
 * validator or a search endpoint. Deletion must be checked on returned source
 * records; no isDeleted/createdAt constraint may omit legal sparse drafts.
 */
export function customerBookingHistoryQueryContract(input: {
  customerId: string;
  filter: "all" | "draft";
  pageSize: number;
}) {
  if (!input.customerId || input.customerId.includes("/") ||
    (input.filter !== "all" && input.filter !== "draft") ||
    !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 30) {
    throw new Error("Invalid internal history query contract.");
  }
  return {
    collection: "mainEvents" as const,
    equalities: [
      {field: "customerId", value: input.customerId},
      ...(input.filter === "draft" ? [{field: "status", value: "draft"}] : []),
    ],
    order: [{field: "__name__", direction: "ASCENDING" as const}],
    // One bounded candidate batch, NOT a promise of a full nondeleted page.
    limit: input.pageSize + 1,
  };
}
