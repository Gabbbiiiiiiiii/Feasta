import {expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({page: vi.fn(async () => ({bookings: [], nextCursor: null, hasMore: false, skippedMalformedCount: 0}))}));
vi.mock("@/lib/provider/bookings/provider-booking-service", () => ({getProviderBookingPage: mocks.page}));
vi.mock("@/app/provider/bookings/provider-bookings-client", () => ({ProviderBookingsClient: () => null}));
import Page from "@/app/provider/bookings/page";
it.each([
  [{}, "upcoming", "all"],
  [{dashboard: "upcoming"}, "upcoming", "all"],
  [{dashboard: "payment"}, "waiting_payment", "all"],
  [{dashboard: "completed"}, "past", "completed"],
  [{status: "accepted"}, "waiting_payment", "all"],
  [{status: "cancelled"}, "past", "cancelled"],
  [{status: "all", search: "Ana", secondary: "refunded"}, "all", "refunded"],
] as const)("preserves route selection %j", async (params, status, secondary) => {
  await Page({searchParams: Promise.resolve(params)});
  expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({status, secondary, cursor: null}));
});
it("preserves an individual dashboard booking deep link", async () => {
  const element = await Page({searchParams: Promise.resolve({request: "request_test"})});
  expect(element.props.initialRequestId).toBe("request_test");
});
