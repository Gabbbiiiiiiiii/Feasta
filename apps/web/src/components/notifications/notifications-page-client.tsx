"use client";

import {
  Bell,
  CalendarDays,
  CheckCheck,
  CircleDollarSign,
  Info,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import {
  loadAdminNotificationsAction,
  markAdminNotificationReadAction,
  markAdminNotificationsReadAction,
} from "@/app/admin/notifications/actions";
import Link from "next/link";
import {useEffect, useRef, useState} from "react";

import {PageHeading} from "@/components/layout/page-heading";
import {type ShellRole} from "@/components/layout/navigation";
import {
  markNotificationRead,
  markRecentNotificationsRead,
  subscribeToNotificationPage,
} from "@/lib/notifications/notification-client";
import {
  MAX_NOTIFICATION_PAGE_ITEMS,
  NOTIFICATION_PAGE_SIZE,
  type FeastaNotification,
} from "@/lib/notifications/notification-types";

export function NotificationsPageClient({role}: {role: ShellRole}) {
  const [notifications, setNotifications] = useState<FeastaNotification[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(NOTIFICATION_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};

    if (!hasLoaded.current) {
      setLoading(true);
    }

    if (role === "admin") {
      void loadAdminNotificationsAction(
        visibleLimit,
      )
        .then((page) => {
          if (!active) return;

          setNotifications(
            page.notifications.map(
              adminNotificationToClient,
            ),
          );
          setHasMore(page.hasMore);
          setLoading(false);
          setError(null);
          hasLoaded.current = true;
        })
        .catch(() => {
          if (!active) return;

          setLoading(false);
          setError(
            "Notifications could not be loaded. Please try again.",
          );
        });

      return () => {
        active = false;
      };
    }

    void subscribeToNotificationPage(
      visibleLimit,
      (items) => {
        if (!active) return;

        setNotifications(items);
        setHasMore(
          items.length === visibleLimit &&
            visibleLimit <
              MAX_NOTIFICATION_PAGE_ITEMS,
        );
        setLoading(false);
        setError(null);
        hasLoaded.current = true;
      },
      () => {
        if (!active) return;

        setLoading(false);
        setError(
          "Notifications could not be loaded. Please try again.",
        );
      },
    )
      .then((subscription) => {
        if (active) {
          unsubscribe =
            subscription.unsubscribe;
        } else {
          subscription.unsubscribe();
        }
      })
      .catch(() => {
        if (!active) return;

        setLoading(false);
        setError(
          "Notifications could not be loaded. Please try again.",
        );
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    reloadKey,
    role,
    visibleLimit,
  ]);

  const unreadVisible = notifications.filter((item) => !item.isRead);
  const canLoadMore =
    hasMore &&
    visibleLimit <
      MAX_NOTIFICATION_PAGE_ITEMS;

  const markVisibleRead = async () => {
    if (unreadVisible.length === 0) return;

    setUpdating(true);
    setError(null);

    try {
      if (role === "admin") {
        await markAdminNotificationsReadAction(
          unreadVisible.map(
            (notification) =>
              notification.id,
          ),
        );

        setNotifications((items) =>
          items.map((item) => ({
            ...item,
            isRead: true,
            readAt:
              item.readAt ?? new Date(),
          })),
        );
      } else {
        await markRecentNotificationsRead(
          unreadVisible,
        );
      }
    } catch {
      setError(
        "Notifications could not be updated. Please try again.",
      );
    } finally {
      setUpdating(false);
    }
  };

  const markOneRead = async (
    notification: FeastaNotification,
  ) => {
    if (notification.isRead) return;

    setNotifications((items) =>
      items.map((item) =>
        item.id === notification.id
          ? {
              ...item,
              isRead: true,
              readAt: new Date(),
            }
          : item,
      ),
    );

    try {
      if (role === "admin") {
        await markAdminNotificationReadAction(
          notification.id,
        );
      } else {
        await markNotificationRead(
          notification.id,
        );
      }
    } catch {
      setError(
        "The notification could not be updated. Please try again.",
      );
      setReloadKey(
        (current) => current + 1,
      );
    }
  };

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Notifications"
        description="Review important booking, payment, verification, and account updates."
        actions={
          unreadVisible.length > 0 ? (
            <button
              type="button"
              disabled={updating}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 font-bold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void markVisibleRead()}
            >
              <CheckCheck aria-hidden="true" className="size-5" />
              {updating ? "Updating" : "Mark visible as read"}
            </button>
          ) : null
        }
      />

      {error ? (
      <section
        role="alert"
        className="grid justify-items-center gap-4 rounded-xl border border-destructive/30 bg-card px-6 py-14 text-center shadow-card"
      >
        <p className="font-semibold text-destructive">
          {error}
        </p>

        <button
          type="button"
          className="min-h-11 rounded-lg border border-border px-4 font-bold hover:bg-secondary"
          onClick={() =>
            setReloadKey(
              (current) => current + 1,
            )
          }
        >
          Try again
        </button>
      </section>
    ) : (
      <section aria-labelledby="notification-list-heading" className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div>
            <h2 id="notification-list-heading" className="text-lg font-black">Recent updates</h2>
            <p className="text-sm text-muted-foreground">
              {unreadVisible.length === 0
                ? "No unread updates in this list"
                : `${unreadVisible.length} unread in this list`}
            </p>
          </div>
          <Bell aria-hidden="true" className="size-6 text-primary" />
        </div>

        {loading && notifications.length === 0 ? (
          <p role="status" className="px-6 py-16 text-center text-muted-foreground">Loading notifications…</p>
        ) : notifications.length === 0 ? (
          <div className="grid justify-items-center gap-3 px-6 py-16 text-center">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary">
              <Bell aria-hidden="true" className="size-7 text-muted-foreground" />
            </span>
            <h3 className="text-lg font-black">You’re all caught up</h3>
            <p className="max-w-md text-sm text-muted-foreground">New FEASTA activity will appear here when it becomes available.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border" aria-label="Notifications">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                role={role}
                onMarkRead={markOneRead}
              />
            ))}
          </ul>
        )}

        {notifications.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-4 sm:px-6">
            <p className="text-xs text-muted-foreground">
              Showing {notifications.length} most recent notifications, up to {MAX_NOTIFICATION_PAGE_ITEMS}.
            </p>
            {canLoadMore ? (
              <button
                type="button"
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-bold hover:bg-secondary"
                onClick={() => setVisibleLimit((current) => Math.min(current + NOTIFICATION_PAGE_SIZE, MAX_NOTIFICATION_PAGE_ITEMS))}
              >
                Load {Math.min(NOTIFICATION_PAGE_SIZE, MAX_NOTIFICATION_PAGE_ITEMS - visibleLimit)} more
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
      )}
    </div>
  );
}

