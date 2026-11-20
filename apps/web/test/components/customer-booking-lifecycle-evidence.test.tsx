import {beforeEach, describe, expect, it, vi} from "vitest";

type Data = Record<string, unknown>;
const store = vi.hoisted(() => ({
  mainEvents: new Map<string, Data>(),
  providerRequests: new Map<string, Data>(),
  reviews: new Map<string, Data>(),
}));

vi.mock("@/lib/auth/session", () => ({requireCustomer: vi.fn(async () => ({uid: "customer-1"}))}));
vi.mock("@/lib/firebase/admin", () => {
  type Name = keyof typeof store;
  const emptyQuery = {orderBy: () => emptyQuery, limit: () => emptyQuery, get: async () => ({docs: []})};
  const reference = (name: Name, id: string) => ({id, collection: () => emptyQuery, get: async () => snapshot(name, id)});
  const snapshot = (name: Name, id: string) => {
    const data = store[name].get(id);
    return {id, exists: data !== undefined, data: () => data, ref: reference(name, id)};
  };
  return {adminDb: {
    collection: (name: Name) => ({
      doc: (id: string) => reference(name, id),
      where: (field: string, _operator: string, value: unknown) => ({get: async () => ({
        docs: [...store[name]].filter(([, data]) => data[field] === value).map(([id]) => snapshot(name, id)),
      })}),
    }),
    getAll: async (...references: {get: () => Promise<unknown>}[]) => Promise.all(references.map(item => item.get())),
  }};
});

import {
  getCustomerBookingDetails,
  getCustomerBookingDetailsWithTimeline,
  getCustomerBookingResults,
} from "@/lib/customer/bookings/customer-booking-service";
import {lifecycleLabel} from "@/lib/presentation/booking-lifecycle";

const BOOKING_ID = "BK-1D8D952721";
const END = Date.parse("2026-10-17T18:14:00+08:00");
const schedule = {eventDate: "2026-10-17T00:00:00+08:00", eventTime: "14:00", eventEndTime: "18:14"};

function seed(mainEvent: Data = {}, requests: Record<string, Data> = {"request-1": {}}) {
  store.mainEvents.clear();
  store.providerRequests.clear();
  store.reviews.clear();
  store.mainEvents.set(BOOKING_ID, {customerId: "customer-1", bookingCode: BOOKING_ID, status: "in_progress",
    providerRequestIds: Object.keys(requests), createdAt: "2026-10-01T00:00:00.000Z", ...schedule, ...mainEvent});
  for (const [id, patch] of Object.entries(requests)) {
    if (patch === null) continue;
    store.providerRequests.set(id, {providerRequestId: id, mainEventId: BOOKING_ID, customerId: "customer-1",
      status: "in_progress", paymentStatus: "paid", settlementStatus: "fully_settled", outstandingAmountInCentavos: 0,
      ...schedule, ...patch});
  }
}

async function lifecycles() {
  const list = await getCustomerBookingResults({search: BOOKING_ID, status: "all", pageSize: 10, cursor: null});
  const drawer = await getCustomerBookingDetails(BOOKING_ID);
  const page = await getCustomerBookingDetailsWithTimeline(BOOKING_ID);
  expect(list.bookings).toHaveLength(1);
  return {list: list.bookings[0], drawer: drawer.details.booking, page: page.details.booking};
}

describe("customer booking linked lifecycle evidence", () => {
  beforeEach(() => seed());

  it("projects an ended booking without blockers as Awaiting completion everywhere", async () => {
    const {list, drawer, page} = await lifecycles();
    expect(page.lifecycle).toEqual(list.lifecycle);
    expect(page.lifecycle).toEqual(drawer.lifecycle);
    expect(page.lifecycle).toEqual({cancellation: false, reconciliation: false, end: END});
    expect(lifecycleLabel(page.status, page.lifecycle, END)).toBe("Awaiting completion");
    expect(page.status).toBe("in_progress");
  });

  it("uses provider-level reconciliation on the full details page exactly like the list and drawer", async () => {
    seed({}, {"request-1": {lifecycleReconciliationRequired: true}});
    const {list, drawer, page} = await lifecycles();
    expect(page.lifecycle).toEqual(list.lifecycle);
    expect(page.lifecycle).toEqual(drawer.lifecycle);
    expect(page.lifecycle?.reconciliation).toBe(true);
    expect(lifecycleLabel(page.status, page.lifecycle, END)).toBe("Completion on hold");
    expect(lifecycleLabel(page.status, page.lifecycle, END - 1)).toBe("Booking review required");
    expect(page.status).toBe("in_progress");
  });

  it("fails closed when linked provider evidence is missing", async () => {
    seed({}, {"request-1": {}, "request-missing": null as unknown as Data});
    const {list, drawer, page} = await lifecycles();
    expect(page.lifecycle).toEqual(list.lifecycle);
    expect(page.lifecycle).toEqual(drawer.lifecycle);
    expect(lifecycleLabel(page.status, page.lifecycle, END)).toBe("Completion on hold");
  });

  it("keeps a provider cancellation hold as booking review on every surface", async () => {
    seed({}, {"request-1": {activeCancellationRequestId: "cancel-1", lifecycleReconciliationRequired: true}});
    const {list, drawer, page} = await lifecycles();
    expect(page.lifecycle).toEqual(list.lifecycle);
    expect(page.lifecycle).toEqual(drawer.lifecycle);
    expect(lifecycleLabel(page.status, page.lifecycle, END)).toBe("Booking review required");
  });

  it("lets a canonical completed booking take precedence over stale blockers", async () => {
    seed({status: "completed"}, {"request-1": {status: "completed", lifecycleReconciliationRequired: true}});
    const {list, drawer, page} = await lifecycles();
    expect(page.lifecycle).toEqual(list.lifecycle);
    expect(page.lifecycle).toEqual(drawer.lifecycle);
    expect(lifecycleLabel(page.status, page.lifecycle, END)).toBeNull();
    expect(page.status).toBe("completed");
  });
});
