import {createHmac, timingSafeEqual} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";
import {MAIN_EVENT_STATUSES} from "../shared/constants.js";
import {candidatePosition, decodeCandidateCursor, encodeCandidateCursor,
  type BookingCandidate, type CandidatePosition} from "./customer-booking-candidate-pagination.js";

export const SEARCH_STATUS_GROUPS = {
  all: null,
  draft: ["draft"],
  awaiting_provider: ["pending_provider_approval", "needs_provider_replacement"],
  awaiting_payment: ["waiting_for_down_payment"],
  confirmed: ["confirmed"],
  in_progress: ["in_progress"],
  completed: ["completed"],
  cancelled_or_expired: ["cancelled", "expired"],
} as const;
export type SearchStatus = keyof typeof SEARCH_STATUS_GROUPS;
export type SearchInput = {
  search: {mode: "none" | "code_prefix" | "booking_id"; value: string};
  status: SearchStatus;
  pageSize: number;
  cursor: string | null;
  section: "history" | "undated_drafts";
};
export type SearchPosition = CandidatePosition | {documentId: string; code?: string};
export type CustomerBookingSearchRow = {
  id: string; bookingId: string; bookingCode: string | null; status: string;
  eventType: string | null; eventDate: string | null; eventTime: string | null;
  eventEndTime: string | null; guestCount: number | null; eventLocation: string | null;
  providerName: string | null; packageName: string | null;
  createdAt: string | null; updatedAt: string | null;
};
const ID = /^[A-Za-z0-9_-]{1,160}$/u;
const CODE = /^BK-[0-9A-F]{1,32}$/u;

export function searchInvalid(): HttpsError {
  return new HttpsError("invalid-argument", "Invalid booking search request.");
}
export function searchReconciliation(): HttpsError {
  return new HttpsError("failed-precondition", "Booking search requires reconciliation.");
}
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some(key => !fields.includes(key))) throw searchInvalid();
  return value as Record<string, unknown>;
}
export function parseBookingSearch(value: unknown): SearchInput {
  const data = record(value, ["search", "status", "pageSize", "cursor", "section"]);
  const search = record(data.search, ["mode", "value"]);
  if (typeof search.mode !== "string" ||
    !["none", "code_prefix", "booking_id"].includes(search.mode) ||
    typeof search.value !== "string" || search.value.length > 160) throw searchInvalid();
  const mode = search.mode as SearchInput["search"]["mode"];
  const normalized = mode === "code_prefix" ? search.value.trim().toUpperCase() :
    mode === "booking_id" ? search.value.trim() : search.value;
  // Only the audited canonical ASCII corpus is supported; no Unicode case folding.
  if ((mode === "none" && normalized !== "") ||
    (mode === "booking_id" && !ID.test(normalized)) ||
    (mode === "code_prefix" && !/^(?:B|BK|BK-|BK-[0-9A-F]{1,32})$/u.test(normalized))) {
    throw searchInvalid();
  }
  const status = data.status === undefined ? "all" : data.status;
  const pageSize = data.pageSize === undefined ? 10 : data.pageSize;
  const cursor = data.cursor === undefined ? null : data.cursor;
  const section = data.section === undefined ? "history" : data.section;
  if (typeof status !== "string" || !Object.hasOwn(SEARCH_STATUS_GROUPS, status) ||
    typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 30 ||
    (cursor !== null && (typeof cursor !== "string" || !cursor.length || cursor.length > 4096)) ||
    (section !== "history" && section !== "undated_drafts") ||
    (section === "undated_drafts" && (mode !== "none" || !["all", "draft"].includes(status))) ||
    (mode === "booking_id" && cursor !== null)) throw searchInvalid();
  return {search: {mode, value: normalized}, status: status as SearchStatus, pageSize,
    cursor: cursor as string | null, section};
}

function historyBinding(uid: string, input: SearchInput) {
  return {customerId: uid, status: input.status, pageSize: input.pageSize,
    section: "history" as const, searchMode: "none" as const, searchValue: "" as const,
    order: "created_at_desc_v1" as const};
}
function binding(uid: string, input: SearchInput) {
  return {customerId: uid, status: input.status, pageSize: input.pageSize,
    section: input.section, searchMode: input.search.mode, searchValue: input.search.value,
    order: input.section === "undated_drafts" ? "draft_id_desc_v1" : "raw_code_asc_v1"};
}
function chronological(input: SearchInput) {
  return input.search.mode === "none" && input.section === "history";
}
function validateOtherPosition(value: unknown, input: SearchInput): SearchPosition {
  const fields = input.section === "undated_drafts" ? ["documentId"] : ["documentId", "code"];
  const data = record(value, fields);
  if (Object.keys(data).length !== fields.length || typeof data.documentId !== "string" ||
    !ID.test(data.documentId) || (fields.length === 2 && (typeof data.code !== "string" ||
    !CODE.test(data.code) || !data.code.startsWith(input.search.value)))) throw searchInvalid();
  return data as SearchPosition;
}
export function encodeSearchCursor(uid: string, input: SearchInput,
  position: SearchPosition, key: Buffer): string {
  parseBookingSearch(input);
  if (!Buffer.isBuffer(key) || key.length < 32) throw searchReconciliation();
  if (chronological(input)) {
    return encodeCandidateCursor(historyBinding(uid, input), position as CandidatePosition, key);
  }
  validateOtherPosition(position, input);
  const payload = Buffer.from(JSON.stringify({v: 1, binding: binding(uid, input), position}))
    .toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}
