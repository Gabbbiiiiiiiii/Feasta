import {parseProviderRequestStatus} from "../shared/constants.js";

type SnapshotData = Readonly<Record<string, unknown>>;

/** Plain trusted document snapshots, independent of Firestore runtime objects. */
export type LinkedProviderRequest = {
  readonly id: string;
  readonly data: SnapshotData;
};

export type ProviderRequestRelationshipFailureReason =
  | "unsupported-relationship-version"
  | "malformed-provider-request-ids"
  | "duplicate-provider-request-ids"
  | "complete-membership-mismatch"
  | "request-event-identity-mismatch"
  | "invalid-request-status"
  | "mixed-v1-v2-relationship-data"
  | "missing-active-provider-request-ids"
  | "malformed-active-provider-request-ids"
  | "duplicate-active-provider-request-ids"
  | "malformed-predecessor"
  | "missing-predecessor"
  | "self-predecessor"
  | "predecessor-outside-event"
  | "cycle"
  | "fork"
  | "invalid-supersession"
  | "incompatible-assignment"
  | "provider-reuse-in-chain"
  | "active-set-mismatch";

export type ProviderRequestRelationshipResult = {
  ok: true;
  version: 1 | 2;
  /** IDs in canonical membership order, including every historical attempt. */
  complete: readonly string[];
  /** Chain tips in original/root assignment order. */
  activeRequired: readonly string[];
  /** Superseded IDs in canonical membership order. */
  historical: readonly string[];
  rootByRequestId: ReadonlyMap<string, string>;
  /** Provider IDs in predecessor-to-successor order, keyed in root order. */
  attemptedProviderIdsByRoot: ReadonlyMap<string, readonly string[]>;
} | {
  ok: false;
  reason: ProviderRequestRelationshipFailureReason;
};

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{8,160}$/u;

/**
 * Pure relationship validation, not a client authorization API or rollout gate.
 * The caller must supply exhaustive trusted linked documents (not just fetch
 * IDs from the stored membership/projection) from one consistent read. This
 * function cannot discover omitted database documents or prove writer trust,
 * predecessor immutability, service suitability, or commercial consent.
 * No production consumer should use v2 until the compatibility rollout.
 */
