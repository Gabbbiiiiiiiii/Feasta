import "server-only";

import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  assertAnnouncementEditable,
  assertAnnouncementTransition,
  isAnnouncementAudience,
  isAnnouncementStatus,
  validateAnnouncementDraftInput,
  validateAnnouncementId,
  validateArchiveInput,
  validatePublishInput,
} from "@/lib/admin/announcements/admin-announcement-validation";
import type {
  AdminAnnouncement,
  AdminAnnouncementFilters,
  AdminAnnouncementPage,
  AdminAnnouncementStatistics,
  CreateAnnouncementResult,
} from "@/lib/admin/announcements/admin-announcement-types";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const ANNOUNCEMENTS_COLLECTION = "announcements";
const ADMIN_LOGS_COLLECTION = "adminLogs";
const PRIVATE_COLLECTION = "private";
const PRIVATE_DOCUMENT = "admin";
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const SCAN_BATCH_SIZE = 30;
const MAX_FILTER_SCAN = 300;

type NormalizedFilters = Omit<AdminAnnouncementFilters, "cursor"> & {
  cursor: string | null;
};

type AnnouncementCursor = {
  updatedAt: number;
  documentId: string;
};

export async function getAdminAnnouncementPage(
  input: AdminAnnouncementFilters,
): Promise<AdminAnnouncementPage> {
  await requireAdmin();
  const filters = normalizeFilters(input);
  const statisticsPromise = getAnnouncementStatistics();
  const cursor = decodeCursor(filters.cursor);

  let baseQuery: Query<DocumentData> = adminDb
    .collection(ANNOUNCEMENTS_COLLECTION)
    .orderBy("updatedAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (cursor) {
    baseQuery = baseQuery.startAfter(
      Timestamp.fromMillis(cursor.updatedAt),
      cursor.documentId,
    );
  }

  const matching: Array<{
    document: QueryDocumentSnapshot<DocumentData>;
    announcement: AdminAnnouncement;
  }> = [];
  let scanned = 0;
  let exhausted = false;
  let scanQuery = baseQuery;
  let lastScanned: QueryDocumentSnapshot<DocumentData> | null = null;

  while (
    matching.length <= filters.pageSize &&
    scanned < MAX_FILTER_SCAN &&
    !exhausted
  ) {
    const snapshot = await scanQuery.limit(SCAN_BATCH_SIZE).get();
    if (snapshot.empty) {
      exhausted = true;
      break;
    }

    const notes = await loadPrivateNotes(snapshot.docs);
    for (const document of snapshot.docs) {
      scanned += 1;
      lastScanned = document;
      const announcement = mapAnnouncement(
        document,
        notes.get(document.id) ?? "",
      );
      if (matchesFilters(announcement, filters)) {
        matching.push({document, announcement});
        if (matching.length > filters.pageSize) break;
      }
      if (scanned >= MAX_FILTER_SCAN) break;
    }

    if (matching.length > filters.pageSize || scanned >= MAX_FILTER_SCAN) break;
    exhausted = snapshot.docs.length < SCAN_BATCH_SIZE;
    const finalDocument = snapshot.docs.at(-1);
    if (!exhausted && finalDocument) {
      scanQuery = baseQuery.startAfter(
        timestampValue(finalDocument.data().updatedAt) ?? Timestamp.fromMillis(0),
        finalDocument.id,
      );
    }
  }

  const visible = matching.slice(0, filters.pageSize);
  const hasMore = matching.length > filters.pageSize || !exhausted;
  const cursorDocument = matching.length > filters.pageSize
    ? visible.at(-1)?.document ?? null
    : lastScanned;

  return {
    announcements: visible.map(({announcement}) => announcement),
    statistics: await statisticsPromise,
    nextCursor: hasMore && cursorDocument ? encodeCursor(cursorDocument) : null,
    hasMore,
  };
}

export async function createAnnouncement(
  input: unknown,
): Promise<CreateAnnouncementResult> {
  const administrator = await requireAdmin();
  const draft = validateAnnouncementDraftInput(input);
  const announcementReference = adminDb
    .collection(ANNOUNCEMENTS_COLLECTION)
    .doc();
  const privateReference = announcementReference
    .collection(PRIVATE_COLLECTION)
    .doc(PRIVATE_DOCUMENT);
  const timestamp = FieldValue.serverTimestamp();
  const batch = adminDb.batch();

  batch.create(announcementReference, {
    title: draft.title,
    content: draft.content,
    audience: draft.audience,
    status: "draft",
    isDeleted: false,
    createdAt: timestamp,
    createdBy: administrator.uid,
    updatedAt: timestamp,
    updatedBy: administrator.uid,
    publishedAt: null,
    publishedBy: null,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  });
  batch.create(privateReference, {
    adminNotes: draft.adminNotes,
    updatedAt: timestamp,
    updatedBy: administrator.uid,
  });
  batch.create(adminDb.collection(ADMIN_LOGS_COLLECTION).doc(), {
    actorId: administrator.uid,
    actorRole: "admin",
    action: "announcement_created",
    description: `Created announcement draft: ${draft.title}.`,
    targetCollection: ANNOUNCEMENTS_COLLECTION,
    targetId: announcementReference.id,
    source: "admin_web",
    before: null,
    after: auditSnapshot({...draft, status: "draft"}),
    createdAt: timestamp,
  });

  await batch.commit();
  return {announcementId: announcementReference.id};
}

