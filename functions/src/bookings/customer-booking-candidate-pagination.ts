import {createHmac, timingSafeEqual} from "node:crypto";
import {inspectAwaitingProviderEvidence} from "./customer-booking-search-prerequisites.js";
import type {LinkedProviderRequest} from "../provider-requests/provider-request-relationships.js";

export const BOOKING_CANDIDATE_BUDGET = 30;
export const BOOKING_RELATED_BUDGET = 30;
const ID = /^[A-Za-z0-9_-]{1,160}$/u;

export type CandidatePosition = {
  seconds: number;
  nanoseconds: number;
  documentId: string;
};

/** Internal validated context, not the eventual callable request parser. */
export type CandidateCursorBinding = {
  customerId: string;
  status: string;
  pageSize: number;
  section: "history";
  searchMode: "none";
  searchValue: "";
  order: "created_at_desc_v1";
};

export type BookingCandidate = {
  id: string;
  data: Readonly<Record<string, unknown>>;
};

export class BookingCandidateError extends Error {
  constructor(
    readonly code: "invalid-argument" | "failed-precondition",
    readonly reason: string,
  ) {
    super(code === "invalid-argument" ? "Invalid booking pagination input." :
      "Booking search requires reconciliation.");
    this.name = "BookingCandidateError";
  }
}

/** Pure query plan; future adapter must execute this in a consistent read. */
export function awaitingProviderCandidateQuery(binding: CandidateCursorBinding) {
  validateBinding(binding);
  if (binding.status !== "awaiting_provider") throw invalid();
  return {
    collection: "mainEvents" as const,
    filters: [
      {field: "customerId", operator: "==", value: binding.customerId},
      {field: "status", operator: "in", value:
        ["pending_provider_approval", "needs_provider_replacement"]},
    ],
    order: [{field: "createdAt", direction: "desc"}, {field: "__name__", direction: "desc"}],
    limit: BOOKING_CANDIDATE_BUDGET + 1,
  };
}

/** Limit+1 proves exhaustiveness only if fewer than 31 records are returned. */
export function awaitingProviderRelatedQuery(candidate: BookingCandidate) {
  const event = candidate.data;
  if (event.providerRequestRelationshipVersion !== undefined &&
    event.providerRequestRelationshipVersion !== 1) reconcile("relationship-version-not-enabled");
  if (!Array.isArray(event.providerRequestIds) || event.providerRequestIds.length === 0) {
    reconcile("malformed-provider-request-ids");
  }
  if ((event.providerRequestIds as unknown[]).length > BOOKING_RELATED_BUDGET) {
    reconcile("related-record-budget-exceeded");
  }
  return {collection: "providerRequests" as const,
    filters: [{field: "mainEventId", operator: "==", value: candidate.id}],
    limit: BOOKING_RELATED_BUDGET + 1};
}

/** No truncated input is ever passed to the v1 evidence validator. */
export function awaitingProviderCandidateMatches(
  candidate: BookingCandidate,
  linkedRequests: readonly LinkedProviderRequest[],
): boolean {
  awaitingProviderRelatedQuery(candidate);
  if (linkedRequests.length > BOOKING_RELATED_BUDGET) reconcile("related-record-budget-exceeded");
  const evidence = inspectAwaitingProviderEvidence({mainEventId: candidate.id,
    mainEvent: candidate.data, linkedRequests});
  if (evidence.kind === "reconciliation_required") reconcile(evidence.reason);
  return evidence.kind === "validated" && evidence.awaitingProvider;
}

/**
 * Pure batch consumer, not a database adapter/callable. evaluate must use the
 * exhaustive bounded related-query contract and snapshots from the same read.
 * It is called lazily only for consumed live candidates, never for lookahead.
 * A thrown reconciliation error aborts the page, returning no partial cursor.
 */
export function consumeAwaitingProviderCandidates(input: {
  binding: CandidateCursorBinding;
  candidates: readonly BookingCandidate[];
  after: CandidatePosition | null;
  evaluate: (candidate: BookingCandidate) => boolean;
}) {
  awaitingProviderCandidateQuery(input.binding);
  if (input.candidates.length > BOOKING_CANDIDATE_BUDGET + 1) throw invalid();
  if (input.after) validatePosition(input.after);
  let previous = input.after;
  // Defend the query boundary, but defer relationship evidence on unconsumed rows.
  for (const candidate of input.candidates) {
    const position = candidatePosition(candidate);
    if (candidate.data.customerId !== input.binding.customerId ||
      !["pending_provider_approval", "needs_provider_replacement"].includes(
        String(candidate.data.status),
      )) reconcile("candidate-scope-mismatch");
    if (previous && compareCandidatePositions(previous, position) >= 0) throw invalid();
    previous = position;
  }
  const bookings: BookingCandidate[] = [];
  let consumed = 0;
  let lastConsumed: CandidatePosition | null = null;
  for (const candidate of input.candidates.slice(0, BOOKING_CANDIDATE_BUDGET)) {
    // Deleted records are not eligible bookings and require no linked reads.
    if (candidate.data.isDeleted !== true && input.evaluate(candidate)) bookings.push(candidate);
    consumed++;
    lastConsumed = candidatePosition(candidate);
    if (bookings.length === input.binding.pageSize) break;
  }
  const hasMore = consumed < input.candidates.length;
  return {bookings, hasMore, lastConsumed, consumed,
    nextPosition: hasMore ? lastConsumed : null};
}

