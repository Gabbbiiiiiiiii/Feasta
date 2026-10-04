import {beforeEach, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  call: vi.fn(), callable: vi.fn(), appCheck: vi.fn(),
  auth: {currentUser: {uid: "admin"} as {uid: string} | null},
  functions: {},
}));
vi.mock("firebase/functions", () => ({httpsCallable: mocks.callable}));
vi.mock("@/lib/firebase/client", () => ({
  auth: mocks.auth, functions: mocks.functions, initializeBrowserAppCheck: mocks.appCheck,
}));

import {reconcileCancellationRefund} from "@/lib/admin/cancellations/admin-cancellation-client";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = {uid: "admin"};
  mocks.callable.mockReturnValue(mocks.call);
});

it("calls the authenticated reconciliation callable with only the cancellation ID", async () => {
  const result = {cancellationRequestId: "cancellation_12345678", refundOperationId: "refund_123",
    status: "completed", gatewayStatus: "succeeded", reconciliationRequired: false, idempotentReplay: true};
  mocks.call.mockResolvedValue({data: result});
  expect(await reconcileCancellationRefund(" cancellation_12345678 ")).toEqual(result);
  expect(mocks.appCheck).toHaveBeenCalledOnce();
  expect(mocks.callable).toHaveBeenCalledExactlyOnceWith(
    mocks.functions, "reconcileProviderRequestRefund", {timeout: 30_000},
  );
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith({cancellationRequestId: "cancellation_12345678"});
  expect(Object.keys(mocks.call.mock.calls[0][0])).toEqual(["cancellationRequestId"]);
});

it("requires an authenticated session before contacting Functions", async () => {
  mocks.auth.currentUser = null;
  await expect(reconcileCancellationRefund("cancellation_12345678")).rejects.toThrow(/session has expired/u);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it("rejects invalid cancellation IDs before contacting Functions", () => {
  expect(() => reconcileCancellationRefund("bad/id")).toThrow();
  expect(mocks.callable).not.toHaveBeenCalled();
});
