import {onAuthStateChanged} from "firebase/auth";
import {doc, onSnapshot} from "firebase/firestore";
import {auth, db, initializeBrowserFirebase} from "@/lib/firebase/client";

export type BookingChange = {statusChanged: boolean};
type Observer = {change: (change: BookingChange) => void; error: () => void};
type Entry = {observers: Set<Observer>; stop: () => void; unavailable: () => boolean};
const entries = new Map<string, Entry>();

// Keep only a fingerprint of presentation signals, never raw financial records.
const SIGNAL_FIELDS = [
  "status", "paymentStatus", "updatedAt", "providerRequestIds", "expiresAt", "pendingProviderRequestCount",
  "initialPaymentDeadlineAt", "initialPayment", "bookingPolicy", "remainingBalanceStatus",
  "remainingBalanceEnforcement", "cancelledAt", "confirmedAt", "completedAt",
  "acceptedAt", "respondedAt", "rejectedAt", "replacementStatus", "settlementStatus",
] as const;

export function bookingSignal(data: Record<string, unknown> | undefined): string {
  return JSON.stringify(SIGNAL_FIELDS.map((field) => data?.[field] ?? null));
}

/** One authenticated, reference-counted SDK listener per document across list/drawer. */
export function subscribeBookingDocument(
  customerId: string,
  path: string,
  observer: Observer,
): () => void {
  const key = `${customerId}:${path}`;
  let entry = entries.get(key);
  if (!entry) {
    const observers = new Set<Observer>([observer]);
    let stopSnapshot: (() => void) | undefined;
    let fingerprint: string | undefined;
    let status: unknown;
    let failed = false;
    let unavailable = false;
    initializeBrowserFirebase();
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopSnapshot?.();
      stopSnapshot = undefined;
      if (!user || user.uid !== customerId) {
        unavailable = true;
        observers.forEach((item) => item.error());
        return;
      }
      if (failed) return; // Permission failures require an explicit remount/retry.
      unavailable = false;
      stopSnapshot = onSnapshot(doc(db, path), {includeMetadataChanges: true}, (snapshot) => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        const data = snapshot.data();
        if (data && data.customerId !== customerId) return;
        const next = bookingSignal(data);
        if (next === fingerprint) return;
        const nextStatus = JSON.stringify([data?.status, data?.pendingProviderRequestCount]);
        const statusChanged = fingerprint === undefined || status !== nextStatus;
        fingerprint = next;
        status = nextStatus;
        // First server snapshot also closes the SSR-to-subscription race.
        observers.forEach((item) => item.change({statusChanged}));
      }, () => {
        failed = true;
        unavailable = true;
        stopSnapshot?.();
        observers.forEach((item) => item.error());
      });
    });
    entry = {observers, unavailable: () => unavailable, stop: () => { stopSnapshot?.(); stopAuth(); }};
    entries.set(key, entry);
  } else if (entry.unavailable()) {
    observer.error();
  }
  entry.observers.add(observer);
  return () => {
    entry.observers.delete(observer);
    if (!entry.observers.size) {
      entry.stop();
      entries.delete(key);
    }
  };
}
