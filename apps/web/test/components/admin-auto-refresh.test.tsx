import {act, renderHook} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {useAdminAutoRefresh} from "@/lib/admin/use-admin-auto-refresh";

let visibility = "visible";
beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility as DocumentVisibilityState);
});
afterEach(() => vi.useRealTimers());
const advance = async (ms = 5_000) => act(async () => {await vi.advanceTimersByTimeAsync(ms);});

it("uses initial server data without a duplicate read, then refreshes every five seconds", async () => {
  const read = vi.fn(async () => {});
  renderHook(() => useAdminAutoRefresh(read, "filters"));
  expect(read).not.toHaveBeenCalled();
  await advance(4_999);
  expect(read).not.toHaveBeenCalled();
  await advance(1);
  expect(read).toHaveBeenCalledTimes(1);
  await advance();
  expect(read).toHaveBeenCalledTimes(2);
});

it("pauses hidden tabs and immediately refreshes when visible again", async () => {
  const read = vi.fn(async () => {});
  renderHook(() => useAdminAutoRefresh(read, "filters"));
  visibility = "hidden";
  await advance(15_000);
  expect(read).not.toHaveBeenCalled();
  visibility = "visible";
  await act(async () => {document.dispatchEvent(new Event("visibilitychange"));});
  expect(read).toHaveBeenCalledTimes(1);
});

it("prevents overlapping background requests", async () => {
  let finish!: () => void;
  const read = vi.fn(() => new Promise<void>(resolve => {finish = resolve;}));
  renderHook(() => useAdminAutoRefresh(read, "filters"));
  await advance();
  await advance(20_000);
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => {finish();});
  await advance();
  expect(read).toHaveBeenCalledTimes(2);
});

it("suppresses stale results when filters or a mutation change during a read", async () => {
  let current!: () => boolean;
  let finish!: () => void;
  const read = vi.fn((isCurrent: () => boolean) => {
    current = isCurrent;
    return new Promise<void>(resolve => {finish = resolve;});
  });
  const {rerender} = renderHook(({scope, paused}) => useAdminAutoRefresh(read, scope, paused),
    {initialProps: {scope: "payment:paid", paused: false}});
  await advance();
  expect(current()).toBe(true);
  rerender({scope: "payment:refunded", paused: false});
  expect(current()).toBe(false);
  await act(async () => {finish();});
  await advance();
  expect(current()).toBe(true);
  rerender({scope: "payment:refunded", paused: true});
  expect(current()).toBe(false);
});

it("retains data on failure and retries silently on the next tick", async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  renderHook(() => useAdminAutoRefresh(read, "filters"));
  await advance();
  await advance();
  expect(read).toHaveBeenCalledTimes(2);
});

it("cleans up timers, listeners and late results on unmount", async () => {
  let current!: () => boolean;
  const read = vi.fn(async (isCurrent: () => boolean) => {current = isCurrent;});
  const {unmount} = renderHook(() => useAdminAutoRefresh(read, "filters"));
  await advance();
  unmount();
  expect(current()).toBe(false);
  await advance(15_000);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(read).toHaveBeenCalledTimes(1);
});

it("waits for an existing request then reads immediately after a mutation", async () => {
  let finish!: () => void;
  const checks: (() => boolean)[] = [];
  const read = vi.fn((isCurrent: () => boolean) => {
    checks.push(isCurrent);
    if (checks.length > 1) return Promise.resolve();
    return new Promise<void>(resolve => {finish = resolve;});
  });
  const {result} = renderHook(() => useAdminAutoRefresh(read, "filters"));
  await advance();
  let refresh!: Promise<void>;
  act(() => {refresh = result.current(true);});
  expect(checks[0]()).toBe(false);
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => {finish(); await refresh;});
  expect(read).toHaveBeenCalledTimes(2);
});
