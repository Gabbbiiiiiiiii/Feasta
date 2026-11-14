"use client";

import {useEffect, useRef, useState} from "react";
import type {CustomerBooking} from "./customer-booking-types";

/** Coalesce server signals and serialize refreshes, retaining changes during a request. */
export function useBookingChanges(
  bookings: readonly CustomerBooking[],
  refresh: (statusChanged: boolean, bookingIds: string[]) => Promise<void>,
  blocked = false,
) {
  const [unavailable, setUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const current = useRef({refresh, blocked});
  useEffect(() => { current.current = {refresh, blocked}; });
  const scopes = new Map<string, [string, string]>();
  for (const booking of bookings) {
    if (!booking.realtime?.customerId) continue;
    scopes.set(`mainEvents/${booking.id}`, [booking.realtime.customerId, booking.id]);
    for (const id of booking.realtime.providerRequestIds) {
      scopes.set(`providerRequests/${id}`, [booking.realtime.customerId, booking.id]);
    }
  }
  const scopeKey = JSON.stringify([...scopes.entries()].sort());
  const runKey = `${retry}:${scopeKey}`;
  const drainRef = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let running = false;
    let dirty = false;
    let statuses = false;
    const dirtyBookings = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let stops: (() => void)[] = [];
    let failed = false;
    const scope: [string, [string, string]][] = JSON.parse(scopeKey);
    const drain = async () => {
      if (disposed || running || !dirty || current.current.blocked || document.hidden) return;
      running = true;
      setBusyScope(runKey);
      dirty = false;
      const changed = statuses;
      statuses = false;
      const bookingIds = [...dirtyBookings];
      dirtyBookings.clear();
      try {
        await current.current.refresh(changed, bookingIds);
      } catch {
        if (!disposed) setUnavailable(true);
      } finally {
        running = false;
        if (!disposed) setBusyScope(null);
        if (!disposed && dirty) schedule();
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void drain(); }, 250);
    };
    drainRef.current = schedule;
    const start = async () => {
      if (!scope.length || disposed || stops.length || failed) return;
      try {
        const {subscribeBookingDocument} = await import("./booking-change-subscriptions");
        if (disposed || stops.length) return;
        stops = scope.map(([path, [uid, bookingId]]) => subscribeBookingDocument(uid, path, {
          change: ({statusChanged}) => {
            dirty = true;
            dirtyBookings.add(bookingId);
            statuses ||= statusChanged;
            if (!failed) setUnavailable(false);
            schedule();
          },
          error: () => { failed = true; if (!disposed) setUnavailable(true); },
        }));
      } catch {
        if (!disposed) setUnavailable(true);
      }
    };
    const visibility = () => {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (document.hidden) {
        // Avoid reconnect reads on brief tab switches; release after five minutes.
        hiddenTimer = setTimeout(() => { stops.forEach((stop) => stop()); stops = []; }, 300_000);
      } else {
        void start();
        schedule();
      }
    };
    void start();
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
      clearTimeout(timer);
      clearTimeout(hiddenTimer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [scopeKey, retry, runKey]);
  useEffect(() => { if (!blocked) drainRef.current(); }, [blocked]);
  return {unavailable, refreshing: busyScope === runKey, retry: () => setRetry((value) => value + 1)};
}