export function candidatePosition(candidate: BookingCandidate): CandidatePosition {
  const createdAt = candidate.data.createdAt as {seconds?: unknown; nanoseconds?: unknown} | null;
  const position = {seconds: createdAt?.seconds, nanoseconds: createdAt?.nanoseconds,
    documentId: candidate.id};
  try { validatePosition(position); } catch { reconcile("invalid-ordering-evidence"); }
  return position as CandidatePosition;
}

/** Negative means left precedes right in createdAt DESC, ID DESC order. */
export function compareCandidatePositions(
  left: CandidatePosition, right: CandidatePosition,
): number {
  return right.seconds - left.seconds || right.nanoseconds - left.nanoseconds ||
    Buffer.compare(Buffer.from(right.documentId), Buffer.from(left.documentId));
}

/** Authenticated opaque token (not encrypted); no key is stored or provisioned here. */
export function encodeCandidateCursor(
  binding: CandidateCursorBinding, position: CandidatePosition, key: Buffer,
): string {
  validateBinding(binding); validatePosition(position); validateKey(key);
  const payload = Buffer.from(JSON.stringify({v: 1, binding, position})).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

export function decodeCandidateCursor(
  token: string, binding: CandidateCursorBinding, key: Buffer,
): CandidatePosition {
  validateBinding(binding); validateKey(key);
  try {
    if (typeof token !== "string" || token.length > 4096) throw invalid();
    const parts = token.split(".");
    if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/u.test(part))) throw invalid();
    const [payload, signature] = parts;
    const mac = Buffer.from(signature, "base64url");
    const expected = createHmac("sha256", key).update(payload).digest();
    if (mac.length !== expected.length || mac.toString("base64url") !== signature ||
      !timingSafeEqual(mac, expected)) throw invalid();
    const bytes = Buffer.from(payload, "base64url");
    if (bytes.toString("base64url") !== payload) throw invalid();
    const decoded = JSON.parse(bytes.toString("utf8"));
    if (!decoded || Object.keys(decoded).sort().join() !== "binding,position,v" ||
      decoded.v !== 1 || !sameBinding(decoded.binding, binding)) throw invalid();
    validatePosition(decoded.position);
    return decoded.position;
  } catch { throw invalid(); }
}

function sameBinding(value: unknown, expected: CandidateCursorBinding): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return Object.keys(data).length === Object.keys(expected).length &&
    Object.entries(expected).every(([field, entry]) => data[field] === entry);
}

function validateBinding(binding: CandidateCursorBinding): void {
  if (!binding || typeof binding.customerId !== "string" || !binding.customerId.length ||
    binding.customerId.length > 128 || binding.customerId.includes("/") ||
    typeof binding.status !== "string" || !binding.status.length || binding.status.length > 40 ||
    !Number.isInteger(binding.pageSize) || binding.pageSize < 1 || binding.pageSize > 30 ||
    binding.section !== "history" || binding.searchMode !== "none" || binding.searchValue !== "" ||
    binding.order !== "created_at_desc_v1" || Object.keys(binding).length !== 7) throw invalid();
}

function validatePosition(value: unknown): asserts value is CandidatePosition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join() !== "documentId,nanoseconds,seconds" ||
    typeof data.seconds !== "number" || !Number.isSafeInteger(data.seconds) ||
    data.seconds < -62135596800 || data.seconds > 253402300799 ||
    typeof data.nanoseconds !== "number" || !Number.isInteger(data.nanoseconds) ||
    data.nanoseconds < 0 || data.nanoseconds >= 1e9 ||
    typeof data.documentId !== "string" || !ID.test(data.documentId)) throw invalid();
}

function validateKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error("Cursor key must have 32+ bytes.");
}

function invalid(): BookingCandidateError {
  return new BookingCandidateError("invalid-argument", "invalid-candidate-pagination");
}

function reconcile(reason: string): never {
  throw new BookingCandidateError("failed-precondition", reason);
}
