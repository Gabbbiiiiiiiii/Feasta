import {createHmac, timingSafeEqual} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";

export interface PublicOccasionV2 {
  id: string;
  label: string;
  applicableServiceCategoryCodes: string[];
  sortOrder: number;
  revision: number;
}

export interface ListApprovedOccasionsInput {
  serviceCategoryCode: string | null;
  cursor: string | null;
  pageSize: number;
}

export interface OccasionCursorPosition {sortOrder: number; id: string}
const ID = /^[a-z][a-z0-9_]{1,63}$/u;
const CATEGORY = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

function invalidCursor(): HttpsError {
  return new HttpsError("invalid-argument", "Invalid occasion cursor.",
    {reason: "INVALID_CURSOR"});
}
function invalidInput(): HttpsError {
  return new HttpsError("invalid-argument", "Invalid occasion catalog request.",
    {reason: "UNKNOWN_FIELD"});
}
function reconciliation(): HttpsError {
  return new HttpsError("failed-precondition", "Occasion catalog requires reconciliation.",
    {reason: "CONFIG_UNAVAILABLE"});
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ?
    value as Record<string, unknown> : null;
}

export function parseListApprovedOccasionsInput(value: unknown): ListApprovedOccasionsInput {
  const data = record(value);
  if (!data || Object.keys(data).some((key) =>
    !["serviceCategoryCode", "cursor", "pageSize"].includes(key))) throw invalidInput();
  const serviceCategoryCode = data.serviceCategoryCode === undefined ?
    null : data.serviceCategoryCode;
  if (serviceCategoryCode !== null && (typeof serviceCategoryCode !== "string" ||
    serviceCategoryCode.length < 2 || serviceCategoryCode.length > 100 ||
    !CATEGORY.test(serviceCategoryCode))) {
    throw new HttpsError("invalid-argument", "Invalid service category.",
      {reason: "INVALID_SERVICE_CATEGORY"});
  }
  const cursor = data.cursor === undefined ? null : data.cursor;
  if (cursor !== null && (typeof cursor !== "string" || cursor.length < 3 ||
    cursor.length > 4096)) throw invalidCursor();
  const pageSize = data.pageSize === undefined ? 50 : data.pageSize;
  if (typeof pageSize !== "number" || !Number.isSafeInteger(pageSize) ||
    pageSize < 1 || pageSize > 50) throw invalidInput();
  return {serviceCategoryCode: serviceCategoryCode as string | null,
    cursor: cursor as string | null, pageSize};
}

export function projectPublicOccasionV2(id: string, value: unknown): PublicOccasionV2 {
  const data = record(value);
  if (!data || !ID.test(id) || data.id !== id || data.active !== true ||
    data.moderationState !== "approved" || typeof data.label !== "string" ||
    [...data.label].length < 2 || [...data.label].length > 80 ||
    !Number.isSafeInteger(data.sortOrder) || !Number.isSafeInteger(data.revision) ||
    (data.revision as number) < 1 || !Array.isArray(data.applicableServiceCategoryCodes) ||
    data.applicableServiceCategoryCodes.length < 1 ||
    data.applicableServiceCategoryCodes.length > 50 ||
    data.applicableServiceCategoryCodes.some((code: unknown) =>
      typeof code !== "string" || !CATEGORY.test(code))) throw reconciliation();
  return {id, label: data.label,
    applicableServiceCategoryCodes: [...data.applicableServiceCategoryCodes] as string[],
    sortOrder: data.sortOrder as number, revision: data.revision as number};
}

/** Bounded candidate consumption: filter applicability after the canonical catalog query. */
export const OCCASION_CATALOG_CANDIDATE_BUDGET = 200;
export type OccasionCatalogCandidate = {id: string; data: unknown};

