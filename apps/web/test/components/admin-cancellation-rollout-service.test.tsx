import {readFileSync} from "node:fs";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {Timestamp} from "firebase-admin/firestore";

const mocks = vi.hoisted(() => ({requireAdmin: vi.fn(), get: vi.fn(), runTransaction: vi.fn(), update: vi.fn(), create: vi.fn(), collection: vi.fn(), doc: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: mocks.requireAdmin}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {collection: mocks.collection, runTransaction: mocks.runTransaction}}));
import {getAdminCancellationRollout, updateAdminCancellationRollout} from "@/lib/admin/settings/admin-cancellation-rollout-service";

const canonical = {schemaVersion: 1, isPublic: false, customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off", updatedAt: Timestamp.fromMillis(1000), updatedBy: "admin"};
const input = {customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off", internalReason: "Repair rollout configuration."};
let stored: Record<string, unknown> | undefined;
const snapshot = () => {
  const data = stored;
  return {exists: data !== undefined, data: () => data};
};
beforeEach(() => {
  vi.clearAllMocks();
  stored = {...canonical};
  mocks.requireAdmin.mockResolvedValue({uid: "admin"});
  mocks.get.mockImplementation(async () => snapshot());
  mocks.doc.mockReturnValue({get: mocks.get});
  mocks.collection.mockReturnValue({doc: mocks.doc});
  mocks.update.mockImplementation((_ref, data) => {stored = {...stored, ...data, updatedAt: Timestamp.fromMillis(2000)};});
  mocks.create.mockImplementation((_ref, data) => {if ("customerCancellationMode" in data) stored = {...data, updatedAt: Timestamp.fromMillis(2000)};});
  mocks.runTransaction.mockImplementation(async (callback) => callback({get: mocks.get, update: mocks.update, create: mocks.create}));
});
describe("Cancellation rollout server service", () => {
  it("uses server-only Admin SDK imports", () => {
    const source = readFileSync("src/lib/admin/settings/admin-cancellation-rollout-service.ts", "utf8");
    expect(source).toContain('import "server-only"');
    expect(source).toContain('from "firebase-admin/firestore"');
    expect(source).not.toContain('from "firebase/firestore"');
  });
  it("fails closed when missing and creates private config and audit atomically", async () => {
    stored = undefined;
    expect(await getAdminCancellationRollout()).toMatchObject({customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off"});
    expect((await updateAdminCancellationRollout(input)).changed).toBe(true);
    expect(mocks.runTransaction).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[0][1]).toMatchObject({schemaVersion: 1, isPublic: false, updatedBy: "admin", createdBy: "admin"});
    expect(mocks.create.mock.calls[0][1].updatedAt).toBe(mocks.create.mock.calls[0][1].createdAt);
    expect(mocks.create.mock.calls[1][1]).toMatchObject({actorId: "admin", actorRole: "admin", targetCollection: "appSettings", targetId: "cancellationRefundRollout", source: "web_admin", reason: input.internalReason, before: null, after: {schemaVersion: 1, isPublic: false}});
  });
  it.each([
    {schemaVersion: 2}, {isPublic: true}, {customerCancellationMode: "bad"},
    {automaticPolicyRefundApprovalMode: "bad"}, {automaticPolicyRefundApprovalMode: "enabled"},
  ])("displays malformed config closed but repairs rather than no-ops: %j", async (override) => {
    stored = {...canonical, ...override};
    expect(await getAdminCancellationRollout()).toMatchObject({customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off"});
    expect((await updateAdminCancellationRollout(input)).changed).toBe(true);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(stored).toMatchObject({...canonical, updatedAt: Timestamp.fromMillis(2000)});
    const audit = mocks.create.mock.calls[0][1];
    expect(audit.before).toMatchObject(override);
    expect(audit.after).toEqual({schemaVersion: 1, isPublic: false, customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off"});
    expect(Object.keys(audit.before)).toHaveLength(4);
    expect(audit.createdAt).toBe(mocks.update.mock.calls[0][1].updatedAt);
  });
  it("repairs absent update metadata", async () => {
    stored = {...canonical, updatedAt: null};
    expect((await updateAdminCancellationRollout(input)).changed).toBe(true);
  });
  it("does not rewrite or audit a valid unchanged document", async () => {
    expect((await updateAdminCancellationRollout(input)).changed).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("updates both modes and records the real before/after", async () => {
    const result = await updateAdminCancellationRollout({...input, customerCancellationMode: "enabled", automaticPolicyRefundApprovalMode: "enabled"});
    expect(result.settings.customerCancellationMode).toBe("enabled");
    expect(mocks.create.mock.calls[0][1]).toMatchObject({before: {customerCancellationMode: "off"}, after: {customerCancellationMode: "enabled"}});
  });
  it("requires Admin on reads and writes before touching Firestore", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(getAdminCancellationRollout()).rejects.toThrow("Forbidden");
    await expect(updateAdminCancellationRollout(input)).rejects.toThrow("Forbidden");
    expect(mocks.collection).not.toHaveBeenCalled();
  });
  it("rejects unsafe writes before the transaction", async () => {
    await expect(updateAdminCancellationRollout({...input, automaticPolicyRefundApprovalMode: "enabled"})).rejects.toThrow();
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });
});
