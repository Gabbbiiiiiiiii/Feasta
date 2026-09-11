import type {
  AdminAuditLog,
  AdminAuditLogDetail,
  AdminAuditLogFilters,
  AdminAuditLogPreviewField,
} from "@/lib/admin/audit-logs/admin-audit-log-types";

const NOT_RECORDED = "Not recorded";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 30;
const MAX_SEARCH_LENGTH = 120;
const MAX_FILTER_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 180;
const MAX_DETAIL_TEXT_LENGTH = 500;
const MAX_PREVIEW_FIELDS = 12;
const MAX_PREVIEW_VALUE_LENGTH = 160;

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const sensitiveTerms = [
  "password",
  "passcode",
  "secret",
  "token",
  "credential",
  "authorization",
  "cookie",
  "note",
  "reason",
  "private_note",
  "privatenote",
  "admin_note",
  "adminnote",
  "card",
  "cvv",
  "cvc",
  "bank",
  "account_number",
  "accountnumber",
  "access_key",
  "accesskey",
  "refresh_key",
  "refreshkey",
  "session",
] as const;

export type NormalizedAdminAuditLogFilters = AdminAuditLogFilters & {
  fromMilliseconds: number | null;
  toMilliseconds: number | null;
};

export type NormalizedAdminAuditLogRecord = {
  auditLog: AdminAuditLog;
  detail: AdminAuditLogDetail;
  createdAtMilliseconds: number | null;
};

export function normalizeAdminAuditLogFilters(
  input: AdminAuditLogFilters,
): NormalizedAdminAuditLogFilters {
  const fromDate = normalizeDateInput(input.fromDate);
  const toDate = normalizeDateInput(input.toDate);
  const fromMilliseconds = fromDate
    ? Date.parse(`${fromDate}T00:00:00.000+08:00`)
    : null;
  const toMilliseconds = toDate
    ? Date.parse(`${toDate}T23:59:59.999+08:00`)
    : null;

  if (
    fromMilliseconds !== null &&
    toMilliseconds !== null &&
    fromMilliseconds > toMilliseconds
  ) {
    throw new Error("The start date cannot be after the end date.");
  }

  return {
    search: boundedText(input.search, MAX_SEARCH_LENGTH),
    action: normalizeFilter(input.action),
    actorRole: normalizeFilter(input.actorRole),
    source: normalizeFilter(input.source),
    targetCollection: normalizeFilter(input.targetCollection),
    fromDate,
    toDate,
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Number.isSafeInteger(input.pageSize)
          ? input.pageSize
          : DEFAULT_PAGE_SIZE,
      ),
    ),
    cursor:
      typeof input.cursor === "string" && input.cursor.length <= 500
        ? input.cursor || null
        : null,
    fromMilliseconds,
    toMilliseconds,
  };
}

export function normalizeAdminAuditLogRecord(
  id: string,
  data: Record<string, unknown>,
): NormalizedAdminAuditLogRecord {
  const createdAtMilliseconds = timestampMilliseconds(data.createdAt);
  const action = recordedText(data.action, "unknown_action");
  const actorId = recordedText(data.actorId, NOT_RECORDED);
  const actorRole = recordedText(data.actorRole, NOT_RECORDED);
  const targetCollection = recordedText(
    data.targetCollection,
    recordedText(data.entity, NOT_RECORDED),
  );
  const targetId = recordedText(
    data.targetId,
    recordedText(data.entityId, NOT_RECORDED),
  );
  const source = recordedText(data.source, NOT_RECORDED);
  const correlationId = nullableBoundedText(data.correlationId, 150);
  const outcome = nullableBoundedText(data.outcome, 80);
  const reasonCode = nullableBoundedText(data.reasonCode, 120);
  const description = nullableBoundedText(
    data.description,
    MAX_DETAIL_TEXT_LENGTH,
  );

  const auditLog: AdminAuditLog = {
    id: boundedText(id, 150) || "unknown",
    createdAt:
      createdAtMilliseconds === null
        ? null
        : new Date(createdAtMilliseconds).toISOString(),
    action,
    actorId,
    actorRole,
    targetCollection,
    targetId,
    source,
    correlationId,
    outcome,
    reasonCode,
    summary: createSummary({
      description,
      outcome,
      reasonCode,
      before: data.before,
      after: data.after,
    }),
  };

  return {
    auditLog,
    createdAtMilliseconds,
    detail: {
      ...auditLog,
      description,
      beforePreview: previewRecord(data.before),
      afterPreview: previewRecord(data.after),
      metadataPreview: previewRecord(data.metadata ?? data.details),
    },
  };
}