export function resolveProviderRequestRelationships(input: {
  mainEventId: string;
  mainEvent: SnapshotData;
  linkedRequests: readonly LinkedProviderRequest[];
}): ProviderRequestRelationshipResult {
  const {mainEventId, mainEvent, linkedRequests} = input;
  if (!isRecord(mainEvent)) return failure("request-event-identity-mismatch");
  const version = mainEvent.providerRequestRelationshipVersion === undefined ?
    1 : mainEvent.providerRequestRelationshipVersion;
  if (version !== 1 && version !== 2) return failure("unsupported-relationship-version");

  const complete = mainEvent.providerRequestIds;
  if (!isIdList(complete)) return failure("malformed-provider-request-ids");
  const membership = new Set(complete);
  if (membership.size !== complete.length) return failure("duplicate-provider-request-ids");
  if (!isId(mainEventId) || mainEvent.mainEventId !== mainEventId ||
    mainEvent.bookingId !== mainEventId || !isId(mainEvent.customerId)) {
    return failure("request-event-identity-mismatch");
  }
  if (!Array.isArray(linkedRequests)) return failure("complete-membership-mismatch");
  const requests = new Map<string, SnapshotData>();
  for (const document of linkedRequests) {
    if (!isRecord(document) || !isId(document.id) || !isRecord(document.data)) {
      return failure("request-event-identity-mismatch");
    }
    const {id, data} = document;
    if (data.providerRequestId !== id || data.mainEventId !== mainEventId ||
      data.bookingId !== mainEventId || data.customerId !== mainEvent.customerId ||
      !isId(data.providerId)) return failure("request-event-identity-mismatch");
    if (!membership.has(id) || requests.has(id)) return failure("complete-membership-mismatch");
    if (!parseProviderRequestStatus(data.status)) return failure("invalid-request-status");
    requests.set(id, data);
  }

  if (version === 1 && (Object.hasOwn(mainEvent, "activeProviderRequestIds") ||
    linkedRequests.some(({data}) => Object.hasOwn(data, "replacesProviderRequestId")))) {
    return failure("mixed-v1-v2-relationship-data");
  }

  const successor = new Map<string, string>();
  const predecessor = new Map<string, string>();
  if (version === 2) {
    if (!Object.hasOwn(mainEvent, "activeProviderRequestIds")) {
      return failure("missing-active-provider-request-ids");
    }
    if (!isIdList(mainEvent.activeProviderRequestIds)) {
      return failure("malformed-active-provider-request-ids");
    }
    if (new Set(mainEvent.activeProviderRequestIds).size !==
      mainEvent.activeProviderRequestIds.length) {
      return failure("duplicate-active-provider-request-ids");
    }
    for (const [id, data] of requests) {
      const previous = data.replacesProviderRequestId;
      if (previous === undefined || previous === null) continue;
      if (!isId(previous)) return failure("malformed-predecessor");
      if (previous === id) return failure("self-predecessor");
      if (!membership.has(previous)) return failure("predecessor-outside-event");
      if (!requests.has(previous)) return failure("missing-predecessor");
      if (successor.has(previous)) return failure("fork");
      predecessor.set(id, previous);
      successor.set(previous, id);
    }
  }
  if (requests.size !== complete.length) return failure("complete-membership-mismatch");

  // Iterative traversal visits each document once, with no attempt cap or
  // recursion depth limit. A finite non-forking component without a root cycles.
  const roots = complete.filter((id) => !predecessor.has(id));
  const rootByRequestId = new Map<string, string>();
  const attemptedProviderIdsByRoot = new Map<string, string[]>();
  const activeRequired: string[] = [];
  for (const root of roots) {
    const attempted: string[] = [];
    let id: string | undefined = root;
    while (id !== undefined) {
      rootByRequestId.set(id, root);
      attempted.push(requests.get(id)!.providerId as string);
      const next: string | undefined = successor.get(id);
      if (next === undefined) activeRequired.push(id);
      id = next;
    }
    attemptedProviderIdsByRoot.set(root, attempted);
  }
  if (rootByRequestId.size !== complete.length) return failure("cycle");
  for (const attempted of attemptedProviderIdsByRoot.values()) {
    if (new Set(attempted).size !== attempted.length) return failure("provider-reuse-in-chain");
  }
  for (const [previous, next] of successor) {
    const ancestor = requests.get(previous)!;
    const replacement = requests.get(next)!;
    if (!isRecoverableRejection(ancestor, replacement)) return failure("invalid-supersession");
    if (!hasAssignmentContinuity(ancestor, replacement, mainEvent)) {
      return failure("incompatible-assignment");
    }
  }
  if (version === 2 && !sameIds(mainEvent.activeProviderRequestIds, activeRequired)) {
    return failure("active-set-mismatch");
  }
  return {
    ok: true,
    version,
    complete: [...complete],
    activeRequired,
    historical: complete.filter((id) => successor.has(id)),
    rootByRequestId,
    attemptedProviderIdsByRoot,
  };
}

function failure(reason: ProviderRequestRelationshipFailureReason):
  ProviderRequestRelationshipResult {
  return {ok: false, reason};
}

function isId(value: unknown): value is string {
  return typeof value === "string" && SAFE_DOCUMENT_ID.test(value);
}

function isIdList(value: unknown): value is string[] {
  // for..of also visits sparse slots; Array.every would silently skip them.
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const id of value) if (!isId(id)) return false;
  return true;
}

