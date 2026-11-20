"use client";

import {
  Bell,
  CalendarDays,
  CheckCheck,
  CircleDollarSign,
  Info,
  MessageSquareText,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  roleActions,
  type ShellRole,
} from "@/components/layout/navigation";
import {resolveNotificationDestination} from "@/lib/notifications/notification-destination";
import {
  markNotificationRead,
  markRecentNotificationsRead,
  subscribeToNotifications,
} from "@/lib/notifications/notification-client";
import type {
  AdminNotificationDto,
  FeastaNotification,
  NotificationSnapshot,
} from "@/lib/notifications/notification-types";
import {
  loadAdminNotificationMenuAction,
  markAdminNotificationReadAction,
  markAdminNotificationsReadAction,
} from "@/app/admin/notifications/actions";
import {AnnouncementFeed} from "@/components/announcements/announcement-feed";
import {useNotificationSound} from "@/lib/notifications/use-notification-sound";


const EMPTY_SNAPSHOT: NotificationSnapshot = {
  notifications: [],
  unreadCount: 0,
  unreadCountCapped: false,
};

export function NotificationMenu({
  role,
}: {
  role: ShellRole;
}) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [marking, setMarking] = useState(false);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const {enabled: soundEnabled, unavailable: soundUnavailable, toggle: toggleSound, ring, observe} = useNotificationSound(role);

  const [loadAttempt, setLoadAttempt] = useState(0);
  const lifecycle = useRef(0);

  useEffect(() => {
    const generation = ++lifecycle.current;
    let active = true;
    let subscriptionFailed = false;
    let unsubscribe: (() => void) | undefined;
    const acceptSnapshot = (nextSnapshot: NotificationSnapshot) => {
      if (!active || subscriptionFailed || generation !== lifecycle.current) return;
      observe(nextSnapshot.notifications);
      setSnapshot(nextSnapshot);
      setLoading(false);
      setError(null);
    };

    if (role === "admin") {
      void loadAdminNotificationMenuAction()
        .then((summary) => {
          if (!active || generation !== lifecycle.current) return;

          setSnapshot({
            notifications:
              summary.notifications.map(
                adminNotificationFromDto,
              ),
            unreadCount:
              summary.unreadCount,
            unreadCountCapped:
              summary.unreadCountCapped,
          });
          setLoading(false);
          void subscribeToNotifications(acceptSnapshot, () => {
            if (!active || generation !== lifecycle.current) return;
            subscriptionFailed = true;
            unsubscribe?.();
            unsubscribe = undefined;
            setError("Live notifications disconnected. Retry to reconnect.");
          }).then((subscription) => {
            if (active && !subscriptionFailed && generation === lifecycle.current) unsubscribe = subscription.unsubscribe;
            else subscription.unsubscribe();
          }).catch(() => {
            if (active && generation === lifecycle.current) setError("Live notifications disconnected. Retry to reconnect.");
          });
        })
        .catch(() => {
          if (!active || generation !== lifecycle.current) return;

          setLoading(false);
          setError(
            "Notifications could not be loaded.",
          );
        });

      return () => {
        active = false;
        unsubscribe?.();
        if (lifecycle.current === generation) lifecycle.current += 1;
      };
    }

    void subscribeToNotifications(
      (nextSnapshot) => {
        if (!active || subscriptionFailed || generation !== lifecycle.current) return;

        acceptSnapshot(nextSnapshot);
      },
      () => {
        if (!active || subscriptionFailed || generation !== lifecycle.current) return;
        subscriptionFailed = true;
        unsubscribe?.();
        unsubscribe = undefined;

        setLoading(false);
        setError(
          "Notifications could not be loaded.",
        );
      },
    )
      .then((subscription) => {
        if (active && !subscriptionFailed && generation === lifecycle.current) {
          unsubscribe =
            subscription.unsubscribe;
        } else {
          subscription.unsubscribe();
        }
      })
      .catch(() => {
        if (!active || generation !== lifecycle.current) return;

        setLoading(false);
        setError(
          "Notifications could not be loaded.",
        );
      });

    return () => {
      active = false;
      if (lifecycle.current === generation) lifecycle.current += 1;
      unsubscribe?.();
    };
  }, [role, loadAttempt, observe]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const markRecentRead = async () => {
    const unreadNotifications =
      snapshot.notifications.filter(
        (notification) =>
          !notification.isRead,
      );

    if (unreadNotifications.length === 0) {
      return;
    }

    const generation = lifecycle.current;
    setMarking(true);
    setError(null);

    try {
      if (role === "admin") {
        await markAdminNotificationsReadAction(
          unreadNotifications.map(
            (notification) =>
              notification.id,
          ),
        );
      } else {
        await markRecentNotificationsRead(
          unreadNotifications,
        );
      }

      if (generation !== lifecycle.current) return;
      setSnapshot((current) => ({
        ...current,
        notifications:
          current.notifications.map(
            (notification) => ({
              ...notification,
              isRead: true,
              readAt:
                notification.readAt ??
                new Date(),
            }),
          ),
        unreadCount: 0,
        unreadCountCapped: false,
      }));
    } catch {
      if (generation !== lifecycle.current) return;
      setError(
        "Notifications could not be updated.",
      );
    } finally {
      if (generation === lifecycle.current) setMarking(false);
    }
  };

  const markOneRead = async (
    notification: FeastaNotification,
  ) => {
    if (notification.isRead) return;

    const generation = lifecycle.current;
    const updateLocalReadState = () => {
      if (generation !== lifecycle.current) return;
      setSnapshot((current) => ({
        ...current,
        notifications:
          current.notifications.map(
            (item) =>
              item.id === notification.id
                ? {
                    ...item,
                    isRead: true,
                    readAt: new Date(),
                  }
                : item,
          ),
        unreadCount: Math.max(
          0,
          current.unreadCount - 1,
        ),
        unreadCountCapped: false,
      }));
    };

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

      updateLocalReadState();
    } catch {
      if (generation !== lifecycle.current) return;
      setError(
        "The notification could not be updated.",
      );
    }
  };

  return (
    <div ref={container} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={notificationButtonLabel(snapshot)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="feasta-notification-menu"
        className="relative inline-flex size-12 items-center justify-center rounded-xl border border-transparent text-foreground transition-colors hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell aria-hidden="true" className="size-5" />
        {announcementCount > 0 ? <span aria-label="Official announcements available" className="absolute bottom-1 right-1 size-2 rounded-full bg-primary" /> : null}

        {snapshot.unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-black leading-none text-destructive-foreground">
            {snapshot.unreadCountCapped
              ? "99+"
              : snapshot.unreadCount}
          </span>
        ) : null}
      </button>

      <div hidden={!open}>
        <section
          id="feasta-notification-menu"
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[min(38rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-floating"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-black">Notifications</h2>
              <p className="text-xs text-muted-foreground">
                {snapshot.unreadCount === 0 ? "No unread personal notifications" : unreadLabel(snapshot)}
              </p>
            </div>

            <button type="button" aria-label={soundEnabled ? "Mute notification sound" : "Enable notification sound"} title={soundEnabled ? "Mute notification sound" : "Enable notification sound"} aria-pressed={soundEnabled} onClick={() => void toggleSound()} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {soundEnabled ? <Volume2 aria-hidden="true" className="size-5" /> : <VolumeX aria-hidden="true" className="size-5" />}
            </button>
          </div>

          {soundUnavailable ? <p role="status" className="shrink-0 border-b border-border px-4 py-2 text-xs">Sound unavailable in this browser. Visual notifications remain active.</p> : null}

          <div className="min-h-0 overflow-y-auto overscroll-contain">
            {role !== "admin" ? <AnnouncementFeed role={role} compact onAvailability={setAnnouncementCount} onNew={ring} /> : null}

            <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Recent activity</h3>

            {snapshot.notifications.some((item) => !item.isRead) ? (
              <button
                type="button"
                disabled={marking}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-primary hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void markRecentRead()}
              >
                <CheckCheck aria-hidden="true" className="size-4" />
                {marking ? "Updating" : "Mark recent read"}
              </button>
            ) : null}
          </div>

          <div>
            {loading ? (
              <NotificationMessage>Loading notifications…</NotificationMessage>
            ) : error ? (
              <div>
                <NotificationMessage tone="error">{error}</NotificationMessage>
                <button
                  type="button"
                  className="min-h-11 w-full text-sm font-bold text-primary"
                  onClick={() => {
                    lifecycle.current += 1;
                    setLoading(true);
                    setError(null);
                    setMarking(false);
                    setLoadAttempt((current) => current + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : snapshot.notifications.length === 0 ? (
              <NotificationMessage>No notifications yet.</NotificationMessage>
            ) : (
              <ul aria-label="Recent notifications" className="divide-y divide-border">
                {snapshot.notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    role={role}
                    onMarkRead={markOneRead}
                    onNavigate={(destination) => {
                      setOpen(false);
                      router.push(destination);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 border-t border-border bg-card p-2">
              {role !== "admin" ? <Link
                href={`${roleActions[role].notificationsHref}#official-announcements`}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg px-2 text-xs font-bold text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setOpen(false)}
              >
                Official announcements
              </Link> : null}
            <Link
              href={roleActions[role].notificationsHref}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary/10 px-2 text-xs font-bold text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function NotificationItem({
  notification,
  role,
  onMarkRead,
  onNavigate,
}: {
  notification: FeastaNotification;
  role: ShellRole;
  onMarkRead: (
    notification: FeastaNotification,
  ) => void | Promise<void>;
  onNavigate: (destination: string) => void;
}) {
  const destination = resolveNotificationDestination(role, notification);

  return (
    <li>
      <button
        type="button"
        className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-3 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => {
          void onMarkRead(notification);
          if (destination) onNavigate(destination);
        }}
      >
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <NotificationTypeIcon type={notification.type} />
        </span>

        <span className="min-w-0">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 break-words text-sm font-bold">
              {notification.title}
            </span>
            {!notification.isRead ? (
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            ) : null}
          </span>
          <span className="mt-1 block break-words text-sm leading-5 text-muted-foreground">
            {notification.message}
          </span>
          <span className="mt-1.5 block text-xs font-medium text-muted-foreground">
            {relativeTime(notification.createdAt)}
          </span>
        </span>
      </button>
    </li>
  );
}

function NotificationMessage({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "px-5 py-10 text-center text-sm font-semibold text-destructive"
          : "px-5 py-10 text-center text-sm text-muted-foreground"
      }
    >
      {children}
    </p>
  );
}

function NotificationTypeIcon({
  type,
}: {
  type: string;
}) {
  const normalized = type.toLowerCase();
  const iconProps = {
    "aria-hidden": true,
    className: "size-5",
  } as const;

  if (normalized.includes("verification")) {
    return <ShieldCheck {...iconProps} />;
  }

  if (
    normalized.includes("payment") ||
    normalized.includes("refund") ||
    normalized.includes("fund")
  ) {
    return <CircleDollarSign {...iconProps} />;
  }

  if (
    normalized.includes("booking") ||
    normalized.includes("cancellation") ||
    normalized.includes("request")
  ) {
    return <CalendarDays {...iconProps} />;
  }

  if (
    normalized.includes("review") ||
    normalized.includes("message")
  ) {
    return <MessageSquareText {...iconProps} />;
  }

  return <Info {...iconProps} />;
}

function notificationButtonLabel(snapshot: NotificationSnapshot): string {
  if (snapshot.unreadCount === 0) return "Notifications";
  return `${snapshot.unreadCountCapped ? "More than 99" : snapshot.unreadCount} unread notifications`;
}

function unreadLabel(snapshot: NotificationSnapshot): string {
  if (snapshot.unreadCount === 0) return "You are all caught up";
  return `${snapshot.unreadCountCapped ? "99+" : snapshot.unreadCount} unread`;
}

function adminNotificationFromDto(
  notification: AdminNotificationDto,
): FeastaNotification {
  return {
    ...notification,
    createdAt:
      notification.createdAt
        ? new Date(
            notification.createdAt,
          )
        : null,
    readAt:
      notification.readAt
        ? new Date(notification.readAt)
        : null,
  };
}

function relativeTime(value: Date | null): string {
  if (!value) return "Recently";
  const seconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: value.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    timeZone: "Asia/Manila",
  }).format(value);
}
