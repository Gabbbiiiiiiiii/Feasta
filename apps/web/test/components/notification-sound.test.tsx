import {act, renderHook} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {useNotificationSound} from "@/lib/notifications/use-notification-sound";
import type {FeastaNotification} from "@/lib/notifications/notification-types";

const start = vi.fn();
let context: {state: string; currentTime: number; destination: object; resume: ReturnType<typeof vi.fn>; suspend: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; createOscillator: ReturnType<typeof vi.fn>; createGain: ReturnType<typeof vi.fn>};
beforeEach(() => {
  vi.clearAllMocks();
  context = {state: "suspended", currentTime: 0, destination: {}, resume: vi.fn(async () => {context.state = "running";}), suspend: vi.fn(async () => {context.state = "suspended";}), close: vi.fn(async () => {}), createOscillator: vi.fn(() => ({frequency: {value: 0}, connect: vi.fn(), disconnect: vi.fn(), start, stop: vi.fn()})), createGain: vi.fn(() => ({gain: {setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn()}, connect: vi.fn(), disconnect: vi.fn()}))};
  vi.stubGlobal("AudioContext", class {constructor() {return context;}});
});
afterEach(() => vi.unstubAllGlobals());
const item = (id: string, isRead = false) => ({id, isRead} as FeastaNotification);

it.each(["customer", "provider", "admin"])("rings only for new unread %s notifications after enabling sound", async (role) => {
  const {result, unmount} = renderHook(() => useNotificationSound(role));
  act(() => result.current.observe([item("old")]));
  expect(start).not.toHaveBeenCalled();
  await act(() => result.current.toggle());
  expect(result.current.enabled).toBe(true);
  start.mockClear();
  act(() => result.current.observe([item("old")]));
  expect(start).not.toHaveBeenCalled();
  act(() => result.current.observe([item("new"), item("old")]));
  expect(start).toHaveBeenCalledTimes(2);
  act(() => result.current.observe([item("new", true), item("old")]));
  expect(start).toHaveBeenCalledTimes(2);
  await act(() => result.current.toggle());
  act(() => result.current.observe([item("muted"), item("new", true)]));
  expect(start).toHaveBeenCalledTimes(2);
  unmount(); expect(context.close).toHaveBeenCalled();
});

it("handles unavailable browser audio without breaking notifications", async () => {
  vi.stubGlobal("AudioContext", undefined);
  const {result} = renderHook(() => useNotificationSound("customer"));
  await act(() => result.current.toggle());
  expect(result.current.unavailable).toBe(true);
  expect(result.current.enabled).toBe(false);
});