export async function updateAnnouncement(input: unknown): Promise<void> {
  const administrator = await requireAdmin();
  const record = inputRecord(input);
  const announcementId = validateAnnouncementId(record.announcementId);
  const draft = validateAnnouncementDraftInput(record);
  const announcementReference = adminDb
    .collection(ANNOUNCEMENTS_COLLECTION)
    .doc(announcementId);
  const privateReference = announcementReference
    .collection(PRIVATE_COLLECTION)
    .doc(PRIVATE_DOCUMENT);

  await adminDb.runTransaction(async (transaction) => {
    const [snapshot, privateSnapshot] = await Promise.all([
      transaction.get(announcementReference),
      transaction.get(privateReference),
    ]);
    if (!snapshot.exists) throw new Error("The announcement could not be found.");
    const current = snapshot.data() ?? {};
    const status = announcementStatus(current.status);
    assertAnnouncementEditable(status);
    const timestamp = FieldValue.serverTimestamp();

    transaction.update(announcementReference, {
      title: draft.title,
      content: draft.content,
      audience: draft.audience,
      updatedAt: timestamp,
      updatedBy: administrator.uid,
    });
    transaction.set(privateReference, {
      adminNotes: draft.adminNotes,
      updatedAt: timestamp,
      updatedBy: administrator.uid,
    }, {merge: true});
    transaction.create(adminDb.collection(ADMIN_LOGS_COLLECTION).doc(), {
      actorId: administrator.uid,
      actorRole: "admin",
      action: "announcement_updated",
      description: `Updated announcement draft: ${draft.title}.`,
      targetCollection: ANNOUNCEMENTS_COLLECTION,
      targetId: announcementId,
      source: "admin_web",
      before: auditSnapshot(current),
      after: auditSnapshot({...draft, status}),
      privateNotesChanged:
        stringValue(privateSnapshot.data()?.adminNotes) !== draft.adminNotes,
      createdAt: timestamp,
    });
  });
}

export async function publishAnnouncement(input: unknown): Promise<void> {
  const administrator = await requireAdmin();
  const {announcementId} = validatePublishInput(input);
  const announcementReference = adminDb
    .collection(ANNOUNCEMENTS_COLLECTION)
    .doc(announcementId);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(announcementReference);
    if (!snapshot.exists) throw new Error("The announcement could not be found.");
    const current = snapshot.data() ?? {};
    const status = announcementStatus(current.status);
    assertAnnouncementTransition(status, "published");
    validateAnnouncementDraftInput({
      title: current.title,
      content: current.content,
      audience: current.audience,
      adminNotes: "",
    });
    const timestamp = FieldValue.serverTimestamp();

    transaction.update(announcementReference, {
      status: "published",
      publishedAt: timestamp,
      publishedBy: administrator.uid,
      updatedAt: timestamp,
      updatedBy: administrator.uid,
    });
    transaction.create(adminDb.collection(ADMIN_LOGS_COLLECTION).doc(), {
      actorId: administrator.uid,
      actorRole: "admin",
      action: "announcement_published",
      description: `Published announcement: ${stringValue(current.title)}.`,
      targetCollection: ANNOUNCEMENTS_COLLECTION,
      targetId: announcementId,
      source: "admin_web",
      before: auditSnapshot(current),
      after: auditSnapshot({...current, status: "published"}),
      createdAt: timestamp,
    });
  });
}

export async function archiveAnnouncement(input: unknown): Promise<void> {
  const administrator = await requireAdmin();
  const {announcementId, reason} = validateArchiveInput(input);
  const announcementReference = adminDb
    .collection(ANNOUNCEMENTS_COLLECTION)
    .doc(announcementId);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(announcementReference);
    if (!snapshot.exists) throw new Error("The announcement could not be found.");
    const current = snapshot.data() ?? {};
    const status = announcementStatus(current.status);
    assertAnnouncementTransition(status, "archived");
    const timestamp = FieldValue.serverTimestamp();

    transaction.update(announcementReference, {
      status: "archived",
      archivedAt: timestamp,
      archivedBy: administrator.uid,
      archiveReason: reason,
      updatedAt: timestamp,
      updatedBy: administrator.uid,
    });
    transaction.create(adminDb.collection(ADMIN_LOGS_COLLECTION).doc(), {
      actorId: administrator.uid,
      actorRole: "admin",
      action: "announcement_archived",
      description: `Archived announcement: ${stringValue(current.title)}.`,
      reason,
      targetCollection: ANNOUNCEMENTS_COLLECTION,
      targetId: announcementId,
      source: "admin_web",
      before: auditSnapshot(current),
      after: auditSnapshot({...current, status: "archived", archiveReason: reason}),
      createdAt: timestamp,
    });
  });
}

