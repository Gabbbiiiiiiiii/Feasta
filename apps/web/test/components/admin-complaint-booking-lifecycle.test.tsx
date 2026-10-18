import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({records: new Map<string, Record<string, unknown>>(), sequence: 0, admin: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: mocks.admin}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: (path: string) => ({doc: (id?: string) => ({path: `${path}/${id ?? ++mocks.sequence}`})}),
  runTransaction: async (callback: (tx: unknown) => unknown) => callback({
    get: async (ref: {path: string}) => ({exists: mocks.records.has(ref.path), data: () => mocks.records.get(ref.path)}),
    update: (ref: {path: string}, data: Record<string, unknown>) => mocks.records.set(ref.path, {...mocks.records.get(ref.path), ...data}),
    create: (ref: {path: string}, data: Record<string, unknown>) => mocks.records.set(ref.path, data),
  }),
}}));
import {manageAdminComplaint} from "@/lib/admin/complaints/admin-complaint-service";
beforeEach(() => {mocks.records.clear(); mocks.sequence = 0; mocks.admin.mockResolvedValue({uid: "admin_owned"});});
it.each(["resolve", "dismiss", "close"] as const)("%s keeps booking links and records resolution authority; reopen clears it", async decision => {
  const links = {bookingId: "event_owned", mainEventId: "event_owned", providerRequestId: "request_owned", customerId: "customer_owned"};
  mocks.records.set("complaints/complaint_owned", {...links, userId: "customer_owned", providerId: "provider_owned", status: decision === "close" ? "resolved" : "under_review", priority: "normal",
    ...(decision === "close" ? {resolvedAt: new Date("2026-10-13T00:00:00Z"), resolvedBy: "admin_owned", resolution: "Previously resolved"} : {})});
  const input = {complaintId: "complaint_owned", decision, priority: "normal" as const,
    publicResponse: "We have reviewed this issue and completed our response.", internalReason: "Trusted admin reviewed all available evidence."};
  await manageAdminComplaint(input);
  const resolved = mocks.records.get("complaints/complaint_owned")!;
  expect(resolved.resolvedBy).toBe("admin_owned"); expect(resolved.resolvedAt).toBeTruthy();
  expect(resolved).toMatchObject(links);
  await manageAdminComplaint({...input, decision: "reopen"});
  expect(mocks.records.get("complaints/complaint_owned")).toMatchObject({...links, status: "under_review", resolvedAt: null, resolvedBy: null, resolution: null});
});
