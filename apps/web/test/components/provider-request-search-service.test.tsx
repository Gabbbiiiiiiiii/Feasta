import {Timestamp} from "firebase-admin/firestore";
import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({providerId: "provider-one", authorize: vi.fn(), where: vi.fn(), reads: 0,
  documents: [] as {id: string; data: () => Record<string, unknown>}[], parents: new Map<string, Record<string, unknown>>()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: mocks.authorize}));
vi.mock("@/lib/firebase/admin", () => {
  function query(conditions: [string, unknown][] = [], after: {time: number; id: string} | null = null, limit = 30) {
    const builder = {
      where: (field: unknown, _op: string, value: unknown) => {const name = typeof field === "string" ? field : "__name__"; mocks.where(name, value); return query([...conditions, [name, value]], after, limit);},
      orderBy: () => builder,
      limit: (value: number) => query(conditions, after, value),
      startAfter: (date: {toMillis: () => number}, id: string) => query(conditions, {time: date.toMillis(), id}, limit),
      doc: (id: string) => ({id}),
      get: async () => {
        const all = mocks.documents.filter(doc => conditions.every(([field, value]) => (field === "__name__" ? doc.id : doc.data()[field]) === value))
          .sort((a, b) => (b.data().createdAt as {toMillis: () => number}).toMillis() - (a.data().createdAt as {toMillis: () => number}).toMillis() || b.id.localeCompare(a.id));
        const docs = all.filter(doc => !after || (doc.data().createdAt as {toMillis: () => number}).toMillis() < after.time ||
          ((doc.data().createdAt as {toMillis: () => number}).toMillis() === after.time && doc.id < after.id)).slice(0, limit);
        mocks.reads += docs.length;
        return {docs};
      },
    }; return builder;
  }
  return {adminDb: {collection: () => query(), getAll: async (...refs: {id: string}[]) => refs.map(ref => ({id: ref.id, exists: mocks.parents.has(ref.id), data: () => mocks.parents.get(ref.id)}))}};
});
import {getProviderRequestPage, getProviderRequestDetail} from "@/lib/provider/requests/provider-request-service";

