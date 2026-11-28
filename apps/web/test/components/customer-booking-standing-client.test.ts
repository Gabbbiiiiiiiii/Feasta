import {beforeEach, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {authStateReady: vi.fn(async () => {}), currentUser: {uid: "customer-a"} as {uid: string} | null},
  callable: vi.fn(), call: vi.fn(), appCheck: vi.fn(),
}));
vi.mock("firebase/functions", () => ({httpsCallable: mocks.callable}));
vi.mock("@/lib/firebase/client", () => ({auth: mocks.auth, functions: {}, initializeBrowserAppCheck: mocks.appCheck}));
import {loadCustomerBookingStanding} from "@/lib/customer/bookings/customer-booking-standing-client";

const clear = {activeCount: 0, status: "clear", restrictionExpiresAt: null, serverTime: "2026-11-14T03:00:00Z"};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = {uid: "customer-a"};
  mocks.callable.mockReturnValue(mocks.call);
  mocks.call.mockResolvedValue({data: clear});
});
it("calls only the customer endpoint without accepting a customer ID", async () => {
  await expect(loadCustomerBookingStanding()).resolves.toEqual(clear);
  expect(mocks.callable).toHaveBeenCalledWith({}, "getCustomerBookingStanding");
  expect(mocks.call).toHaveBeenCalledWith({});
  expect(mocks.appCheck).toHaveBeenCalledOnce();
});
it("requires a signed-in user", async () => {
  mocks.auth.currentUser = null;
  await expect(loadCustomerBookingStanding()).rejects.toThrow(/Sign in/);
  expect(mocks.call).not.toHaveBeenCalled();
});
it.each([
  null, {}, {...clear, status: "unknown"}, {...clear, activeCount: 1},
  {...clear, serverTime: "invalid"}, {...clear, restrictionExpiresAt: "invalid"},
  {...clear, status: "warning", activeCount: 2}, {...clear, status: "final_warning", activeCount: 1},
])("rejects malformed or inconsistent status %j", async data => {
  mocks.call.mockResolvedValue({data});
  await expect(loadCustomerBookingStanding()).rejects.toThrow(/unavailable/);
});
it("propagates failed status reads instead of synthesizing clear standing", async () => {
  mocks.call.mockRejectedValue(new Error("offline"));
  await expect(loadCustomerBookingStanding()).rejects.toThrow("offline");
});