function NotificationRow({
    notification,
    role,
    onMarkRead,
  }: {
    notification: FeastaNotification;
    role: ShellRole;
    onMarkRead: (
      notification: FeastaNotification,
    ) => Promise<void>;
  }) {
  const destination = notificationDestination(role, notification);
  const content = (
    <>
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <NotificationTypeIcon type={notification.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1 break-words font-bold">{notification.title}</span>
          {!notification.isRead ? <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
        </span>
        <span className="mt-1 block break-words text-sm leading-6 text-muted-foreground">{notification.message}</span>
        <time className="mt-2 block text-xs font-semibold text-muted-foreground" dateTime={notification.createdAt?.toISOString()}>
          {formatNotificationDate(notification.createdAt)}
        </time>
      </span>
    </>
  );

  const className = `flex min-h-24 gap-3 px-4 py-4 text-left transition-colors hover:bg-secondary sm:px-6 ${notification.isRead ? "" : "bg-primary/[0.035]"}`;
  const markRead = () => {
    void onMarkRead(notification);
  };

  return (
    <li>
      {destination ? (
        <Link href={destination} className={className} onClick={markRead}>{content}</Link>
      ) : (
        <button type="button" className={`${className} w-full`} onClick={markRead}>{content}</button>
      )}
    </li>
  );
}

function adminNotificationToClient(
  notification: Awaited<
    ReturnType<
      typeof loadAdminNotificationsAction
    >
  >["notifications"][number],
): FeastaNotification {
  return {
    ...notification,
    createdAt: notification.createdAt
      ? new Date(notification.createdAt)
      : null,
    readAt: notification.readAt
      ? new Date(notification.readAt)
      : null,
  };
}

function NotificationTypeIcon({type}: {type: string}) {
  const normalized = type.toLowerCase();
  const props = {"aria-hidden": true, className: "size-5"} as const;
  if (normalized.includes("verification")) return <ShieldCheck {...props} />;
  if (normalized.includes("booking") || normalized.includes("request")) return <CalendarDays {...props} />;
  if (normalized.includes("payment") || normalized.includes("refund")) return <CircleDollarSign {...props} />;
  if (normalized.includes("review") || normalized.includes("message")) return <MessageSquareText {...props} />;
  return <Info {...props} />;
}

function notificationDestination(role: ShellRole, notification: FeastaNotification): string | null {
  const collection = notification.relatedCollection?.toLowerCase() ?? "";
  const knownCollections = [
    "providerverifications",
    "payments",
    "reviews",
    "mainevents",
    "bookings",
    "providerrequests",
    "bookingproviderrequests",
  ];

  if (collection && !knownCollections.includes(collection)) {
    return role === "admin" ? "/admin/notifications" : null;
  }

  if (collection === "providerverifications" || notification.type.toLowerCase().includes("verification")) {
    return role === "admin" ? "/admin/providers" : role === "provider" ? "/provider/verification" : null;
  }
  if (collection === "payments" || notification.type.toLowerCase().includes("payment") || notification.type.toLowerCase().includes("refund")) {
    return role === "admin" ? "/admin/payments" : role === "customer" ? "/customer/bookings" : "/provider";
  }
  if (collection === "reviews" || notification.type.toLowerCase().includes("review")) {
    return role === "admin" ? "/admin/reviews" : role === "customer" ? "/customer/bookings" : "/provider";
  }
  if (["mainevents", "bookings", "providerrequests", "bookingproviderrequests"].includes(collection) || notification.type.toLowerCase().includes("booking") || notification.type.toLowerCase().includes("request")) {
    return role === "admin" ? "/admin/bookings" : role === "customer" ? "/customer/bookings" : "/provider";
  }
  return null;
}

function formatNotificationDate(value: Date | null): string {
  if (!value) return "Recently";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(value);
}
