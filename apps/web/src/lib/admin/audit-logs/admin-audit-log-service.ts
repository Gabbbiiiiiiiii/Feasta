import "server-only";

import {
  FieldPath,
  Timestamp,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  adminAuditLogMatchesFilters,
  normalizeAdminAuditLogFilters,
  normalizeAdminAuditLogRecord,
  timestampMilliseconds,
  type NormalizedAdminAuditLogRecord,
} from "@/lib/admin/audit-logs/admin-audit-log-normalization";
import type {
  AdminAuditLog,
  AdminAuditLogDetail,
  AdminAuditLogFilterOptions,
  AdminAuditLogFilters,
  AdminAuditLogPage,
  AdminAuditLogSummary,
} from "@/lib/admin/audit-logs/admin-audit-log-types";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const ADMIN_LOGS_COLLECTION = "adminLogs";
const SEARCH_SCAN_LIMIT = 250;
const SUMMARY_WINDOW_LIMIT = 100;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,150}$/u;

type AuditLogCursor = {
  createdAtMilliseconds: number;
  documentId: string;
};

type AuditLogDocument = {
  document: QueryDocumentSnapshot<DocumentData>;
  normalized: NormalizedAdminAuditLogRecord;
};

export async function getAdminAuditLogPage(
  input: AdminAuditLogFilters,
): Promise<AdminAuditLogPage> {
  await requireAdmin();

  const filters = normalizeAdminAuditLogFilters(input);
  const filtered = hasActiveFilters(filters);
  const queryLimit = filtered ? SEARCH_SCAN_LIMIT + 1 : filters.pageSize + 1;

  let query: Query<DocumentData> = adminDb
    .collection(ADMIN_LOGS_COLLECTION)
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  const cursor = decodeCursor(filters.cursor);
  if (cursor) {
    query = query.startAfter(
      Timestamp.fromMillis(cursor.createdAtMilliseconds),
      cursor.documentId,
    );
  }

  const [pageSnapshot, summarySnapshot] = await Promise.all([
    query.limit(queryLimit).get(),
    adminDb
      .collection(ADMIN_LOGS_COLLECTION)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(SUMMARY_WINDOW_LIMIT)
      .get(),
  ]);

  const reachedLimit =
    filtered && pageSnapshot.docs.length > SEARCH_SCAN_LIMIT;
  const scannedDocuments = pageSnapshot.docs
    .slice(0, filtered ? SEARCH_SCAN_LIMIT : filters.pageSize + 1)
    .map(normalizeDocument);
  const matchingDocuments = scannedDocuments.filter(({normalized}) =>
    adminAuditLogMatchesFilters(normalized, filters),
  );
  const visibleDocuments = matchingDocuments.slice(0, filters.pageSize);

  const cursorDocument =
    matchingDocuments.length > filters.pageSize
      ? visibleDocuments.at(-1) ?? null
      : reachedLimit
        ? scannedDocuments.at(-1) ?? null
        : null;
  const nextCursor = cursorDocument
    ? encodeCursor(cursorDocument.document)
    : null;

  const summaryRecords = summarySnapshot.docs.map(normalizeDocument);

  return {
    auditLogs: visibleDocuments.map(({normalized}) => normalized.auditLog),
    summary: createSummary(summaryRecords),
    filterOptions: createFilterOptions(summaryRecords),
    nextCursor,
    hasMore: nextCursor !== null,
    scan: {
      scannedCount: Math.min(
        pageSnapshot.docs.length,
        filtered ? SEARCH_SCAN_LIMIT : filters.pageSize + 1,
      ),
      scanLimit: filtered ? SEARCH_SCAN_LIMIT : filters.pageSize + 1,
      filtered,
      reachedLimit,
    },
  };
}

export async function getAdminAuditLogDetail(
  auditLogId: string,
): Promise<AdminAuditLogDetail | null> {
  await requireAdmin();

  if (!SAFE_DOCUMENT_ID.test(auditLogId)) return null;

  const snapshot = await adminDb
    .collection(ADMIN_LOGS_COLLECTION)
    .doc(auditLogId)
    .get();

  if (!snapshot.exists) return null;
  return normalizeAdminAuditLogRecord(
    snapshot.id,
    snapshot.data() ?? {},
  ).detail;
}

function normalizeDocument(
  document: QueryDocumentSnapshot<DocumentData>,
): AuditLogDocument {
  return {
    document,
    normalized: normalizeAdminAuditLogRecord(document.id, document.data()),
  };
}

function hasActiveFilters(
  filters: ReturnType<typeof normalizeAdminAuditLogFilters>,
): boolean {
  return Boolean(
    filters.search ||
      filters.action !== "all" ||
      filters.actorRole !== "all" ||
      filters.source !== "all" ||
      filters.targetCollection !== "all" ||
      filters.fromDate ||
      filters.toDate,
  );
}

function createSummary(records: AuditLogDocument[]): AdminAuditLogSummary {
  const outcomes = records.map(({normalized}) =>
    normalized.auditLog.outcome?.toLocaleLowerCase("en-PH") ?? null,
  );
  const succeeded = new Set([
    "success",
    "succeeded",
    "successful",
    "completed",
  ]);
  const attention = new Set([
    "denied",
    "failed",
    "failure",
    "error",
    "rejected",
  ]);

  return {
    windowLimit: SUMMARY_WINDOW_LIMIT,
    windowCount: records.length,
    adminActorCount: new Set(
      records
        .filter(
          ({normalized}) =>
            normalized.auditLog.actorRole.toLocaleLowerCase("en-PH") ===
            "admin",
        )
        .map(({normalized}) => normalized.auditLog.actorId)
        .filter((actorId) => actorId !== "Not recorded"),
    ).size,
    succeededOutcomeCount: outcomes.filter(
      (outcome) => outcome !== null && succeeded.has(outcome),
    ).length,
    attentionOutcomeCount: outcomes.filter(
      (outcome) => outcome !== null && attention.has(outcome),
    ).length,
  };
}

function createFilterOptions(
  records: AuditLogDocument[],
): AdminAuditLogFilterOptions {
  const auditLogs = records.map(({normalized}) => normalized.auditLog);
  return {
    actions: distinctRecordedValues(auditLogs, "action"),
    actorRoles: distinctRecordedValues(auditLogs, "actorRole"),
    sources: distinctRecordedValues(auditLogs, "source"),
    targetCollections: distinctRecordedValues(
      auditLogs,
      "targetCollection",
    ),
  };
}

function distinctRecordedValues(
  auditLogs: AdminAuditLog[],
  key: "action" | "actorRole" | "source" | "targetCollection",
): string[] {
  return [...new Set(auditLogs.map((auditLog) => auditLog[key]))]
    .filter(
      (value) => value !== "Not recorded" && value !== "unknown_action",
    )
    .sort((left, right) => left.localeCompare(right, "en-PH"))
    .slice(0, 50);
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
): string | null {
  const createdAtMilliseconds = timestampMilliseconds(
    document.data().createdAt,
  );
  if (createdAtMilliseconds === null) return null;

  const cursor: AuditLogCursor = {
    createdAtMilliseconds,
    documentId: document.id,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | null): AuditLogCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<AuditLogCursor>;
    if (
      typeof parsed.createdAtMilliseconds !== "number" ||
      !Number.isFinite(parsed.createdAtMilliseconds) ||
      typeof parsed.documentId !== "string" ||
      !SAFE_DOCUMENT_ID.test(parsed.documentId)
    ) {
      return null;
    }
    return parsed as AuditLogCursor;
  } catch {
    return null;
  }
}