export function decodeSearchCursor(uid: string, input: SearchInput,
  key: Buffer): SearchPosition | null {
  parseBookingSearch(input);
  if (!input.cursor) return null;
  if (!Buffer.isBuffer(key) || key.length < 32) throw searchReconciliation();
  if (chronological(input)) {
    return decodeCandidateCursor(input.cursor, historyBinding(uid, input), key);
  }
  // Step 166-A HMAC envelope extended with distinct binding and position schemas.
  try {
    const parts = input.cursor.split(".");
    if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/u.test(part))) {
      throw searchInvalid();
    }
    const [payload, signature] = parts;
    const mac = Buffer.from(signature, "base64url");
    const expected = createHmac("sha256", key).update(payload).digest();
    if (mac.length !== expected.length || mac.toString("base64url") !== signature ||
      !timingSafeEqual(mac, expected)) throw searchInvalid();
    const bytes = Buffer.from(payload, "base64url");
    if (bytes.toString("base64url") !== payload) throw searchInvalid();
    const data = record(JSON.parse(bytes.toString("utf8")), ["v", "binding", "position"]);
    const expectedBinding = binding(uid, input);
    const actual = record(data.binding, Object.keys(expectedBinding));
    if (Object.keys(data).length !== 3 || data.v !== 1 ||
      Object.keys(actual).length !== Object.keys(expectedBinding).length ||
      !Object.entries(expectedBinding).every(([field, entry]) => actual[field] === entry)) {
      throw searchInvalid();
    }
    return validateOtherPosition(data.position, input);
  } catch { throw searchInvalid(); }
}

export function bookingSearchPosition(candidate: BookingCandidate,
  input: SearchInput): SearchPosition {
  if (!ID.test(candidate.id)) throw searchReconciliation();
  if (input.section === "undated_drafts") return {documentId: candidate.id};
  if (input.search.mode !== "code_prefix") return candidatePosition(candidate);
  const code = candidate.data.bookingCode;
  if (typeof code !== "string" || !CODE.test(code) || !code.startsWith(input.search.value)) {
    throw searchReconciliation();
  }
  return {documentId: candidate.id, code};
}
export function validateSearchSource(candidate: BookingCandidate, uid: string): void {
  if (candidate.data.customerId !== uid || !ID.test(candidate.id) ||
    !(MAIN_EVENT_STATUSES as readonly unknown[]).includes(candidate.data.status) ||
    (candidate.data.isDeleted !== undefined && typeof candidate.data.isDeleted !== "boolean")) {
    throw searchReconciliation();
  }
  if (candidate.data.createdAt === undefined) {
    if (candidate.data.status !== "draft") throw searchReconciliation();
  } else candidatePosition(candidate);
}
function text(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > max) throw searchReconciliation();
  return value;
}
function date(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) {
    return value;
  }
  const p = candidatePosition({id: "date", data: {createdAt: value}});
  return new Date(p.seconds * 1000 + Math.floor(p.nanoseconds / 1e6)).toISOString();
}
/** List-only public DTO. No recursive copying, financial data, or relationship hydration. */
export function customerBookingSearchDto(candidate: BookingCandidate): CustomerBookingSearchRow {
  const d = candidate.data;
  if (d.guestCount != null && (typeof d.guestCount !== "number" ||
    !Number.isSafeInteger(d.guestCount) || d.guestCount < 0 || d.guestCount > 1000000)) {
    throw searchReconciliation();
  }
  return {id: candidate.id, bookingId: candidate.id, bookingCode: text(d.bookingCode, 40),
    status: d.status as string, eventType: text(d.eventType, 100), eventDate: date(d.eventDate),
    eventTime: text(d.eventTime, 40), eventEndTime: text(d.eventEndTime, 40),
    guestCount: typeof d.guestCount === "number" ? d.guestCount : null,
    eventLocation: text(d.eventLocation, 500),
    providerName: text(d.providerBusinessName, 200), packageName: text(d.packageName, 200),
    createdAt: date(d.createdAt), updatedAt: date(d.updatedAt)};
}