export function consumeOccasionCatalogCandidates(
  candidates: readonly OccasionCatalogCandidate[], input: ListApprovedOccasionsInput,
): {items: PublicOccasionV2[]; nextPosition: OccasionCursorPosition | null} {
  if (!Array.isArray(candidates) ||
    candidates.length > OCCASION_CATALOG_CANDIDATE_BUDGET + 1 ||
    !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 50) {
    throw reconciliation();
  }
  const items: PublicOccasionV2[] = [];
  let consumed = 0;
  let last: OccasionCursorPosition | null = null;
  for (const candidate of candidates.slice(0, OCCASION_CATALOG_CANDIDATE_BUDGET)) {
    const item = projectPublicOccasionV2(candidate.id, candidate.data);
    if (last && (item.sortOrder < last.sortOrder ||
      (item.sortOrder === last.sortOrder && item.id <= last.id))) throw reconciliation();
    last = {sortOrder: item.sortOrder, id: item.id};
    consumed++;
    if (!input.serviceCategoryCode ||
      item.applicableServiceCategoryCodes.includes(input.serviceCategoryCode)) {
      items.push(item);
    }
    if (items.length === input.pageSize) break;
  }
  // The position is the last *consumed* candidate, not the last matching item.
  // Sparse filters can yield an empty page with a continuation cursor.
  if (consumed < candidates.length && !last) throw reconciliation();
  return {items, nextPosition: consumed < candidates.length ? last : null};
}

function validatePosition(value: unknown): asserts value is OccasionCursorPosition {
  const data = record(value);
  if (!data || Object.keys(data).sort().join() !== "id,sortOrder" ||
    !Number.isSafeInteger(data.sortOrder) ||
    typeof data.id !== "string" || !ID.test(data.id)) throw invalidCursor();
}
function validateKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length < 32) throw reconciliation();
}
function binding(revision: number, request: ListApprovedOccasionsInput) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw reconciliation();
  return {revision, serviceCategoryCode: request.serviceCategoryCode,
    pageSize: request.pageSize, order: "sort_order_id_asc_v1"};
}

export function encodeOccasionCursor(
  revision: number, request: ListApprovedOccasionsInput,
  position: OccasionCursorPosition, key: Buffer,
): string {
  validateKey(key);
  validatePosition(position);
  const token = Buffer.from(JSON.stringify({v: 1, binding: binding(revision, request),
    position}), "utf8").toString("base64url");
  const mac = createHmac("sha256", key).update(token).digest("base64url");
  return `${token}.${mac}`;
}

export function decodeOccasionCursor(
  revision: number, request: ListApprovedOccasionsInput, key: Buffer,
): OccasionCursorPosition | null {
  if (!request.cursor) return null;
  validateKey(key);
  try {
    const parts = request.cursor.split(".");
    if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))) {
      throw invalidCursor();
    }
    const [body, signature] = parts as [string, string];
    const actual = Buffer.from(signature, "base64url");
    const expected = createHmac("sha256", key).update(body).digest();
    if (actual.length !== expected.length || actual.toString("base64url") !== signature ||
      !timingSafeEqual(actual, expected)) throw invalidCursor();
    const bytes = Buffer.from(body, "base64url");
    if (bytes.toString("base64url") !== body) throw invalidCursor();
    const data = record(JSON.parse(bytes.toString("utf8")));
    if (!data || Object.keys(data).sort().join() !== "binding,position,v" ||
      data.v !== 1) throw invalidCursor();
    const actualBinding = record(data.binding);
    const expectedBinding = binding(revision, request);
    if (!actualBinding || Object.keys(actualBinding).length !== 4 ||
      actualBinding.serviceCategoryCode !== expectedBinding.serviceCategoryCode ||
      actualBinding.pageSize !== expectedBinding.pageSize ||
      actualBinding.order !== expectedBinding.order ||
      !Number.isSafeInteger(actualBinding.revision)) throw invalidCursor();
    if (actualBinding.revision !== revision) {
      throw new HttpsError("aborted", "Occasion catalog revision changed.",
        {reason: "REVISION_CONFLICT"});
    }
    validatePosition(data.position);
    return data.position;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw invalidCursor();
  }
}
