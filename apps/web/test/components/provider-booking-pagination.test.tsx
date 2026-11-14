import {beforeEach, expect, it, vi} from "vitest";
import {Timestamp} from "firebase-admin/firestore";
const state = vi.hoisted(() => ({records: {} as Record<string, Record<string, unknown>>, reads: [] as number[]}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: async () => ({providerId: "provider_test"})}));
function snapshot(name: string, id: string) {
  const data = state.records[name + "/" + id];
  return {id, exists: Boolean(data), data: () => data};
}
function query(name: string, predicates: Array<[string, string, unknown]> = [], after: [number, string] | null = null, maximum = 1000, sortField = "eventDate", direction = "asc") {
  const result = {
    doc: (id: string) => ({name, id, get: async () => snapshot(name, id)}),
    where: (field: string, operator: string, value: unknown) => query(name, [...predicates, [field, operator, value]], after, maximum, sortField, direction),
    orderBy: (field: unknown, order: string) => typeof field === "string" ? query(name, predicates, after, maximum, field, order) : result,
    startAfter: (date: Timestamp | Date, id: string) => query(name, predicates, [date instanceof Date ? date.getTime() : date.toMillis(), id], maximum, sortField, direction),
    limit: (value: number) => query(name, predicates, after, value, sortField, direction),
    get: async () => {
      if (name === "providerRequests") state.reads.push(maximum);
      let docs = Object.keys(state.records).filter(key => key.startsWith(name + "/")).map(key => snapshot(name, key.split("/")[1]));
      docs = docs.filter(doc => predicates.every(([field, op, value]) => op === "in" ? (value as unknown[]).includes(doc.data()![field]) : doc.data()![field] === value));
      if (name === "providerRequests") {
        const rank = (doc: ReturnType<typeof snapshot>) => (doc.data()![sortField] as Date).getTime();
        docs.sort((a, b) => (rank(a) - rank(b) || a.id.localeCompare(b.id)) * (direction === "asc" ? 1 : -1));
        if (after) docs = docs.filter(doc => direction === "asc" ? rank(doc) > after[0] || (rank(doc) === after[0] && doc.id > after[1]) : rank(doc) < after[0] || (rank(doc) === after[0] && doc.id < after[1]));
      }
      return {docs: docs.slice(0, maximum)};
    },
  };
  return result;
}
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: (name: string) => query(name),
  getAll: async (...refs: {name: string; id: string}[]) => refs.map(ref => snapshot(ref.name, ref.id)),
}}));
import {getProviderBookingPage, getProviderBooking} from "@/lib/provider/bookings/provider-booking-service";
function add(index: number, changes: Record<string, unknown> = {}) {
  const id = "request_" + String(index).padStart(3, "0");
  state.records["providerRequests/" + id] = {providerId: "provider_test", customerId: "customer_test", mainEventId: "event_test", type: "catering", status: "confirmed", eventDate: new Date("2026-10-10T00:00:00+08:00"), eventTime: "18:00", createdAt: new Date("2026-01-01"), customerFirstName: "Ana", packageName: "Celebration", eventType: "birthday", ...changes};
}
beforeEach(() => {state.records = {"mainEvents/event_test": {customerId: "customer_test", status: "confirmed"}}; state.reads = [];});
it("fills pages across invalid joined records and resumes without repeats or skips", async () => {
  for (let i = 0; i < 65; i++) add(i, i >= 30 ? {customerId: "wrong_customer"} : {});
  const first = await getProviderBookingPage({status: "all", pageSize: 10});
  expect(first.bookings.map(b => b.providerRequestId)).toEqual(Array.from({length: 10}, (_, i) => "request_" + String(29 - i).padStart(3, "0")));
  expect(first.skippedMalformedCount).toBe(35);
  const second = await getProviderBookingPage({status: "all", pageSize: 10, cursor: first.nextCursor});
  expect(second.bookings[0].providerRequestId).toBe("request_019");
  expect(state.reads.every(size => size <= 31)).toBe(true);
});
it("returns honest bounded empty continuation and rejects changed-filter cursors", async () => {
  for (let i = 0; i < 170; i++) add(i);
  const first = await getProviderBookingPage({status: "all", search: "missing"});
  expect(first.bookings).toEqual([]); expect(first.hasMore).toBe(true); expect(state.reads).toHaveLength(5);
  await expect(getProviderBookingPage({status: "upcoming", search: "missing", cursor: first.nextCursor})).rejects.toThrow("filters changed");
  const last = await getProviderBookingPage({status: "all", search: "missing", cursor: first.nextCursor});
  expect(last.hasMore).toBe(false);
});
it.each(["ana", "REQUEST_000", "birth", "celebr"])("combines case-insensitive substring %s with provider authorization", async search => {
  add(0); add(1, {providerId: "other_provider"});
  expect((await getProviderBookingPage({status: "all", search})).bookings).toHaveLength(1);
  await expect(getProviderBooking("request_001")).rejects.toThrow("unavailable");
});
it("defaults to upcoming and retains past confirmed and in-progress events", async () => {
  add(0, {eventDate: new Date("2020-01-01"), eventTime: "malformed"}); add(1, {status: "in_progress"}); add(2, {status: "completed"});
  expect((await getProviderBookingPage()).bookings.map(b => b.providerRequestId)).toEqual(["request_000", "request_001"]);
});

it.each(["2026-10-09T16:00:00Z", "2026-10-10T15:59:59Z"])("uses Manila calendar boundaries for date filtering: %s", async eventDate => {
  add(0, {eventDate: new Date(eventDate)}); add(1, {eventDate: new Date("2026-10-10T16:00:00Z")});
  expect((await getProviderBookingPage({status: "all", dateFrom: "2026-10-10", dateTo: "2026-10-10"})).bookings.map(b => b.providerRequestId)).toEqual(["request_000"]);
});

it("orders scheduled times within a date without losing the source continuation", async () => {
  add(0, {eventTime: "23:00"}); add(1, {eventTime: "09:00"}); add(2, {eventTime: "15:00"});
  const first = await getProviderBookingPage({status: "upcoming", pageSize: 2});
  expect(first.bookings.map(b => b.eventTime)).toEqual(["09:00", "23:00"]);
  const second = await getProviderBookingPage({status: "upcoming", pageSize: 2, cursor: first.nextCursor});
  expect(second.bookings.map(b => b.providerRequestId)).toEqual(["request_002"]);
});
it("All Bookings keeps records whose event date comes from their canonical event", async () => {
  add(0); delete state.records["providerRequests/request_000"].eventDate;
  state.records["mainEvents/event_test"].eventDate = new Date("2026-10-10");
  expect((await getProviderBookingPage({status: "all"})).bookings).toHaveLength(1);
});
