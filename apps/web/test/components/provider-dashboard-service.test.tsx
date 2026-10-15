import {beforeEach, afterEach, describe, expect, it, vi} from "vitest";
const fixtures = vi.hoisted(() => ({requests: [] as {id: string; data: () => Record<string, unknown>}[], events: new Map<string, Record<string, unknown>>(), where: vi.fn(), getAll: vi.fn(), authorize: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: fixtures.authorize}));
vi.mock("@/lib/firebase/admin", () => {
  function query(offset = 0) {
    const builder = {
      where: (...args: unknown[]) => {fixtures.where(...args); return builder;},
      orderBy: () => builder,
      limit: () => builder,
      startAfter: (doc: {id: string}) => query(fixtures.requests.findIndex(item => item.id === doc.id) + 1),
      get: async () => ({docs: fixtures.requests.slice(offset, offset + 500)}),
      doc: (id: string) => ({id}),
    };
    return builder;
  }
  return {adminDb: {collection: () => query(), getAll: (...refs: {id: string}[]) => {
    fixtures.getAll(...refs);
    return Promise.resolve(refs.map(ref => ({id: ref.id, exists: fixtures.events.has(ref.id), data: () => fixtures.events.get(ref.id)})));
  }}};
});
import {getProviderDashboardData, getProviderDashboardRecords} from "@/lib/provider/dashboard/provider-dashboard-service";
const base = {providerId: "provider", customerId: "customer", mainEventId: "event", eventDate: new Date("2026-10-09T16:00:00Z"), eventTime: "14:00", createdAt: new Date("2026-10-09T12:00:00Z"), expiresAt: new Date("2026-10-11T00:00:00Z")};
function doc(id: string, change: Record<string, unknown> = {}) {return {id, data: () => ({...base, providerRequestId: id, ...change})};}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-10T02:00:00Z"));
  fixtures.requests = []; fixtures.events.clear(); fixtures.where.mockClear(); fixtures.getAll.mockClear();
  fixtures.authorize.mockReset().mockResolvedValue({providerId: "provider"});
  fixtures.events.set("event", {customerId: "customer", status: "pending_provider_approval"});
});
afterEach(() => vi.useRealTimers());
describe("provider dashboard server data", () => {
  it("counts beyond 500 records and scopes every query to the authenticated provider", async () => {
    fixtures.requests = Array.from({length: 501}, (_, i) => doc(`request${i}`, {status: "pending"}));
    const result = await getProviderDashboardData();
    expect(result.summary.new).toBe(501);
    expect(result.recentRequests).toHaveLength(5);
    expect(fixtures.where).toHaveBeenCalledWith("providerId", "==", "provider");
    expect(fixtures.getAll).toHaveBeenCalledWith({id: "event"});
  });
  it("orders upcoming events by date then time and counts all while showing five", async () => {
    fixtures.events.set("event", {customerId: "customer", status: "confirmed"});
    fixtures.requests = ["21:00", "17:00", "11:00", "18:00", "12:00", "16:00"].map((eventTime, i) => doc(`request${i}`, {status: "confirmed", eventTime}));
    const result = await getProviderDashboardData();
    expect(result.summary.upcoming).toBe(6);
    expect(result.upcomingEvents.map(item => item.id)).toEqual(["request2", "request4", "request5", "request1", "request3"]);
  });
  it("rejects foreign provider records and removed lineup relationships", async () => {
    fixtures.requests = [doc("foreign", {status: "pending", providerId: "other"}), doc("removed", {status: "pending"})];
    fixtures.events.set("event", {customerId: "customer", status: "pending_provider_approval", providerRequestIds: ["current"]});
    const records = await getProviderDashboardRecords("provider");
    expect(records.documents.filter(doc => records.matches(doc, "new"))).toHaveLength(0);
  });
  it("propagates authorization and database errors rather than displaying zero counts", async () => {
    fixtures.authorize.mockRejectedValueOnce(new Error("Access denied"));
    await expect(getProviderDashboardData()).rejects.toThrow("Access denied");
    fixtures.requests = [doc("request", {status: "pending"})];
    fixtures.getAll.mockImplementationOnce(() => {throw new Error("Offline");});
    await expect(getProviderDashboardData()).rejects.toThrow("Offline");
  });
});
