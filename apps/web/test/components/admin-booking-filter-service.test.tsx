import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {Timestamp} from "firebase-admin/firestore";
import type {AdminBookingFilters} from "@/lib/admin/bookings/admin-booking-types";
import {adminBookingStatusLabels, adminBookingPaymentLabels} from "@/lib/admin/bookings/admin-booking-labels";

const state = vi.hoisted(() => ({queries: [] as {collection: string; conditions: unknown[][]; mode: string; orders: unknown[][]; cursor: unknown[]}[]}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: vi.fn()}));
vi.mock("@/lib/firebase/admin", () => {
  class Query {
    conditions: unknown[][] = [];
    orders: unknown[][] = [];
    cursor: unknown[] = [];
    mode = "list";
    constructor(public collection: string) {}
    copy() {const next = new Query(this.collection); Object.assign(next, this); next.conditions = [...this.conditions]; next.orders = [...this.orders]; return next;}
    where(...condition: unknown[]) {const next = this.copy(); next.conditions.push(condition); return next;}
    orderBy(...order: unknown[]) {const next = this.copy(); next.orders.push(order); return next;}
    startAfter(...cursor: unknown[]) {const next = this.copy(); next.cursor = cursor; return next;}
    limit() {return this;}
    select() {return this;}
    count() {const next = this.copy(); next.mode = "count"; return next;}
    aggregate() {const next = this.copy(); next.mode = "sum"; return next;}
    async get() {
      state.queries.push(this);
      const paid = this.conditions.some((condition) => condition[2] === "paid");
      const refunded = this.conditions.some((condition) => condition[2] === "refunded");
      return {
        docs: [],
        size: 0,
        data: () => ({
          count: 0,
          amount: paid ? 26000 : 5000,
          gross: paid ? 26000 : refunded ? 5000 : 0,
          refunded: 0,
        }),
      };
    }
  }
  return {adminDb: {collection: (name: string) => new Query(name)}};
});
import {getAdminBookingPage} from "@/lib/admin/bookings/admin-booking-service";

const filters: AdminBookingFilters = {search: "", status: "all", paymentStatus: "all", date: "all", sortField: "createdAt", sortDirection: "descending", pageSize: 10, cursor: null};
beforeEach(() => {state.queries.length = 0; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T02:00:00Z"));});
afterEach(() => vi.useRealTimers());
const list = () => state.queries.find(q => q.collection === "mainEvents" && q.mode === "list")!;

it.each(Object.keys(adminBookingStatusLabels))("queries the exact booking status %s", async status => {
  await getAdminBookingPage({...filters, status: status as AdminBookingFilters["status"]});
  expect(list().conditions).toContainEqual(["status", "==", status]);
});

it.each(Object.keys(adminBookingPaymentLabels).filter(value => value !== "partially_refunded"))(
  "queries the persisted booking payment status %s", async paymentStatus => {
    await getAdminBookingPage({...filters, paymentStatus: paymentStatus as AdminBookingFilters["paymentStatus"]});
    expect(list().conditions).toContainEqual(["paymentStatus", "==", paymentStatus]);
  },
);

it.each([
  ["all", null, null],
  ["today", "2026-10-05T16:00:00.000Z", "2026-10-06T16:00:00.000Z"],
  ["upcoming", "2026-10-06T02:00:00.000Z", null],
  ["past", null, "2026-10-06T02:00:00.000Z"],
] as const)("queries %s event dates in Manila time", async (date, start, end) => {
  await getAdminBookingPage({...filters, date});
  const ranges = list().conditions.filter(condition => condition[0] === "eventDate");
  expect(ranges.map(([field, operator, value]) => [field, operator, (value as Timestamp).toDate().toISOString()])).toEqual([
    ...(start ? [["eventDate", ">=", start]] : []), ...(end ? [["eventDate", "<", end]] : []),
  ]);
  expect(list().orders[0]).toEqual([date === "all" ? "createdAt" : "eventDate", "desc"]);
});

it("combines booking, payment and event filters and retains a compatible pagination cursor", async () => {
  const cursor = Buffer.from(JSON.stringify({field: "eventDate", milliseconds: Date.parse("2026-10-08T00:00:00Z"), documentId: "event-next"})).toString("base64url");
  await getAdminBookingPage({...filters, status: "confirmed", paymentStatus: "paid", date: "upcoming", cursor});
  expect(list().conditions).toEqual(expect.arrayContaining([["status", "==", "confirmed"], ["paymentStatus", "==", "paid"]]));
  expect(list().cursor[1]).toBe("event-next");
  state.queries.length = 0;
  await getAdminBookingPage(filters);
  expect(list().conditions).toEqual([]);
  expect(list().cursor).toEqual([]);
});

it("keeps the amount card as the sum of currently paid payment amounts", async () => {
  const result = await getAdminBookingPage(filters);
  expect(result.statistics.totalPaidAmount).toBe(26000);
});
