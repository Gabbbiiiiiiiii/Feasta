import {afterEach, beforeEach, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  requireApprovedProvider: vi.fn(),
  runTransaction: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  records: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: mocks.requireApprovedProvider}));
vi.mock("@/lib/firebase/admin", () => {
  const query = {where: () => query};
  return {adminDb: {
    collection: (name: string) => {
      if (name === "providers") return {doc: () => ({id: "provider-one", collection: mocks.records})};
      if (name === "packages") return {doc: () => "package"};
      if (name === "providerRequests") return query;
      throw new Error("Unexpected collection");
    },
    runTransaction: mocks.runTransaction,
  }};
});

import {mutateWalkIn} from "@/lib/provider/bookings/walk-in-booking-service";

const id = "12345678901234567890";
const provider = {ownerId: "owner", verificationStatus: "approved", isActive: true};
const snapshot = (value: object) => ({data: () => value});

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    action: "create", "full name": "Sample Customer", "contact number": "09123456789",
    "event type": "Wedding", "event date": "2026-11-24", "start time": "09:00",
    "end time": "12:00", location: "Manila", "number of guests": "50",
    "custom service": "Photography", "agreed price": "8000.25",
    "agreement date": "2026-11-19", acknowledgment: "on", ...overrides,
  })) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({toFake: ["Date"]});
  vi.setSystemTime(new Date("2026-11-19T12:00:00+08:00"));
  mocks.requireApprovedProvider.mockResolvedValue({providerId: "provider-one", uid: "owner"});
  mocks.records.mockReturnValue({doc: () => ({id})});
  mocks.runTransaction.mockImplementation(async (callback) => callback(mocks));
  mocks.get.mockResolvedValueOnce(snapshot(provider)).mockResolvedValueOnce({docs: []});
});
afterEach(() => vi.useRealTimers());

it("creates a confirmed custom record with a reference price and reserves its date", async () => {
  expect(await mutateWalkIn(form())).toEqual({message: "Walk-in booking confirmed."});
  expect(mocks.create).toHaveBeenCalledWith({id}, expect.objectContaining({
    providerId: "provider-one", bookingReference: id, source: "walk_in", status: "confirmed",
    serviceName: "Photography", agreedPriceCentavos: 800025, customerAcknowledged: true,
  }));
  const record = mocks.create.mock.calls[0][1];
  expect(record).not.toHaveProperty("customerId");
  expect(record).not.toHaveProperty("paymentStatus");
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({id: "provider-one"}),
    expect.objectContaining({walkInReservedDates: ["2026-11-24"]}));
});

it("snapshots the selected package from the provider's catalog", async () => {
  mocks.get.mockResolvedValueOnce(snapshot({providerId: "provider-one", name: "Event photography", status: "published"}));
  expect(await mutateWalkIn(form({package: "package-1", "custom service": ""}))).toHaveProperty("message");
  expect(mocks.create).toHaveBeenCalledWith({id}, expect.objectContaining({
    packageId: "package-1", serviceName: "Event photography",
  }));
});

it("rejects packages owned by a different provider", async () => {
  mocks.get.mockResolvedValueOnce(snapshot({providerId: "another-provider", name: "Other package"}));
  expect(await mutateWalkIn(form({package: "package-1"}))).toHaveProperty("error");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rejects an online reservation and performs no writes", async () => {
  mocks.get.mockReset().mockResolvedValueOnce(snapshot(provider))
    .mockResolvedValueOnce({docs: [snapshot({status: "confirmed"})]});
  expect(await mutateWalkIn(form())).toHaveProperty("error");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects a second walk-in on the same date", async () => {
  mocks.get.mockReset().mockResolvedValueOnce(snapshot({...provider, walkInReservedDates: ["2026-11-24"]}));
  expect(await mutateWalkIn(form())).toHaveProperty("error");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rejects a provider whose session no longer matches the owner", async () => {
  mocks.requireApprovedProvider.mockResolvedValue({providerId: "provider-one", uid: "other"});
  expect(await mutateWalkIn(form())).toHaveProperty("error");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("cancels a confirmed walk-in and releases its date together", async () => {
  mocks.get.mockReset()
    .mockResolvedValueOnce(snapshot({...provider, walkInReservedDates: ["2026-11-24", "2026-11-25"]}))
    .mockResolvedValueOnce(snapshot({status: "confirmed", eventDateKey: "2026-11-24"}));
  expect(await mutateWalkIn(form({action: "cancelled", reference: id}))).toHaveProperty("message");
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({id: "provider-one"}),
    expect.objectContaining({walkInReservedDates: ["2026-11-25"]}));
  expect(mocks.update).toHaveBeenCalledWith({id}, expect.objectContaining({status: "cancelled"}));
});

it("marks a confirmed walk-in complete while retaining the reserved date", async () => {
  mocks.get.mockReset().mockResolvedValueOnce(snapshot(provider))
    .mockResolvedValueOnce(snapshot({status: "confirmed", eventDateKey: "2026-11-24"}));
  expect(await mutateWalkIn(form({action: "completed", reference: id}))).toHaveProperty("message");
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({id}, expect.objectContaining({status: "completed"}));
});

it("requires the acknowledgment and rejects invalid time ranges before writing", async () => {
  expect(await mutateWalkIn(form({acknowledgment: ""}))).toHaveProperty("error");
  expect(await mutateWalkIn(form({"end time": "08:00"}))).toHaveProperty("error");
  expect(mocks.runTransaction).not.toHaveBeenCalled();
});
