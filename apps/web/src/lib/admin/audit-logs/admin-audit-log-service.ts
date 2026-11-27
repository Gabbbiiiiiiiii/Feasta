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
  classifyAuditCategory,
  isMeaningfulAuditLog,
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
import {computeTotalPages} from "@/lib/pagination";

const ADMIN_LOGS_COLLECTION = "adminLogs";
const USERS_COLLECTION = "users";
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
  const queryLimit = SEARCH_SCAN_LIMIT + 1;

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

  const reachedLimit = pageSnapshot.docs.length > SEARCH_SCAN_LIMIT;
  const scannedDocuments = pageSnapshot.docs
    .slice(0, SEARCH_SCAN_LIMIT)
    .map(normalizeDocument);
  const matchingDocuments = scannedDocuments.filter(
    ({normalized}) =>
      isMeaningfulAuditLog(normalized.auditLog) &&
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

  const summaryRecords = summarySnapshot.docs
    .map(normalizeDocument)
    .filter(({normalized}) => isMeaningfulAuditLog(normalized.auditLog));
  const hydratedAuditLogs = await hydrateActorNames(
    visibleDocuments.map(({normalized}) => normalized.auditLog),
  );
  const totalCount =
    !cursor && !reachedLimit
      ? matchingDocuments.length
      : null;

  return {
    auditLogs: hydratedAuditLogs,
    summary: createSummary(summaryRecords),
    filterOptions: createFilterOptions(summaryRecords),
    nextCursor,
    hasMore: nextCursor !== null,
    totalCount,
    totalPages: computeTotalPages(totalCount, filters.pageSize),
    scan: {
      scannedCount: Math.min(pageSnapshot.docs.length, SEARCH_SCAN_LIMIT),
      scanLimit: SEARCH_SCAN_LIMIT,
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
  const detail = normalizeAdminAuditLogRecord(
    snapshot.id,
    snapshot.data() ?? {},
  ).detail;
  const [hydrated] = await hydrateActorNames([detail]);
  return {
    ...detail,
    actorName: hydrated?.actorName ?? null,
  };
}

async function hydrateActorNames<T extends AdminAuditLog>(
  auditLogs: T[],
): Promise<T[]> {
  if (auditLogs.length === 0) return [];

  const lookupIds = [
    ...new Set(
      auditLogs
        .filter((log) => {
          const role = log.actorRole.toLocaleLowerCase("en-PH");
          return (
            role !== "system" &&
            log.actorId !== "system" &&
            log.actorId !== "Not recorded" &&
            SAFE_DOCUMENT_ID.test(log.actorId)
          );
        })
        .map((log) => log.actorId),
    ),
  ];

  const userSnapshots =
    lookupIds.length > 0
      ? await adminDb.getAll(
          ...lookupIds.map((userId) =>
            adminDb.collection(USERS_COLLECTION).doc(userId),
          ),
        )
      : [];

  const namesById = new Map<string, string>(
    userSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => [snapshot.id, formatUserActorName(snapshot.data() ?? {})])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  return auditLogs.map((log) => {
    const role = log.actorRole.toLocaleLowerCase("en-PH");
    if (role === "system" || log.actorId === "system") {
      return {...log, actorName: "FEASTA System"};
    }
    return {
      ...log,
      actorName: namesById.get(log.actorId) ?? null,
    };
  });
}

function formatUserActorName(data: DocumentData): string {
  const first = typeof data.firstName === "string" ? data.firstName.trim() : "";
  const last = typeof data.lastName === "string" ? data.lastName.trim() : "";
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;
  if (typeof data.displayName === "string" && data.displayName.trim()) {
    return data.displayName.trim();
  }
  if (typeof data.email === "string" && data.email.trim()) {
    return data.email.trim();
  }
  return "";
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
      filters.category !== "all" ||
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

  let adminActionCount = 0;
  let providerActionCount = 0;
  let customerActionCount = 0;
  let systemActionCount = 0;
  const categoryCounts = {
    admin: 0,
    money: 0,
    bookings: 0,
    security: 0,
  };

  for (const {normalized} of records) {
    const role = normalized.auditLog.actorRole.toLocaleLowerCase("en-PH");
    if (role === "admin") adminActionCount += 1;
    else if (role === "provider") providerActionCount += 1;
    else if (role === "customer" || role === "user") customerActionCount += 1;
    else if (role === "system") systemActionCount += 1;

    const category =
      normalized.auditLog.category ??
      classifyAuditCategory({
        action: normalized.auditLog.action,
        actorRole: normalized.auditLog.actorRole,
        targetCollection: normalized.auditLog.targetCollection,
      });
    categoryCounts[category] += 1;
  }

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
    adminActionCount,
    userActionCount: providerActionCount + customerActionCount,
    providerActionCount,
    customerActionCount,
    systemActionCount,
    categoryCounts,
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
