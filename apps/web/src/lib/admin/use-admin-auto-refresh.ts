"use client";

import {useCallback, useEffect, useRef} from "react";

export const ADMIN_REFRESH_INTERVAL_MS = 5_000;

/** Server-rendered initial data stays visible while subsequent reads run. */
export function useAdminAutoRefresh(
  read: (isCurrent: () => boolean, afterMutation: boolean) => Promise<void>,
  scope: string,
  paused = false,
) {
  const latest = useRef({read, paused, scope});

  useEffect(() => {
    latest.current = {read, paused, scope};
  }, [read, paused, scope]);

  const mounted = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async (afterMutation = false) => {
    if (afterMutation) generation.current += 1;
    // Mutations can await an existing read, then request fresh post-action data.
    if (inFlight.current) await inFlight.current;
    if (!mounted.current || (!afterMutation && latest.current.paused)) return;
    if (inFlight.current) return inFlight.current;
    const version = generation.current;
    const readScope = latest.current.scope;
    const isCurrent = () => mounted.current && generation.current === version &&
      latest.current.scope === readScope && (afterMutation || !latest.current.paused);
    const read = latest.current.read;
    const request = Promise.resolve().then(() => read(isCurrent, afterMutation)).catch(() => {
      // Background failures leave the last successful data on screen.
    });
    inFlight.current = request;
    try { await request; } finally { if (inFlight.current === request) inFlight.current = null; }
  }, []);

  useEffect(() => {
    generation.current += 1;
  }, [scope, paused]);

  useEffect(() => {
    mounted.current = true;
    const tick = () => {
      if (document.visibilityState === "visible" && !latest.current.paused && !inFlight.current) {
        void refresh();
      }
    };
    const becameVisible = () => {
      if (document.visibilityState === "visible" && !latest.current.paused) void refresh();
    };
    const timer = window.setInterval(tick, ADMIN_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", becameVisible);
    return () => {
      mounted.current = false;
      generation.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", becameVisible);
    };
  }, [refresh]);

  return refresh;
}
