import {readFileSync} from "node:fs";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {Timestamp} from "firebase-admin/firestore";

const mocks = vi.hoisted(() => ({requireAdmin: vi.fn(), get: vi.fn(), runTransaction: vi.fn(), update: vi.fn(), create: vi.fn(), collection: vi.fn(), doc: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: mocks.requireAdmin}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {collection: mocks.collection, runTransaction: mocks.runTransaction}}));
import {getAdminCancellationRollout, updateAdminCancellationRollout} from "@/lib/admin/settings/admin-cancellation-rollout-service";

const canonical = {schemaVersion: 1, isPublic: false, customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off", updatedAt: Timestamp.fromMillis(1000), updatedBy: "admin"};
const input = {bookingRefundPolicyCaptureMode: "off", customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off", internalReason: "Repair rollout configuration."};
let booking: Record<string, unknown> | undefined;
let stored: Record<string, unknown> | undefined;
const snapshot = (ref?: {id: string}) => {
  const data = ref?.id === "refundPolicyBookingAgreement" ? booking : stored;
  return {exists: data !== undefined, data: () => data};
};
beforeEach(() => {
  vi.clearAllMocks();
  stored = {...canonical};
  booking = {schemaVersion: 1, isPublic: false, enforcementMode: "off", updatedAt: Timestamp.fromMillis(1000), updatedBy: "admin"};
  mocks.requireAdmin.mockResolvedValue({uid: "admin"});
  mocks.get.mockImplementation(async (ref) => snapshot(ref));
  mocks.doc.mockImplementation((id) => ({id, get: () => mocks.get({id})}));
  mocks.collection.mockReturnValue({doc: mocks.doc});
  mocks.update.mockImplementation((ref, data) => {if (ref.id === "refundPolicyBookingAgreement") booking = {...booking, ...data, updatedAt: Timestamp.fromMillis(2000)}; else stored = {...stored, ...data, updatedAt: Timestamp.fromMillis(2000)};});
  mocks.create.mockImplementation((ref, data) => {if (ref.id === "refundPolicyBookingAgreement") booking = {...data, updatedAt: Timestamp.fromMillis(2000)}; else if ("customerCancellationMode" in data) stored = {...data, updatedAt: Timestamp.fromMillis(2000)};});
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
    expect(mocks.runTransaction).toHaveBeenCalledTimes(3);
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.create.mock.calls[1][1]).toMatchObject({schemaVersion: 1, isPublic: false, updatedBy: "admin", createdBy: "admin"});
    expect(mocks.create.mock.calls[1][1].updatedAt).toBe(mocks.create.mock.calls[1][1].createdAt);
    expect(mocks.create.mock.calls[2][1]).toMatchObject({actorId: "admin", actorRole: "admin", targetCollection: "appSettings", targetId: "cancellationRefundRollout", source: "web_admin", reason: input.internalReason, before: null, after: {schemaVersion: 1, isPublic: false}});
  });
  it.each([
    {schemaVersion: 2}, {isPublic: true}, {customerCancellationMode: "bad"},
    {automaticPolicyRefundApprovalMode: "bad"}, {automaticPolicyRefundApprovalMode: "enabled"},
  ])("displays malformed config closed but repairs rather than no-ops: %j", async (override) => {
    stored = {...canonical, ...override};
    expect(await getAdminCancellationRollout()).toMatchObject({customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off"});
    expect((await updateAdminCancellationRollout(input)).changed).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(stored).toMatchObject({...canonical, updatedAt: Timestamp.fromMillis(2000)});
    const audit = mocks.create.mock.calls[1][1];
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
    const result = await updateAdminCancellationRollout({...input, bookingRefundPolicyCaptureMode: "required", customerCancellationMode: "enabled", automaticPolicyRefundApprovalMode: "enabled"});
    expect(result.settings.customerCancellationMode).toBe("enabled");
    expect(mocks.create.mock.calls[1][1]).toMatchObject({before: {customerCancellationMode: "off"}, after: {customerCancellationMode: "enabled"}});
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

describe("Booking refund-policy capture in combined settings", () => {
  it.each([undefined, {schemaVersion: 1, isPublic: false, enforcementMode: "off"}, {schemaVersion: 1, isPublic: false, enforcementMode: "required"}])("reads absent/off/required booking configuration: %j", async (data) => {
    booking = data;
    const settings = await getAdminCancellationRollout();
    expect(settings.bookingRefundPolicyCaptureMode).toBe(data?.enforcementMode ?? "off");
    expect(settings.bookingCaptureConfigurationStatus).toBe(data ? "valid" : "missing");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([{schemaVersion: 2}, {isPublic: true}, {enforcementMode: "enabled"}, {enforcementMode: null}, {}])("displays malformed booking configuration safely and repairs it: %j", async (data) => {
    booking = data;
    expect(await getAdminCancellationRollout()).toMatchObject({bookingRefundPolicyCaptureMode: "off", bookingCaptureConfigurationStatus: "invalid"});
    await updateAdminCancellationRollout({...input, bookingRefundPolicyCaptureMode: "required"});
    expect(booking).toMatchObject({schemaVersion: 1, isPublic: false, enforcementMode: "required", updatedBy: "admin"});
  });
  it.each(["review_only", "enabled"])("reads an existing mismatch without mutations, rejects saving it, and repairs %s atomically", async (customerCancellationMode) => {
    booking = undefined;
    stored = {...canonical, customerCancellationMode};
    expect(await getAdminCancellationRollout()).toMatchObject({bookingRefundPolicyCaptureMode: "off", bookingCaptureConfigurationStatus: "missing", customerCancellationMode});
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.runTransaction.mockClear();
    await expect(updateAdminCancellationRollout({...input, customerCancellationMode})).rejects.toThrow(/must be Required/u);
    expect(mocks.runTransaction).not.toHaveBeenCalled();
    const result = await updateAdminCancellationRollout({...input, bookingRefundPolicyCaptureMode: "required", customerCancellationMode});
    expect(result.settings).toMatchObject({bookingRefundPolicyCaptureMode: "required", customerCancellationMode});
    expect(mocks.runTransaction).toHaveBeenCalledTimes(2);
    const bookingWrite = mocks.create.mock.calls.find(([ref]) => ref.id === "refundPolicyBookingAgreement")!;
    const cancellationWrite = mocks.update.mock.calls.find(([ref]) => ref.id === "cancellationRefundRollout")!;
    expect(bookingWrite[1]).toMatchObject({schemaVersion: 1, isPublic: false, enforcementMode: "required", updatedBy: "admin", createdBy: "admin"});
    expect(cancellationWrite[1]).toMatchObject({schemaVersion: 1, isPublic: false, customerCancellationMode, automaticPolicyRefundApprovalMode: "off"});
    expect(bookingWrite[1].updatedAt).toBe(cancellationWrite[1].updatedAt);
    expect(bookingWrite[1].createdAt).toBe(cancellationWrite[1].updatedAt);
  });
  it("queues both settings and both audits in the same transaction and propagates failure without committing", async () => {
    const beforeBooking = {...booking};
    const beforeCancellation = {...stored};
    const queued: unknown[] = [];
    mocks.runTransaction.mockImplementationOnce(async (callback) => {
      await callback({get: mocks.get, update: (ref: unknown, data: unknown) => queued.push({ref, data}), create: (ref: unknown, data: unknown) => queued.push({ref, data})});
      throw new Error("Transaction failed");
    });
    await expect(updateAdminCancellationRollout({...input, bookingRefundPolicyCaptureMode: "required", customerCancellationMode: "enabled"})).rejects.toThrow("Transaction failed");
    expect(queued).toHaveLength(4);
    expect(booking).toEqual(beforeBooking);
    expect(stored).toEqual(beforeCancellation);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("Stored Off capture and canonical creation", () => {
  it.each(["review_only", "enabled"])("reads an explicit Off/%s mismatch and permits turning cancellation off", async (customerCancellationMode) => {
    stored = {...canonical, customerCancellationMode};
    expect(await getAdminCancellationRollout()).toMatchObject({bookingRefundPolicyCaptureMode: "off", bookingCaptureConfigurationStatus: "valid", customerCancellationMode});
    await expect(updateAdminCancellationRollout({...input, customerCancellationMode})).rejects.toThrow();
    expect((await updateAdminCancellationRollout(input)).settings).toMatchObject({bookingRefundPolicyCaptureMode: "off", customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off"});
  });
  it("creates both missing documents and both audit records in one write transaction", async () => {
    booking = undefined;
    stored = undefined;
    await updateAdminCancellationRollout(input);
    expect(mocks.create).toHaveBeenCalledTimes(4);
    expect(mocks.create.mock.calls[0][0].id).toBe("refundPolicyBookingAgreement");
    expect(mocks.create.mock.calls[0][1]).toMatchObject({schemaVersion: 1, isPublic: false, enforcementMode: "off", createdBy: "admin", updatedBy: "admin"});
    expect(mocks.create.mock.calls[2][0].id).toBe("cancellationRefundRollout");
    expect(mocks.create.mock.calls[2][1]).toMatchObject({schemaVersion: 1, isPublic: false, customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off", createdBy: "admin", updatedBy: "admin"});
    expect(mocks.create.mock.calls[0][1].updatedAt).toBe(mocks.create.mock.calls[2][1].updatedAt);
  });
  it("repairs missing booking metadata even when both selected modes are unchanged", async () => {
    booking = {schemaVersion: 1, isPublic: false, enforcementMode: "off"};
    expect((await updateAdminCancellationRollout(input)).changed).toBe(true);
    expect(booking).toMatchObject({updatedBy: "admin", updatedAt: Timestamp.fromMillis(2000)});
  });
});
