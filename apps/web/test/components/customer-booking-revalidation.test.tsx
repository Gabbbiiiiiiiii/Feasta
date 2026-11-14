import {beforeEach, expect, it, vi} from "vitest";
import type {CustomerBookingFilters} from "@/lib/customer/bookings/customer-booking-types";

const mocks = vi.hoisted(() => ({
  requireCustomer: vi.fn(), getAll: vi.fn(), doc: vi.fn((id: string) => id),
}));
vi.mock("@/lib/auth/session", () => ({requireCustomer: mocks.requireCustomer}));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {getAll: mocks.getAll, collection: () => ({doc: mocks.doc})},
}));
import {revalidateVisibleCustomerBookings} from "@/lib/customer/bookings/customer-booking-service";

const filters: CustomerBookingFilters = {search: "", status: "all", pageSize: 10, cursor: "retained-cursor"};
function document(id: string, customerId = "customer", overrides: Record<string, unknown> = {}) {
  return {id, exists: true, data: () => ({customerId, status: "pending_provider_approval", bookingCode: "FEA-1", ...overrides})};
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCustomer.mockResolvedValue({uid: "customer"});
  mocks.getAll.mockResolvedValue([document("booking")]);
});

it("revalidates only explicit visible IDs even when search is active", async () => {
  const result = await revalidateVisibleCustomerBookings(["booking"], {...filters, search: "FEA"}, false);
  expect(mocks.requireCustomer).toHaveBeenCalledOnce();
  expect(mocks.getAll).toHaveBeenCalledExactlyOnceWith("booking");
  expect(result.bookings.map((booking) => booking.id)).toEqual(["booking"]);
  expect(result.statistics).toBeUndefined();
  expect(result.bookings[0].realtime).toEqual({customerId: "customer", providerRequestIds: []});
});

it("does not expose other customers, deleted, or missing bookings", async () => {
  mocks.getAll.mockResolvedValue([
    document("other", "another-customer"), document("deleted", "customer", {isDeleted: true}),
    {id: "missing", exists: false, data: () => undefined},
  ]);
  const result = await revalidateVisibleCustomerBookings(["other", "deleted", "missing"], filters, false);
  expect(result.bookings).toEqual([]);
});

it("keeps search/status filters authoritative and does not backfill from history", async () => {
  mocks.getAll.mockResolvedValue([document("booking", "customer", {status: "expired"})]);
  const result = await revalidateVisibleCustomerBookings(["booking"], {...filters, status: "completed"}, false);
  expect(result.bookings).toEqual([]);
  expect(mocks.getAll).toHaveBeenCalledOnce();
});

it("bounds, validates and deduplicates requested IDs", async () => {
  await revalidateVisibleCustomerBookings(["bad/path", "booking", "booking", "second", "third"], {...filters, pageSize: 2}, false);
  expect(mocks.getAll).toHaveBeenCalledExactlyOnceWith("booking", "second");
});

it("requires the trusted session before reading", async () => {
  mocks.requireCustomer.mockRejectedValueOnce(new Error("unauthorized"));
  await expect(revalidateVisibleCustomerBookings(["booking"], filters, false)).rejects.toThrow("unauthorized");
  expect(mocks.getAll).not.toHaveBeenCalled();
});