function isRecord(value: unknown): value is SnapshotData {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameIds(value: unknown, expected: readonly string[]): boolean {
  return isIdList(value) && value.length === expected.length &&
    value.every((id, index) => id === expected[index]);
}

/** Exact structural Firestore Timestamp comparison without importing its SDK. */
function timestampParts(value: unknown): readonly [number, number] | null {
  if (!isRecord(value)) return null;
  const {seconds, nanoseconds} = value;
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) ||
    seconds < -62135596800 || seconds > 253402300799 ||
    typeof nanoseconds !== "number" || !Number.isInteger(nanoseconds) ||
    nanoseconds < 0 || nanoseconds >= 1e9) return null;
  return [seconds, nanoseconds];
}

function sameTimestamp(left: unknown, right: unknown): boolean {
  const a = timestampParts(left);
  const b = timestampParts(right);
  return a !== null && b !== null && a[0] === b[0] && a[1] === b[1];
}

function isRecoverableRejection(previous: SnapshotData, next: SnapshotData): boolean {
  // reject-provider-request writes these fields together. No current evidence
  // distinguishes provider-response expiration from other expiration causes.
  // A status alone, or an invented expiration-cause flag, cannot suffice.
  const rejected = timestampParts(previous.rejectedAt);
  const requested = timestampParts(next.requestedAt);
  return previous.status === "rejected" && previous.replacementStatus === "required" &&
    canonicalText(previous.rejectionReason) && previous.rejectionReason.length >= 5 &&
    previous.rejectionReason.length <= 500 &&
    rejected !== null && requested !== null &&
    sameTimestamp(previous.rejectedAt, previous.respondedAt) &&
    (rejected[0] < requested[0] ||
      (rejected[0] === requested[0] && rejected[1] <= requested[1])) &&
    previous.paymentStatus === "unpaid" &&
    ["paymentId", "paidAt", "confirmedAt", "completedAt", "cancelledAt"].every(
      (field) => previous[field] === null || previous[field] === undefined,
    );
}

function canonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

/**
 * Validate only continuity observable in today's immutable snapshots: event
 * scope, assignment type and every service category occurrence in the bundle.
 * Provider-specific catalog IDs, names, prices and refund terms can change.
 * Category equality cannot prove detailed offering equivalence or availability;
 * a future trusted replacement writer must establish suitability and consent.
 */
function hasAssignmentContinuity(
  previous: SnapshotData, next: SnapshotData, event: SnapshotData,
): boolean {
  if (previous.type !== next.type) return false;
  for (const field of ["eventType", "eventTime", "eventEndTime",
    "eventLocation", "eventAddress"]) {
    if (!canonicalText(event[field]) || previous[field] !== event[field] ||
      next[field] !== event[field]) return false;
  }
  if (!Number.isSafeInteger(event.guestCount) || (event.guestCount as number) <= 0 ||
    previous.guestCount !== event.guestCount || next.guestCount !== event.guestCount ||
    !sameTimestamp(previous.eventDate, event.eventDate) ||
    !sameTimestamp(next.eventDate, event.eventDate)) return false;
  const before = bundleCategories(previous);
  const after = bundleCategories(next);
  return before !== null && after !== null && before.size === after.size &&
    [...before].every(([category, count]) => after.get(category) === count);
}

function bundleCategories(request: SnapshotData): Map<string, number> | null {
  if (request.type !== "catering" && request.type !== "addon") return null;
  if (!Array.isArray(request.services) || request.services.length === 0) return null;
  const ids = new Set<string>();
  const categories = new Map<string, number>();
  let packageFound = false;
  for (const service of request.services) {
    if (!isRecord(service) || !isId(service.serviceId) || ids.has(service.serviceId) ||
      !canonicalText(service.name) || !canonicalText(service.category)) return null;
    ids.add(service.serviceId);
    categories.set(service.category, (categories.get(service.category) ?? 0) + 1);
    if (service.serviceId === request.packageId) {
      if (service.category !== "catering_package" ||
        service.name !== request.packageName) return null;
      packageFound = true;
    }
  }
  if (request.type === "catering") {
    if (!isId(request.packageId) || !packageFound ||
      categories.get("catering_package") !== 1) return null;
  } else if (request.packageId !== null || request.packageName !== null ||
    categories.has("catering_package")) return null;
  return categories;
}
