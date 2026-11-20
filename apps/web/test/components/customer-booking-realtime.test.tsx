import {act, renderHook, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {CustomerBooking} from "@/lib/customer/bookings/customer-booking-types";

type Snapshot = {
  metadata: {fromCache: boolean; hasPendingWrites: boolean};
  data: () => Record<string, unknown> | undefined;
};
const fake = vi.hoisted(() => ({
  authCallbacks: [] as ((user: {uid: string} | null) => void)[],
  listeners: [] as {path: string; next: (snapshot: Snapshot) => void; error: () => void; stop: ReturnType<typeof vi.fn>}[],
  initialize: vi.fn(),
  authStops: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("@/lib/firebase/client", () => ({auth: {}, db: {}, initializeBrowserFirebase: fake.initialize}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: {uid: string} | null) => void) => {
    fake.authCallbacks.push(callback);
    callback({uid: "customer"});
    const stop = vi.fn();
    fake.authStops.push(stop);
    return stop;
  },
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => path,
  onSnapshot: (path: string, _options: unknown, next: (snapshot: Snapshot) => void, error: () => void) => {
    const stop = vi.fn();
    fake.listeners.push({path, next, error, stop});
    return stop;
  },
}));

import {bookingSignal, subscribeBookingDocument} from "@/lib/customer/bookings/booking-change-subscriptions";
import {useBookingChanges} from "@/lib/customer/bookings/use-booking-changes";

const cleanups: (() => void)[] = [];
function subscribe(path = "mainEvents/booking", uid = "customer") {
  const observer = {change: vi.fn(), error: vi.fn()};
  cleanups.push(subscribeBookingDocument(uid, path, observer));
  return observer;
}
function emit(index: number, status: string, options: {cache?: boolean; pending?: boolean; updatedAt?: number} = {}) {
  fake.listeners[index].next({
    metadata: {fromCache: !!options.cache, hasPendingWrites: !!options.pending},
    data: () => ({customerId: "customer", status, updatedAt: options.updatedAt ?? 1}),
  });
}
const booking = {
  id: "booking", realtime: {customerId: "customer", providerRequestIds: ["request-a", "request-b"]},
} as CustomerBooking;

beforeEach(() => {
  fake.listeners.length = 0;
  fake.authCallbacks.length = 0;
  fake.authStops.length = 0;
  vi.clearAllMocks();
});
afterEach(() => { cleanups.splice(0).forEach((stop) => stop()); vi.useRealTimers(); });

describe("booking document change signals", () => {
  it.each([
    ["waiting_for_down_payment", "expired"],
    ["pending", "accepted"],
    ["payment_processing", "confirmed"],
    ["confirmed", "cancelled"],
    ["in_progress", "completed"],
  ])("signals %s -> %s without deriving status", (before, after) => {
    const observer = subscribe();
    emit(0, before);
    emit(0, after);
    expect(observer.change).toHaveBeenCalledTimes(2);
    expect(observer.change).toHaveBeenLastCalledWith({statusChanged: true});
  });

  it("shares the SDK subscription and cleans up only after the last consumer", () => {
    subscribe();
    subscribe();
    expect(fake.listeners).toHaveLength(1);
    cleanups.shift()!();
    expect(fake.listeners[0].stop).not.toHaveBeenCalled();
    cleanups.shift()!();
    expect(fake.listeners[0].stop).toHaveBeenCalledOnce();
    expect(fake.authStops[0]).toHaveBeenCalledOnce();
  });

  it("ignores cached, pending-write, metadata-only and identical reconnect snapshots", () => {
    const observer = subscribe();
    emit(0, "pending", {cache: true});
    emit(0, "pending", {pending: true});
    expect(observer.change).not.toHaveBeenCalled();
    emit(0, "pending");
    emit(0, "pending");
    emit(0, "pending", {cache: true});
    emit(0, "pending");
    expect(observer.change).toHaveBeenCalledOnce();
    emit(0, "pending", {updatedAt: 2});
    expect(observer.change).toHaveBeenLastCalledWith({statusChanged: false});
  });

  it("keeps multiple provider requests independent", () => {
    const first = subscribe("providerRequests/request-a");
    const second = subscribe("providerRequests/request-b");
    emit(0, "accepted");
    expect(first.change).toHaveBeenCalledOnce();
    expect(second.change).not.toHaveBeenCalled();
  });

  it("never starts a listener for a different browser identity", () => {
    const observer = subscribe("mainEvents/booking", "another-customer");
    expect(fake.listeners).toHaveLength(0);
    expect(observer.change).not.toHaveBeenCalled();
  });

  it("unsubscribes on sign-out and does not loop after permission failure", () => {
    const observer = subscribe();
    fake.listeners[0].error();
    expect(observer.error).toHaveBeenCalledOnce();
    fake.authCallbacks[0](null);
    fake.authCallbacks[0]({uid: "customer"});
    expect(fake.listeners).toHaveLength(1);
    expect(fake.listeners[0].stop).toHaveBeenCalled();
  });

  it("deduplicates unchanged snapshots after authentication reconnects", () => {
    const observer = subscribe();
    emit(0, "pending");
    fake.authCallbacks[0](null);
    fake.authCallbacks[0]({uid: "customer"});
    emit(1, "pending");
    expect(observer.change).toHaveBeenCalledOnce();
    emit(1, "accepted");
    expect(observer.change).toHaveBeenCalledTimes(2);
  });

  it("handles absent historical fields and retains no private payload in the fingerprint", () => {
    expect(bookingSignal({status: "pending", financialLedgers: "secret"})).not.toContain("secret");
    expect(bookingSignal({status: "pending"})).toBe(bookingSignal({status: "pending", unrelated: true}));
  });
});

describe("booking refresh coordination", () => {
  it("surfaces failure without automatic retry and allows an explicit retry", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(() => useBookingChanges([booking], refresh));
    await waitFor(() => expect(fake.listeners).toHaveLength(3));
    act(() => fake.listeners[0].error());
    expect(view.result.current.unavailable).toBe(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(fake.listeners).toHaveLength(3);
    act(() => view.result.current.retry());
    await waitFor(() => expect(fake.listeners).toHaveLength(6));
    act(() => emit(3, "confirmed"));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(view.result.current.unavailable).toBe(false);
    view.unmount();
  });

  it("keeps brief tab switches connected and releases listeners after five hidden minutes", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(() => useBookingChanges([booking], refresh));
    await waitFor(() => expect(fake.listeners).toHaveLength(3));
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(60_000));
    fake.listeners.forEach((listener) => expect(listener.stop).not.toHaveBeenCalled());
    act(() => vi.advanceTimersByTime(240_000));
    fake.listeners.forEach((listener) => expect(listener.stop).toHaveBeenCalledOnce());
    hidden.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(fake.listeners).toHaveLength(6);
    view.unmount();
    hidden.mockRestore();
  });

  it("coalesces parent/request notifications and serializes changes arriving during refresh", async () => {
    let release!: () => void;
    const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; })).mockResolvedValue(undefined);
    const view = renderHook(() => useBookingChanges([booking], refresh));
    await waitFor(() => expect(fake.listeners).toHaveLength(3));
    act(() => { emit(0, "pending"); emit(1, "pending"); emit(2, "pending"); });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    act(() => emit(1, "accepted"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => release());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    view.unmount();
    fake.listeners.forEach((listener) => expect(listener.stop).toHaveBeenCalledOnce());
  });

  it("defers refresh during checkout and retains a pending change", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(({blocked}) => useBookingChanges([booking], refresh, blocked), {initialProps: {blocked: true}});
    await waitFor(() => expect(fake.listeners).toHaveLength(3));
    act(() => emit(0, "expired"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(refresh).not.toHaveBeenCalled();
    view.rerender({blocked: false});
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    view.unmount();
  });

  it("replaces subscriptions when the displayed page changes and skips legacy missing scope", async () => {
    const refresh = vi.fn();
    const view = renderHook(({bookings}) => useBookingChanges(bookings, refresh), {initialProps: {bookings: [booking]}});
    await waitFor(() => expect(fake.listeners).toHaveLength(3));
    view.rerender({bookings: [{id: "legacy"} as CustomerBooking]});
    fake.listeners.forEach((listener) => expect(listener.stop).toHaveBeenCalledOnce());
    expect(refresh).not.toHaveBeenCalled();
    view.unmount();
  });
});