function document(index: number, change: Record<string, unknown> = {}) {
  const id = `request-${String(index).padStart(4, "0")}`;
  return {id, data: () => ({providerRequestId: id, providerId: "provider-one", mainEventId: "event-one", customerId: "customer-one", type: "catering", status: "pending",
    customerFirstName: "Ana", customerLastName: "Reyes", eventType: "birthday_party", packageName: "Fiesta Buffet",
    eventDate: Timestamp.fromDate(new Date("2030-10-10T00:00:00+08:00")), eventTime: "14:00", amount: 10000, downPaymentAmount: 2000,
    createdAt: Timestamp.fromMillis(1700000000000 - index * 1000), ...change})};
}
beforeEach(() => {
  mocks.providerId = "provider-one"; mocks.reads = 0; mocks.documents = []; mocks.parents.clear(); mocks.where.mockClear();
  mocks.authorize.mockReset().mockImplementation(async () => ({providerId: mocks.providerId}));
  mocks.parents.set("event-one", {customerId: "customer-one", status: "pending_provider_approval", bookingCode: "BK-MARIA-123"});
});
describe("provider request search and pagination", () => {
  it("finds partial case-insensitive matches beyond the newest 100 records", async () => {
    mocks.documents = Array.from({length: 140}, (_, index) => document(index, {customerFirstName: index === 125 ? "Marisol" : "Ana"}));
    const result = await getProviderRequestPage({search: "aRiSo"});
    expect(result.requests.map(item => item.id)).toEqual(["request-0125"]);
    expect(result.hasMore).toBe(false);
    expect(mocks.where).toHaveBeenCalledWith("providerId", "provider-one");
  });
  it("bounds each search and continues older history without claiming an empty final result", async () => {
    mocks.documents = Array.from({length: 201}, (_, index) => document(index, {customerFirstName: index === 180 ? "OlderMatch" : "Ana"}));
    const first = await getProviderRequestPage({search: "older"});
    expect(first.requests).toHaveLength(0); expect(first.hasMore).toBe(true); expect(mocks.reads).toBe(150);
    const next = await getProviderRequestPage({search: "older", cursor: first.nextCursor});
    expect(next.requests.map(item => item.id)).toEqual(["request-0180"]); expect(next.hasMore).toBe(false);
  });
  it.each(["bk-maria", "request-0000", "event-one", "DAY PA", "STA BUF", "ana re"])("searches reference, identifiers, event, package, and customer using %s", async search => {
    mocks.documents = [document(0)];
    expect((await getProviderRequestPage({search})).requests).toHaveLength(1);
  });
  it("combines canonical status filters with search and leaves expired history in All", async () => {
    mocks.documents = [document(0, {status: "accepted"}), document(1, {status: "rejected"}), document(2, {status: "cancelled"}), document(3, {status: "expired"}), document(4, {status: "waiting_for_down_payment"})];
    expect((await getProviderRequestPage({status: "accepted", search: "buffet"})).requests.map(item => item.status)).toEqual(["accepted"]);
    expect((await getProviderRequestPage({status: "rejected"})).requests.map(item => item.status)).toEqual(["rejected"]);
    expect((await getProviderRequestPage({status: "cancelled"})).requests.map(item => item.status)).toEqual(["cancelled"]);
    expect((await getProviderRequestPage()).requests.map(item => item.status)).toContain("expired");
  });
  it("paginates without missing or duplicating results and binds cursors to provider and filters", async () => {
    mocks.documents = Array.from({length: 25}, (_, index) => document(index));
    const first = await getProviderRequestPage({search: "party"});
    const second = await getProviderRequestPage({search: "party", cursor: first.nextCursor});
    const third = await getProviderRequestPage({search: "party", cursor: second.nextCursor});
    expect(new Set([...first.requests, ...second.requests, ...third.requests].map(item => item.id)).size).toBe(25);
    expect(third.hasMore).toBe(false);
    await expect(getProviderRequestPage({search: "other", cursor: first.nextCursor})).rejects.toThrow("Start your search again");
    mocks.providerId = "provider-other";
    await expect(getProviderRequestPage({search: "party", cursor: first.nextCursor})).rejects.toThrow("Start your search again");
  });
  it("uses only eleven request reads for an ordinary ten-row page", async () => {
    mocks.documents = Array.from({length: 50}, (_, index) => document(index));
    expect((await getProviderRequestPage()).requests).toHaveLength(10); expect(mocks.reads).toBe(11);
  });
  it("requires authorization on search and details and prevents foreign-provider detail access", async () => {
    mocks.authorize.mockRejectedValueOnce(new Error("Provider access required"));
    await expect(getProviderRequestPage()).rejects.toThrow("Provider access required");
    mocks.documents = [document(0, {providerId: "provider-other"})];
    await expect(getProviderRequestDetail("request-0000")).rejects.toThrow("unavailable");
    expect((await getProviderRequestPage()).requests).toHaveLength(0);
  });
  it("keeps expired pending requests in history but excludes them from New and disables responses", async () => {
    mocks.documents = [document(0, {expiresAt: Timestamp.fromMillis(0)})];
    expect((await getProviderRequestPage()).requests).toHaveLength(1);
    expect((await getProviderRequestPage({status: "new"})).requests).toHaveLength(0);
    expect((await getProviderRequestDetail("request-0000")).responseUnavailableReason).toBe("This request has expired.");
  });
  it("disables responses to cancelled parents and invalid request lineups", async () => {
    mocks.documents = [document(0)];
    mocks.parents.set("event-one", {customerId: "customer-one", status: "cancelled"});
    expect((await getProviderRequestDetail("request-0000")).responseUnavailableReason).toBe("This booking has been cancelled.");
    mocks.parents.set("event-one", {customerId: "customer-one", status: "pending_provider_approval", providerRequestIds: ["another-request"]});
    expect((await getProviderRequestPage({status: "new"})).requests).toHaveLength(0);
    expect((await getProviderRequestDetail("request-0000")).responseUnavailableReason).toContain("cannot be responded to");
  });
});
