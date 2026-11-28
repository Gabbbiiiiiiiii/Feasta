import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  MAX_NOTIFICATION_PAGE_ITEMS,
  NOTIFICATION_PAGE_SIZE,
  type AdminNotificationDto,
} from "@/lib/notifications/notification-types";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const NOTIFICATIONS_COLLECTION = "notifications";
const SAFE_NOTIFICATION_ID = /^[A-Za-z0-9_-]{1,128}$/u;



export type AdminNotificationPage = {
  notifications: AdminNotificationDto[];
  requestedLimit: number;
  hasMore: boolean;
};

export type AdminNotificationMenuSummary = {
  notifications: AdminNotificationDto[];
  unreadCount: number;
  unreadCountCapped: boolean;
};

export async function loadAdminNotificationPage(
  requestedLimit: number,
): Promise<AdminNotificationPage> {
  const administrator = await requireAdmin();
  const boundedLimit = normalizeLimit(requestedLimit);

  // Fetch one extra record so the UI can report whether another bounded page
  // is available without an additional count query.
  const snapshot = await adminDb
    .collection(NOTIFICATIONS_COLLECTION)
    .where("userId", "==", administrator.uid)
    .orderBy("createdAt", "desc")
    .limit(Math.min(boundedLimit + 1, MAX_NOTIFICATION_PAGE_ITEMS + 1))
    .get();

  const hasMore =
    snapshot.size > boundedLimit &&
    boundedLimit < MAX_NOTIFICATION_PAGE_ITEMS;

  return {
    notifications: snapshot.docs
      .slice(0, boundedLimit)
      .map(mapNotificationDocument),
    requestedLimit: boundedLimit,
    hasMore,
  };
}

export async function loadAdminNotificationMenuSummary(): Promise<
  AdminNotificationMenuSummary
> {
  const administrator =
    await requireAdmin();

  const notifications =
    adminDb.collection(
      NOTIFICATIONS_COLLECTION,
    );

  const [recentSnapshot, unreadSnapshot] =
    await Promise.all([
      notifications
        .where(
          "userId",
          "==",
          administrator.uid,
        )
        .orderBy(
          "createdAt",
          "desc",
        )
        .limit(8)
        .get(),

      notifications
        .where(
          "userId",
          "==",
          administrator.uid,
        )
        .where(
          "isRead",
          "==",
          false,
        )
        .count()
        .get(),
    ]);

  const unreadCount =
    unreadSnapshot.data().count;

  return {
    notifications:
      recentSnapshot.docs.map(
        mapNotificationDocument,
      ),
    unreadCount:
      Math.min(unreadCount, 100),
    unreadCountCapped:
      unreadCount > 99,
  };
}

export async function markOwnedAdminNotificationRead(
  notificationId: string,
): Promise<{updated: boolean}> {
  const administrator = await requireAdmin();
  const normalizedId = normalizeNotificationId(notificationId);
  const reference = adminDb
    .collection(NOTIFICATIONS_COLLECTION)
    .doc(normalizedId);
  const snapshot = await reference.get();

  if (!snapshot.exists || snapshot.data()?.userId !== administrator.uid) {
    throw new Error("The notification is unavailable.");
  }

  if (snapshot.data()?.isRead === true) {
    return {updated: false};
  }

  await reference.update({
    isRead: true,
    readAt: FieldValue.serverTimestamp(),
  });

  return {updated: true};
}

export async function markOwnedAdminNotificationsRead(
  notificationIds: readonly string[],
): Promise<{updatedCount: number}> {
  const administrator = await requireAdmin();
  const normalizedIds = normalizeNotificationIds(notificationIds);

  if (normalizedIds.length === 0) {
    return {updatedCount: 0};
  }

  const references = normalizedIds.map((notificationId) =>
    adminDb.collection(NOTIFICATIONS_COLLECTION).doc(notificationId),
  );
  const snapshots = await Promise.all(
    references.map((reference) => reference.get()),
  );
  const batch = adminDb.batch();
  let updatedCount = 0;

  snapshots.forEach((snapshot, index) => {
    const data = snapshot.data();
    if (
      !snapshot.exists ||
      data?.userId !== administrator.uid ||
      data?.isRead === true
    ) {
      return;
    }

    batch.update(references[index], {
      isRead: true,
      readAt: FieldValue.serverTimestamp(),
    });
    updatedCount += 1;
  });

  if (updatedCount > 0) {
    await batch.commit();
  }

  return {updatedCount};
}

function mapNotificationDocument(
  document: QueryDocumentSnapshot<DocumentData>,
): AdminNotificationDto {
  const data = document.data();

  return {
    id: document.id,
    userId: typeof data.userId === "string" ? data.userId : "",
    title: typeof data.title === "string" ? data.title : "Notification",
    message: typeof data.message === "string" ? data.message : "",
    type: typeof data.type === "string" ? data.type : "information",
    relatedId: typeof data.relatedId === "string" ? data.relatedId : null,
    relatedCollection:
      typeof data.relatedCollection === "string"
        ? data.relatedCollection
        : null,
    isRead: data.isRead === true,
    readAt: timestampToIsoString(data.readAt),
    createdAt: timestampToIsoString(data.createdAt),
  };
}

function timestampToIsoString(value: unknown): string | null {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : null;
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return NOTIFICATION_PAGE_SIZE;
  return Math.min(
    Math.max(Math.trunc(value), 1),
    MAX_NOTIFICATION_PAGE_ITEMS,
  );
}

function normalizeNotificationId(value: string): string {
  const normalized = value.trim();
  if (!SAFE_NOTIFICATION_ID.test(normalized)) {
    throw new Error("The notification identifier is invalid.");
  }
  return normalized;
}

function normalizeNotificationIds(values: readonly string[]): string[] {
  if (!Array.isArray(values)) {
    throw new Error("Notification identifiers are required.");
  }

  return [...new Set(values)]
    .slice(0, MAX_NOTIFICATION_PAGE_ITEMS)
    .map(normalizeNotificationId);
}