async function getAnnouncementStatistics(): Promise<AdminAnnouncementStatistics> {
  const collection = adminDb.collection(ANNOUNCEMENTS_COLLECTION);
  const [total, drafts, published, archived] = await Promise.all([
    collection.count().get(),
    collection.where("status", "==", "draft").count().get(),
    collection.where("status", "==", "published").count().get(),
    collection.where("status", "==", "archived").count().get(),
  ]);
  return {
    totalCount: total.data().count,
    draftCount: drafts.data().count,
    publishedCount: published.data().count,
    archivedCount: archived.data().count,
  };
}

async function loadPrivateNotes(
  documents: readonly QueryDocumentSnapshot<DocumentData>[],
): Promise<Map<string, string>> {
  if (documents.length === 0) return new Map();
  const references = documents.map((document) =>
    document.ref.collection(PRIVATE_COLLECTION).doc(PRIVATE_DOCUMENT)
  );
  const snapshots = await adminDb.getAll(...references);
  return new Map(snapshots.map((snapshot, index) => [
    documents[index]?.id ?? "",
    stringValue(snapshot.data()?.adminNotes),
  ]));
}

function mapAnnouncement(
  document: DocumentSnapshot<DocumentData>,
  adminNotes: string,
): AdminAnnouncement {
  const data = document.data() ?? {};
  return {
    id: document.id,
    title: stringValue(data.title) || "Untitled announcement",
    content: stringValue(data.content),
    audience: announcementAudience(data.audience),
    status: announcementStatus(data.status),
    adminNotes,
    createdAt: isoDate(data.createdAt),
    createdBy: nullableString(data.createdBy),
    updatedAt: isoDate(data.updatedAt),
    updatedBy: nullableString(data.updatedBy),
    publishedAt: isoDate(data.publishedAt),
    publishedBy: nullableString(data.publishedBy),
    archivedAt: isoDate(data.archivedAt),
    archivedBy: nullableString(data.archivedBy),
    archiveReason: nullableString(data.archiveReason),
  };
}

function matchesFilters(
  announcement: AdminAnnouncement,
  filters: NormalizedFilters,
): boolean {
  if (filters.status !== "all" && announcement.status !== filters.status) {
    return false;
  }
  if (filters.audience !== "all" && announcement.audience !== filters.audience) {
    return false;
  }
  if (!filters.search) return true;
  const haystack = [announcement.id, announcement.title, announcement.content]
    .join(" ")
    .toLocaleLowerCase("en-PH");
  return haystack.includes(filters.search.toLocaleLowerCase("en-PH"));
}

function normalizeFilters(input: AdminAnnouncementFilters): NormalizedFilters {
  return {
    search: typeof input.search === "string" ? input.search.trim().slice(0, 160) : "",
    status: input.status === "all" || isAnnouncementStatus(input.status)
      ? input.status
      : "all",
    audience: input.audience === "all" || isAnnouncementAudience(input.audience)
      ? input.audience
      : "all",
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.isSafeInteger(input.pageSize) ? input.pageSize : DEFAULT_PAGE_SIZE),
    ),
    cursor: typeof input.cursor === "string" && input.cursor ? input.cursor : null,
  };
}

function encodeCursor(
  document: DocumentSnapshot<DocumentData>,
): string | null {
  const updatedAt = timestampValue(document.data()?.updatedAt);
  if (!updatedAt) return null;
  const cursor: AnnouncementCursor = {
    updatedAt: updatedAt.toMillis(),
    documentId: document.id,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | null): AnnouncementCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<AnnouncementCursor>;
    if (
      typeof parsed.updatedAt !== "number" ||
      !Number.isFinite(parsed.updatedAt) ||
      typeof parsed.documentId !== "string" ||
      !parsed.documentId
    ) return null;
    return parsed as AnnouncementCursor;
  } catch {
    return null;
  }
}

function auditSnapshot(data: Record<string, unknown>): Record<string, unknown> {
  return {
    title: stringValue(data.title),
    content: stringValue(data.content),
    audience: announcementAudience(data.audience),
    status: announcementStatus(data.status),
    archiveReason: nullableString(data.archiveReason),
  };
}

function announcementStatus(value: unknown) {
  return isAnnouncementStatus(value) ? value : "draft";
}

function announcementAudience(value: unknown) {
  return isAnnouncementAudience(value) ? value : "everyone";
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Invalid announcement submission.");
  }
  return input as Record<string, unknown>;
}

function timestampValue(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function isoDate(value: unknown): string | null {
  return timestampValue(value)?.toDate().toISOString() ?? null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
