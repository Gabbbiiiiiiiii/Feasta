import {beforeEach, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({records: {} as Record<string, Record<string, unknown>>}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: async () => ({providerId: "provider_test"})}));
function snapshot(name: string, id: string) {
  const data = state.records[name + "/" + id];
  return {id, exists: Boolean(data), data: () => data};
}
function query(name: string) {
  const result = {
    doc: (id: string) => ({name, id, get: async () => snapshot(name, id)}),
    where: () => result, orderBy: () => result, limit: () => result,
    count: () => ({get: async () => ({data: () => ({count: 1})})}),
    get: async () => ({docs: Object.keys(state.records).filter(key => key.startsWith(name + "/")).map(key => snapshot(name, key.split("/")[1]))}),
  };
  return result;
}
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: (name: string) => query(name),
  getAll: async (...refs: {name: string; id: string}[]) => refs.map(ref => snapshot(ref.name, ref.id)),
}}));
import {getProviderBooking, getProviderBookingPage} from "@/lib/provider/bookings/provider-booking-service";
beforeEach(() => {
  state.records = {
    "providerRequests/request_test": {providerRequestId: "request_test", mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test", providerId: "provider_test",
      type: "catering", status: "confirmed", amount: 5000, paymentId: "payment_test", paymentStatus: "paid", downPaymentAmount: 2500,
      eventDate: new Date("2020-10-16T00:00:00+08:00"), eventTime: "07:21", createdAt: new Date("2020-01-01"),
      settlementSchemaVersion: 1, settlementStatus: "deposit_settled", initialPaymentChoice: "minimum", initialPaymentId: "payment_test",
      grossSettledAmountInCentavos: 250000, outstandingAmountInCentavos: 250000,
      financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 500000, remainingBalanceInCentavos: 250000}},
    "mainEvents/event_test": {mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test", status: "confirmed", providerRequestIds: ["request_test"]},
    "payments/payment_test": {paymentId: "payment_test", providerRequestId: "request_test", mainEventId: "event_test", customerId: "customer_test", providerId: "provider_test",
      amount: 2500, amountInCentavos: 250000, currency: "PHP", status: "paid", paymentType: "provider_down_payment", gateway: "paymongo"},
  };
});
it("list and detail distinguish a paid deposit transaction from a partially paid booking", async () => {
  for (const booking of [await getProviderBooking("request_test"), (await getProviderBookingPage()).bookings[0]]) {
    expect(booking).toMatchObject({paymentStatus: "partially_paid", remainingBalance: 2500, payment: {status: "paid"}, canStartEvent: false});
  }
});
it("malformed canonical money fails closed despite a paid legacy transaction", async () => {
  state.records["providerRequests/request_test"].grossSettledAmountInCentavos = 500000;
  expect(await getProviderBooking("request_test")).toMatchObject({paymentStatus: null, remainingBalance: null, canStartEvent: false});
});
it("completed refunds and cancelled bookings do not reopen customer debt", async () => {
  state.records["providerRequests/request_test"].status = "cancelled";
  state.records["payments/payment_test"].status = "refunded";
  expect(await getProviderBooking("request_test")).toMatchObject({remainingBalance: 0, canStartEvent: false});
});
it("a fully settled booking can start only once its scheduled time is reached", async () => {
  Object.assign(state.records["providerRequests/request_test"], {settlementStatus: "fully_settled", grossSettledAmountInCentavos: 500000, outstandingAmountInCentavos: 0, remainingBalancePaymentId: "balance_test"});
  expect((await getProviderBooking("request_test")).canStartEvent).toBe(true);
  state.records["providerRequests/request_test"].eventDate = new Date("2099-10-16T00:00:00+08:00");
  expect((await getProviderBooking("request_test")).canStartEvent).toBe(false);
});
it("an active cancellation or invalid settlement schema hides Start Event", async () => {
  const request = state.records["providerRequests/request_test"];
  Object.assign(request, {settlementStatus: "fully_settled", grossSettledAmountInCentavos: 500000, outstandingAmountInCentavos: 0, remainingBalancePaymentId: "balance_test", activeCancellationRequestId: "cancel_test"});
  expect((await getProviderBooking("request_test")).canStartEvent).toBe(false);
  delete request.activeCancellationRequestId;
  request.settlementSchemaVersion = 2;
  expect((await getProviderBooking("request_test")).canStartEvent).toBe(false);
});
