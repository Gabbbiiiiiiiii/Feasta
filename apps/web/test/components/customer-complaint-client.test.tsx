import {FirebaseError} from "firebase/app";
import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({call: vi.fn(), callable: vi.fn(), appCheck: vi.fn(),
  auth: {authStateReady: vi.fn(), currentUser: {uid: "customer_owned"} as {uid: string} | null}}));
vi.mock("firebase/functions", () => ({httpsCallable: mocks.callable}));
vi.mock("@/lib/firebase/client", () => ({auth: mocks.auth, functions: {}, initializeBrowserAppCheck: mocks.appCheck}));
import {submitCustomerBookingComplaint} from "@/lib/customer/bookings/customer-complaint-client";
const input = {providerRequestId: "request_owned", category: "service_quality", description: "  The service did not match our agreement.  "};
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.currentUser = {uid: "customer_owned"}; mocks.callable.mockReturnValue(mocks.call);
  mocks.call.mockResolvedValue({data: {success: true, complaintId: "complaint_" + "a".repeat(32), created: true, idempotentReplay: false}});
});
it("sends only the target and normalized content to the existing callable", async () => {
  expect(await submitCustomerBookingComplaint(input)).toEqual({created: true});
  expect(mocks.callable).toHaveBeenCalledWith({}, "createComplaint", {timeout: 30_000});
  expect(mocks.call).toHaveBeenCalledWith({providerRequestId: "request_owned", category: "service_quality", description: input.description.trim()});
  expect(mocks.appCheck).toHaveBeenCalledOnce();
});
it("requires authentication and valid content before invoking Firebase", async () => {
  mocks.auth.currentUser = null; await expect(submitCustomerBookingComplaint(input)).rejects.toThrow("sign in");
  mocks.auth.currentUser = {uid: "customer_owned"};
  await expect(submitCustomerBookingComplaint({...input, description: "short"})).rejects.toThrow("10 to 4,000");
  await expect(submitCustomerBookingComplaint({...input, category: "unsupported"})).rejects.toThrow("category");
  expect(mocks.call).not.toHaveBeenCalled();
});
it("handles replay success, authorization errors and malformed responses", async () => {
  mocks.call.mockResolvedValueOnce({data: {success: true, complaintId: "complaint_" + "b".repeat(32), created: false, idempotentReplay: true}});
  expect(await submitCustomerBookingComplaint(input)).toEqual({created: false});
  mocks.call.mockRejectedValueOnce(new FirebaseError("functions/permission-denied", "internal"));
  await expect(submitCustomerBookingComplaint(input)).rejects.toThrow("unavailable for reporting");
  mocks.call.mockResolvedValueOnce({data: {success: true}});
  await expect(submitCustomerBookingComplaint(input)).rejects.toThrow("could not be confirmed");
});
