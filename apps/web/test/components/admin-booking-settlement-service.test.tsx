import {beforeEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({records: {} as Record<string, Record<string, unknown>>}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: vi.fn()}));
function snapshot(name: string, id: string) {const data = state.records[name + "/" + id]; return {id, exists: Boolean(data), data: () => data};}
function query(name: string, conditions: [unknown, string, unknown][] = []) {
  const result = {
    doc: (id: string) => ({name, id, get: async () => snapshot(name, id)}),
    where: (field: unknown, operator: string, value: unknown) => query(name, [...conditions, [field, operator, value]]),
    orderBy: () => result, limit: () => result, select: () => result,
    count: () => ({get: async () => ({data: () => ({count: 1})})}),
    aggregate: () => ({get: async () => ({data: () => ({amount: 2500})})}),
    get: async () => {
      const docs = Object.keys(state.records).filter(key => key.startsWith(name + "/")).map(key => snapshot(name, key.split("/")[1])).filter(doc => conditions.every(([field, operator, value]) => {
        if (typeof field !== "string") return true;
        return operator === "in" ? Array.isArray(value) && value.includes(doc.data()?.[field]) : doc.data()?.[field] === value;
      }));
      return {docs, size: docs.length};
    },
  }; return result;
}
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: (name: string) => query(name), getAll: async (...refs: {name: string; id: string}[]) => refs.map(ref => snapshot(ref.name, ref.id)),
}}));
import {getAdminBookingPage} from "@/lib/admin/bookings/admin-booking-service";
beforeEach(() => {state.records = {
  "mainEvents/event_test": {mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test", status: "confirmed", paymentStatus: "unpaid", totalAmount: 5000, providerRequestIds: ["request_test"]},
  "providerRequests/request_test": {mainEventId: "event_test", providerId: "provider_test", customerId: "customer_test", status: "confirmed", paymentStatus: "paid", amount: 5000,
    settlementSchemaVersion: 1, settlementStatus: "deposit_settled", grossSettledAmountInCentavos: 250000, outstandingAmountInCentavos: 250000, financialSnapshot: {grossAmountInCentavos: 500000}},
  "payments/payment_test": {mainEventId: "event_test", providerRequestId: "request_test", status: "paid", amount: 2500, amountInCentavos: 250000},
  "providers/provider_test": {businessName: "Test provider"},
};});
const load = async () => (await getAdminBookingPage({search: "", status: "all", paymentStatus: "all", date: "all", sortField: "createdAt", sortDirection: "descending", pageSize: 10}, {freshStatistics: true})).bookings[0];
it("Admin booking projects a canonical deposit as partially paid despite legacy states", async () => {
  expect(await load()).toMatchObject({paymentStatus: "partially_paid", providerRequests: [{paymentStatus: "partially_paid"}]});
});
it("malformed canonical settlement does not fall back to legacy paid", async () => {
  state.records["providerRequests/request_test"].outstandingAmountInCentavos = 0;
  expect(await load()).toMatchObject({paymentStatus: "unavailable", providerRequests: [{paymentStatus: null}]});
});