export function adminAuditLogMatchesFilters(
  record: NormalizedAdminAuditLogRecord,
  filters: NormalizedAdminAuditLogFilters,
): boolean {
  const auditLog = record.auditLog;

  if (filters.action !== "all" && auditLog.action !== filters.action) {
    return false;
  }
  if (
    filters.actorRole !== "all" &&
    auditLog.actorRole !== filters.actorRole
  ) {
    return false;
  }
  if (filters.source !== "all" && auditLog.source !== filters.source) {
    return false;
  }
  if (
    filters.targetCollection !== "all" &&
    auditLog.targetCollection !== filters.targetCollection
  ) {
    return false;
  }
  if (
    filters.fromMilliseconds !== null &&
    (record.createdAtMilliseconds === null ||
      record.createdAtMilliseconds < filters.fromMilliseconds)
  ) {
    return false;
  }
  if (
    filters.toMilliseconds !== null &&
    (record.createdAtMilliseconds === null ||
      record.createdAtMilliseconds > filters.toMilliseconds)
  ) {
    return false;
  }

  if (!filters.search) return true;

  const query = filters.search.toLocaleLowerCase("en-PH");
  return [
    auditLog.actorId,
    auditLog.targetId,
    auditLog.correlationId,
    auditLog.action,
  ].some(
    (value) =>
      value !== null &&
      value !== NOT_RECORDED &&
      value.toLocaleLowerCase("en-PH").includes(query),
  );
}

export function timestampMilliseconds(value: unknown): number | null {
  if (value instanceof Date) return finiteMilliseconds(value.getTime());
  if (typeof value === "string" || typeof value === "number") {
    return finiteMilliseconds(
      typeof value === "number" ? value : Date.parse(value),
    );
  }
  if (!isRecord(value)) return null;

  if (typeof value.toMillis === "function") {
    try {
      return finiteMilliseconds(
        (value.toMillis as () => number).call(value),
      );
    } catch {
      return null;
    }
  }

  if (typeof value.toDate === "function") {
    try {
      const date = (value.toDate as () => unknown).call(value);
      return date instanceof Date
        ? finiteMilliseconds(date.getTime())
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

function createSummary({
  description,
  outcome,
  reasonCode,
  before,
  after,
}: {
  description: string | null;
  outcome: string | null;
  reasonCode: string | null;
  before: unknown;
  after: unknown;
}): string {
  if (description) return boundedText(description, MAX_SUMMARY_LENGTH);

  const changedFields = changedSafeFields(before, after);
  if (changedFields.length > 0) {
    return `Changed: ${changedFields.join(", ")}`;
  }
  if (outcome) return `Outcome: ${humanize(outcome)}`;
  if (reasonCode) return `Reason code: ${humanize(reasonCode)}`;
  return "Recorded audit event";
}

function changedSafeFields(before: unknown, after: unknown): string[] {
  if (!isRecord(before) || !isRecord(after)) return [];

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const safeKeys = keys
    .filter((key) => !isSensitiveKey(key))
    .filter((key) => before[key] !== after[key])
    .slice(0, 6)
    .map((key) => humanize(boundedText(key, 60)));

  if (keys.length > safeKeys.length && safeKeys.length === 6) {
    safeKeys.push("Additional Fields");
  }
  return safeKeys;
}

function previewRecord(value: unknown): AdminAuditLogPreviewField[] {
  if (!isRecord(value)) return [];

  return Object.entries(value)
    .slice(0, MAX_PREVIEW_FIELDS)
    .map(([rawKey, rawValue]) => {
      const key = boundedText(rawKey, 80) || "Unnamed field";
      const redacted = isSensitiveKey(key);
      return {
        key,
        redacted,
        value: redacted ? "Redacted" : previewValue(rawValue),
      };
    });
}

function previewValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    return boundedText(value, MAX_PREVIEW_VALUE_LENGTH) || "Empty string";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "Invalid number";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  const milliseconds = timestampMilliseconds(value);
  if (milliseconds !== null) return new Date(milliseconds).toISOString();
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (isRecord(value)) return "Nested object";
  return "Unsupported value";
}

function normalizeFilter(value: unknown): string {
  if (value === "all") return "all";
  return boundedText(value, MAX_FILTER_LENGTH) || "all";
}

function normalizeDateInput(value: unknown): string {
  if (typeof value !== "string" || !datePattern.test(value)) return "";
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString().slice(0, 10) === value
    ? value
    : "";
}

function recordedText(value: unknown, fallback: string): string {
  return nullableBoundedText(value, MAX_FILTER_LENGTH) ?? fallback;
}

function nullableBoundedText(
  value: unknown,
  maximumLength: number,
): string | null {
  const normalized = boundedText(value, maximumLength);
  return normalized || null;
}

function boundedText(value: unknown, maximumLength: number): string {
  return typeof value === "string"
    ? value
        .replace(/[\p{Cc}]/gu, " ")
        .trim()
        .slice(0, maximumLength)
    : "";
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function isSensitiveKey(value: string): boolean {
  const normalized = value
    .toLocaleLowerCase("en-PH")
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
  return sensitiveTerms.some((term) => normalized.includes(term));
}

function finiteMilliseconds(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
