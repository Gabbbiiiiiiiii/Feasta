"use client";

import {MessageSquareText} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {loadProviderUnreadMessageCountAction} from "@/app/provider/messages/actions";

const REFRESH_INTERVAL_MS = 15_000;

export function ProviderMessageIndicator() {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const count =
        await loadProviderUnreadMessageCountAction();

      setUnreadCount(count);
    } catch {
      // Restricted/unavailable messaging should not break the header.
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(
      () => void refreshUnreadCount(),
      0,
    );

    const interval = window.setInterval(
      () => void refreshUnreadCount(),
      REFRESH_INTERVAL_MS,
    );

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshUnreadCount();
      }
    };

    document.addEventListener(
      "visibilitychange",
      refreshWhenVisible,
    );

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      document.removeEventListener(
        "visibilitychange",
        refreshWhenVisible,
      );
    };
  }, [refreshUnreadCount]);

  const badge =
    unreadCount > 99
      ? "99+"
      : unreadCount.toString();

  const label =
    unreadCount > 0
      ? `Messages, ${unreadCount} unread`
      : "Messages";

  return (
    <Link
      href="/provider/messages"
      aria-label={label}
      title="Messages"
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MessageSquareText
        aria-hidden="true"
        className="size-5"
      />

      {unreadCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}