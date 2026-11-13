import {beforeEach, describe, expect, it, vi} from "vitest";
import {FirebaseError} from "firebase/app";

const mocks = vi.hoisted(() => ({
  auth: {currentUser: {uid: "customer-a"} as {uid: string} | null, authStateReady: vi.fn(async () => {})},
  submit: vi.fn(), reconcile: vi.fn(), appCheck: vi.fn(),
}));
vi.mock("@/lib/firebase/client", () => ({auth: mocks.auth, functions: {}, initializeBrowserAppCheck: mocks.appCheck}));
vi.mock("firebase/functions", () => ({httpsCallable: (_: unknown, name: string) => name === "submitBookingRequest" ? mocks.submit : mocks.reconcile}));

import {reconcileCustomerBookingSubmission, submitCustomerBookingRequest, type SubmitBookingRequestInput} from "@/lib/customer/bookings/customer-booking-submission-client";

const result = {bookingId: "booking_existing", mainEventId: "booking_existing", providerRequestIds: ["provider_request"], created: true};
const recovered = {...result, created: false};
const options = {customerId: "customer-a"};
const key = "feasta:booking-submission:v1:customer-a";
function input(kind: "per-pax" | "fixed" | "custom-menu"): SubmitBookingRequestInput {
  const base = {clientRequestId: "booking-original", providerId: "provider-one", eventType: "wedding",
    eventDate: "2027-09-20", eventTime: "18:00", eventLocation: "Ormoc", eventAddress: "Ballroom, Ormoc",
    addonIds: [], willArrangeOwnAddOns: false,
    policyAcknowledgements: [{providerId: "provider-one", effectivePolicyKey: "policy-v4"}],
    agreementAcknowledgements: [{providerId: "provider-one", agreementKey: "agreement-v2"}]};
  return kind === "custom-menu" ? {...base, cateringSelectionType: "custom_menu", menuSelections: [{menuItemId: "chicken", servingOptionId: "tray"}]} :
    {...base, packageId: kind, sharedContractVersion: 2, expectedPackageRevision: 7, guestCount: 100,
      eventEndTime: "22:00", selectedFoods: [], selectedDecorations: [], selectedFurniture: [],
      ...(kind === "per-pax" ? {serviceTier: "drop_off" as const, foodChoiceSelections: [{groupId: "main", optionIds: ["chicken"]}]} : {})};
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.auth.currentUser = {uid: "customer-a"};
  mocks.submit.mockResolvedValue({data: result});
  mocks.reconcile.mockResolvedValue({data: {clientRequestId: "booking-original", outcome: "unresolved"}});
  let locked = false;
  vi.stubGlobal("navigator", {locks: {request: async (_name: string, _options: unknown, run: (lock: object | null) => Promise<unknown>) => {
    if (locked) return run(null);
    locked = true;
    try { return await run({}); } finally { locked = false; }
  }}});
});

