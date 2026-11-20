"use client";

/** Session-tab recovery journal. Does not send, import or mutate any data. */
const PREFIX = "feasta.customer.event-list.cloud-pending.v1:uid:";
const MAX_RECORD_LENGTH = 300000;

function key(uid: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new Error("Invalid customer recovery owner.");
  }
  return PREFIX + encodeURIComponent(uid);
}

function storage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Browser recovery storage is unavailable.");
  }
  return window.sessionStorage;
}

/** On read failure, return a sentinel that fail-closes restorePending(). */
export function readPendingCustomerEventListMutation(uid: string): string | null {
  try {
    const value = storage().getItem(key(uid));
    if (value === null) return null;
    if (value.length > MAX_RECORD_LENGTH) return "invalid-recovery-record";
    const record = JSON.parse(value) as Record<string, unknown>;
    if (!record || Array.isArray(record) || record.version !== 1 ||
        record.uid !== uid || typeof record.payload !== "string" ||
        Object.keys(record).length !== 3) return "invalid-recovery-record";
    return record.payload;
  } catch {
    return "invalid-recovery-record";
  }
}

/** Synchronous write before calling Firebase: no durability means no mutation. */
export function savePendingCustomerEventListMutation(uid: string, payload: string): void {
  if (payload.length > MAX_RECORD_LENGTH) {
    throw new Error("Cloud Event List recovery command is too large.");
  }
  const value = JSON.stringify({version: 1, uid, payload});
  if (value.length > MAX_RECORD_LENGTH) {
    throw new Error("Cloud Event List recovery record is too large.");
  }
  const previous = storage().getItem(key(uid));
  if (previous !== null) {
    // Multiple React hook instances must not overwrite another operation's
    // recovery record, even if they share the same authenticated customer.
    throw new Error("An earlier cloud Event List request needs recovery before another save.");
  }
  storage().setItem(key(uid), value);
  if (storage().getItem(key(uid)) !== value) {
    throw new Error("Could not verify saved cloud recovery command.");
  }
}

export function clearPendingCustomerEventListMutation(uid: string, requestId: string): void {
  const value = storage().getItem(key(uid));
  if (value === null) return;
  const record = JSON.parse(value) as {payload: string};
  const command = JSON.parse(record.payload) as {requestId: string};
  if (command.requestId !== requestId) {
    throw new Error("Another saved Event List command requires review.");
  }
  storage().removeItem(key(uid));
  if (storage().getItem(key(uid)) !== null) {
    throw new Error("Could not clear cloud recovery command.");
  }
}
