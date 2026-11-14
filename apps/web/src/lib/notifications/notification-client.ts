"use client";

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type QuerySnapshot,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import {
  RECENT_NOTIFICATION_LIMIT,
  UNREAD_NOTIFICATION_LIMIT,
  MAX_NOTIFICATION_PAGE_ITEMS,
  type FeastaNotification,
  type NotificationSnapshot,
} from "@/lib/notifications/notification-types";
import {
  auth,
  db,
} from "@/lib/firebase/client";

type NotificationSubscription = {
  unsubscribe: Unsubscribe;
};

export async function subscribeToNotifications(
  onData: (
    snapshot: NotificationSnapshot,
  ) => void,
  onError: (error: Error) => void,
): Promise<NotificationSubscription> {
  await auth.authStateReady();

  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "Your session has expired. Please sign in again.",
    );
  }

  const notificationsReference =
    collection(db, "notifications");

  const recentQuery = query(
    notificationsReference,
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc"),
    limit(RECENT_NOTIFICATION_LIMIT),
  );

  const unreadQuery = query(
    notificationsReference,
    where("userId", "==", user.uid),
    where("isRead", "==", false),
    orderBy("createdAt", "desc"),
    limit(UNREAD_NOTIFICATION_LIMIT),
  );

  let recentNotifications:
    readonly FeastaNotification[] = [];

  let unreadCount = 0;

  const publish = () => {
    onData({
      notifications:
        recentNotifications,
      unreadCount,
      unreadCountCapped:
        unreadCount >=
        UNREAD_NOTIFICATION_LIMIT,
    });
  };

  const unsubscribeRecent =
    onSnapshot(
      recentQuery,
      (snapshot) => {
        recentNotifications =
          snapshot.docs.map(
            mapNotification,
          );

        publish();
      },
      (error) => {
        onError(
          notificationError(error),
        );
      },
    );

  const unsubscribeUnread =
    onSnapshot(
      unreadQuery,
      (snapshot) => {
        unreadCount =
          snapshot.size;

        publish();
      },
      (error) => {
        onError(
          notificationError(error),
        );
      },
    );

  return {
    unsubscribe: () => {
      unsubscribeRecent();
      unsubscribeUnread();
    },
  };
}

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  await requireAuthenticatedUser();

  if (
    !/^[A-Za-z0-9_-]{1,150}$/u.test(
      notificationId,
    )
  ) {
    throw new Error(
      "The notification is invalid.",
    );
  }

  await updateDoc(
    doc(
      db,
      "notifications",
      notificationId,
    ),
    {
      isRead: true,
      readAt: serverTimestamp(),
    },
  );
}

export async function markRecentNotificationsRead(
  notifications:
    readonly FeastaNotification[],
): Promise<void> {
  await requireAuthenticatedUser();

  const unread = notifications
    .filter(
      (notification) =>
        !notification.isRead,
    )
    .slice(
      0,
      RECENT_NOTIFICATION_LIMIT,
    );

  if (unread.length === 0) {
    return;
  }

  const batch = writeBatch(db);

  for (const notification of unread) {
    batch.update(
      doc(
        db,
        "notifications",
        notification.id,
      ),
      {
        isRead: true,
        readAt: serverTimestamp(),
      },
    );
  }

  await batch.commit();
}

async function requireAuthenticatedUser() {
  await auth.authStateReady();

  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "Your session has expired. Please sign in again.",
    );
  }

  return user;
}

function mapNotification(
  document:
    QueryDocumentSnapshot<DocumentData>,
): FeastaNotification {
  const data = document.data();

  return {
    id: document.id,

    userId: stringValue(
      data.userId,
    ),

    title: stringValue(
      data.title,
      "FEASTA notification",
    ),

    message: stringValue(
      data.message,
      "A notification was received.",
    ),

    type: stringValue(
      data.type,
      "general",
    ),

    relatedId:
      nullableString(
        data.relatedId,
      ),

    relatedCollection:
      nullableString(
        data.relatedCollection,
      ),

    isRead:
      data.isRead === true,

    readAt:
      timestampDate(
        data.readAt,
      ),

    createdAt:
      timestampDate(
        data.createdAt,
      ),
  };
}

function stringValue(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string" &&
    value.trim().length > 0
    ? value.trim()
    : fallback;
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim().length > 0
    ? value.trim()
    : null;
}

function timestampDate(
  value: unknown,
): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  return null;
}

function notificationError(
  error: unknown,
): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(
    "Notifications could not be loaded.",
  );
}

export async function subscribeToNotificationPage(
  requestedLimit: number,
  onValue: (notifications: FeastaNotification[]) => void,
  onError: () => void,
): Promise<{
  unsubscribe: () => void;
}> {
  await auth.authStateReady();

  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "Your session has expired. Please sign in again.",
    );
  }

  const boundedLimit = Math.min(
    Math.max(Math.trunc(requestedLimit), 1),
    MAX_NOTIFICATION_PAGE_ITEMS,
  );

  const notificationsQuery = query(
    collection(db, "notifications"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc"),
    limit(boundedLimit),
  );

  const unsubscribe = onSnapshot(
    notificationsQuery,
    (snapshot) => {
      onValue(mapNotificationSnapshot(snapshot));
    },
    () => {
      onError();
    },
  );

  return {
    unsubscribe,
  };
}

function mapNotificationSnapshot(
  snapshot: QuerySnapshot,
): FeastaNotification[] {
  return snapshot.docs.map((notificationDocument) => {
    const data = notificationDocument.data();

    return {
      id: notificationDocument.id,
      userId:
        typeof data.userId === "string"
          ? data.userId
          : "",
      title:
        typeof data.title === "string"
          ? data.title
          : "Notification",
      message:
        typeof data.message === "string"
          ? data.message
          : "",
      type:
        typeof data.type === "string"
          ? data.type
          : "information",
      relatedId:
        typeof data.relatedId === "string"
          ? data.relatedId
          : null,
      relatedCollection:
        typeof data.relatedCollection === "string"
          ? data.relatedCollection
          : null,
      metadata:
        data.metadata &&
        typeof data.metadata === "object"
          ? data.metadata as Record<string, unknown>
          : {},
      isRead: data.isRead === true,
      readAt:
        data.readAt &&
        typeof data.readAt.toDate === "function"
          ? data.readAt.toDate()
          : null,
      createdAt:
        data.createdAt &&
        typeof data.createdAt.toDate === "function"
          ? data.createdAt.toDate()
          : null,
    };
  });
}