describe.each(["per-pax", "fixed", "custom-menu"] as const)("%s reconciliation compatibility", kind => {
  it("preserves successful payload, both acknowledgments, and prevents duplicate dispatch", async () => {
    const payload = input(kind);
    await expect(submitCustomerBookingRequest(payload, options)).resolves.toEqual(result);
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(payload);
    await expect(submitCustomerBookingRequest(payload, options)).resolves.toEqual(result);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it.each(["timeout", "interrupted response", "invalid response"])("persists %s and blocks changed selections across a module reload", async failure => {
    if (failure === "invalid response") mocks.submit.mockResolvedValueOnce({data: {}});
    else mocks.submit.mockRejectedValueOnce(failure === "timeout" ? new FirebaseError("functions/deadline-exceeded", "timeout") : new Error("interrupted"));
    await expect(submitCustomerBookingRequest(input(kind), options)).rejects.toThrow();
    expect(JSON.parse(localStorage.getItem(key)!).active).toBe("booking-original");
    vi.resetModules();
    const restored = await import("@/lib/customer/bookings/customer-booking-submission-client");
    await expect(restored.submitCustomerBookingRequest({...input(kind), clientRequestId: "booking-changed", eventDate: "2027-10-20"}, options)).rejects.toThrow("Check Previous Request");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    await expect(restored.reconcileCustomerBookingSubmission(options.customerId)).resolves.toEqual({outcome: "unresolved"});
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith({clientRequestId: "booking-original"});
    expect(JSON.parse(localStorage.getItem(key)!).active).toBe("booking-original");
  });

  it("recovers confirmed creation without a second submit", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("interrupted"));
    await expect(submitCustomerBookingRequest(input(kind), options)).rejects.toThrow();
    mocks.reconcile.mockResolvedValueOnce({data: {clientRequestId: "booking-original", outcome: "confirmed_created", booking: recovered}});
    await expect(reconcileCustomerBookingSubmission(options.customerId)).resolves.toEqual({outcome: "confirmed_created", booking: recovered});
    await expect(submitCustomerBookingRequest(input(kind), options)).resolves.toEqual(recovered);
    await expect(submitCustomerBookingRequest({...input(kind), clientRequestId: "new-id-after-refresh"}, options)).resolves.toEqual(recovered);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("retains confirmed rejection and requires an explicit fresh attempt with a new ID", async () => {
    mocks.submit.mockRejectedValueOnce(new FirebaseError("functions/failed-precondition", "policy changed"));
    await expect(submitCustomerBookingRequest(input(kind), options)).rejects.toThrow();
    // An error code alone never authorizes a new request.
    await expect(submitCustomerBookingRequest(input(kind), {...options, freshAttempt: true})).rejects.toThrow("Check Previous Request");
    mocks.reconcile.mockResolvedValueOnce({data: {clientRequestId: "booking-original", outcome: "confirmed_rejected"}});
    await expect(reconcileCustomerBookingSubmission(options.customerId)).resolves.toEqual({outcome: "confirmed_rejected"});
    await expect(submitCustomerBookingRequest(input(kind), options)).rejects.toThrow("Check Previous Request");
    await submitCustomerBookingRequest(input(kind), {...options, freshAttempt: true});
    const fresh = mocks.submit.mock.calls[1][0];
    expect(fresh.clientRequestId).not.toBe("booking-original");
    expect({...fresh, clientRequestId: "booking-original"}).toEqual(input(kind));
    expect(JSON.parse(localStorage.getItem(key)!).outcomes["booking-original"]).toEqual({outcome: "confirmed_rejected"});
    await submitCustomerBookingRequest(input(kind), options);
    expect(mocks.submit).toHaveBeenCalledTimes(2);
  });

  it("blocks account switching and never reconciles the other customer's request", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("interrupted"));
    await expect(submitCustomerBookingRequest(input(kind), options)).rejects.toThrow();
    const evidence = localStorage.getItem(key);
    mocks.auth.currentUser = {uid: "customer-b"};
    await expect(submitCustomerBookingRequest(input(kind), options)).rejects.toThrow("account changed");
    await expect(reconcileCustomerBookingSubmission("customer-a")).rejects.toThrow("account changed");
    await expect(reconcileCustomerBookingSubmission("customer-b")).rejects.toThrow("No previous request");
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(evidence);
  });
});

it("adopts a historical package draft ID without submitting or interpreting absence as rejection", async () => {
  await expect(submitCustomerBookingRequest(input("fixed"), {...options, restoredRequestId: "booking-original"})).rejects.toThrow("Check Previous Request");
  await expect(reconcileCustomerBookingSubmission("customer-a")).resolves.toEqual({outcome: "unresolved"});
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("fails closed on unavailable persistence, malformed evidence, or unsupported browser locking", async () => {
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  await expect(submitCustomerBookingRequest(input("fixed"), options)).rejects.toThrow("storage unavailable");
  expect(mocks.submit).not.toHaveBeenCalled(); storage.mockRestore();
  localStorage.setItem(key, "{}");
  await expect(submitCustomerBookingRequest(input("fixed"), options)).rejects.toThrow("evidence");
  vi.stubGlobal("navigator", {});
  await expect(submitCustomerBookingRequest(input("fixed"), options)).rejects.toThrow("Web Locks");
});

it("rejects simultaneous submissions and account changes during a response", async () => {
  let finish!: (value: unknown) => void;
  mocks.submit.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const pending = submitCustomerBookingRequest(input("fixed"), options);
  await vi.waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
  await expect(submitCustomerBookingRequest(input("custom-menu"), options)).rejects.toThrow("already in progress");
  mocks.auth.currentUser = {uid: "customer-b"}; finish({data: result});
  await expect(pending).rejects.toThrow("account changed");
  expect(JSON.parse(localStorage.getItem(key)!).active).toBe("booking-original");
});

it.each([
  {clientRequestId: "foreign", outcome: "confirmed_rejected"},
  {clientRequestId: "booking-original", outcome: "confirmed_created", booking: {...recovered, mainEventId: "foreign"}},
  {clientRequestId: "booking-original", outcome: "confirmed_created", booking: result},
  null,
])("preserves original evidence on invalid recovery responses", async data => {
  mocks.submit.mockRejectedValueOnce(new Error("interrupted"));
  await expect(submitCustomerBookingRequest(input("fixed"), options)).rejects.toThrow();
  mocks.reconcile.mockResolvedValueOnce({data});
  await expect(reconcileCustomerBookingSubmission("customer-a")).rejects.toThrow();
  expect(JSON.parse(localStorage.getItem(key)!).active).toBe("booking-original");
});
