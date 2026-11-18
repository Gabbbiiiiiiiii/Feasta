import {afterEach, beforeEach, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  requireApprovedProvider: vi.fn(),
  runTransaction: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  records: vi.fn(),
  readProvider: vi.fn(),
  catalog: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: mocks.requireApprovedProvider}));
vi.mock("@/lib/firebase/admin", () => {
  const query = {where: () => query};
  return {adminDb: {
    collection: (name: string) => {
      if (name === "providers") return {doc: () => ({id: "provider-one", collection: mocks.records, get: mocks.readProvider})};
      if (name === "adminLogs") return {doc: () => "audit"};
      if (name === "packages" || name === "addons") return {doc: () => name, where: (field: string, op: string, id: string) => ({get: () => mocks.catalog(name, field, op, id)})};
      if (name === "providerRequests") return query;
      throw new Error("Unexpected collection");
    },
    runTransaction: mocks.runTransaction,
  }};
});

import {listWalkInOffers, mutateWalkIn, readWalkInProvider} from "@/lib/provider/bookings/walk-in-booking-service";

const id = "12345678901234567890";
const provider = {ownerId: "owner", verificationStatus: "approved", isActive: true};
const snapshot = (value: Record<string, unknown>, id = "online") => ({
  id, exists: true, data: () => value, get: (key: string) => value[key],
});
const missing = {exists: false};

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    action: "create", "full name": "Sample Customer", "contact number": "09123456789",
    "event type": "Wedding", "event date": "2026-11-24", "start time": "09:00",
    "end time": "12:00", "venue name": "Hall", "venue address": "Manila", "number of guests": "50",
    "custom service": "Photography", "agreed price": "8000.25",
    "agreement date": "2026-11-19", "agreement time": "10:00", acknowledgment: "on", "submission key": id, ...overrides,
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
  mocks.get.mockResolvedValueOnce(snapshot(provider)).mockResolvedValueOnce(missing).mockResolvedValueOnce({docs: []});
});
afterEach(() => vi.useRealTimers());

it("creates a confirmed custom record with a reference price and reserves its date", async () => {
  expect(await mutateWalkIn(form())).toEqual({message: "Walk-in booking recorded successfully.", reference: id, remaining: 0});
  expect(mocks.create).toHaveBeenCalledWith({id}, expect.objectContaining({
    providerId: "provider-one", bookingReference: id, source: "walk_in", status: "confirmed",
    serviceName: "Photography", agreedPriceCentavos: 800025, customerAcknowledged: true,
  }));
  const record = mocks.create.mock.calls[0][1];
  expect(record).not.toHaveProperty("customerId");
  expect(record).not.toHaveProperty("paymentStatus");
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({id: "provider-one"}),
    expect.objectContaining({walkInReservedCounts: {"2026-11-24": 1}}));
});

it("snapshots the selected package from the provider's catalog", async () => {
  mocks.get.mockResolvedValueOnce(snapshot({providerId: "provider-one", name: "Event photography", status: "published", isPublished: true, isActive: true}));
  expect(await mutateWalkIn(form({package: "packages/package-1", "custom service": ""}))).toHaveProperty("message");
  expect(mocks.create).toHaveBeenCalledWith({id}, expect.objectContaining({
    packageId: "package-1", serviceName: "Event photography",
  }));
});

it("rejects packages owned by a different provider", async () => {
  mocks.get.mockResolvedValueOnce(snapshot({providerId: "another-provider", name: "Other package"}));
  expect(await mutateWalkIn(form({package: "packages/package-1"}))).toHaveProperty("error");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rejects an online reservation and performs no writes", async () => {
  mocks.get.mockReset().mockResolvedValueOnce(snapshot(provider)).mockResolvedValueOnce(missing)
    .mockResolvedValueOnce({docs: [snapshot({status: "confirmed"})]});
  expect(await mutateWalkIn(form())).toHaveProperty("error");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects a second walk-in on the same date", async () => {
  mocks.get.mockReset().mockResolvedValueOnce(snapshot({...provider, walkInReservedDates: ["2026-11-24"]}))
    .mockResolvedValueOnce(missing).mockResolvedValueOnce({docs: []});
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
  expect(await mutateWalkIn(form({action: "cancelled", reference: id, "cancellation reason": "Customer requested cancellation"}))).toHaveProperty("message");
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({id: "provider-one"}),
    expect.objectContaining({walkInReservedCounts: {"2026-11-25": 1}}));
  expect(mocks.update).toHaveBeenCalledWith({id}, expect.objectContaining({status: "cancelled", cancellationReason: "Customer requested cancellation"}));
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


it.each(["full name", "contact number", "event date", "acknowledgment"])(
  "rejects invalid required fields before writing (%j)",
  async (invalid) => {
    expect(await mutateWalkIn(form({[invalid]: invalid === "event date" ? "2026-11-31" : ""}))).toHaveProperty("error");
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  },
);

it("rejects an unapproved provider inside the transaction", async () => {
  mocks.get.mockReset().mockResolvedValueOnce(snapshot({...provider, verificationStatus: "pending"}));
  expect(await mutateWalkIn(form())).toHaveProperty("error");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("replays the same submission without creating another booking or audit entry", async () => {
  mocks.get.mockReset().mockResolvedValueOnce(snapshot(provider))
    .mockResolvedValueOnce(snapshot({status: "confirmed"}));
  expect(await mutateWalkIn(form())).toMatchObject({reference: id});
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});

it("counts several online packages for one event as one of the available slots", async () => {
  mocks.get.mockReset().mockResolvedValueOnce(snapshot({...provider, maxEventsPerDay: 2}))
    .mockResolvedValueOnce(missing)
    .mockResolvedValueOnce({docs: [
      snapshot({status: "confirmed", mainEventId: "wedding"}, "one"),
      snapshot({status: "confirmed", mainEventId: "wedding"}, "two"),
    ]});
  expect(await mutateWalkIn(form())).toMatchObject({remaining: 0});
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.set).toHaveBeenCalledWith("audit", expect.objectContaining({
    actorId: "owner", action: "walk_in_created", targetId: id,
  }));
});

it("cannot read or change a reference absent from the provider's own records", async () => {
  mocks.get.mockReset().mockResolvedValueOnce(snapshot(provider)).mockResolvedValueOnce({data: () => undefined});
  expect(await mutateWalkIn(form({action: "cancelled", reference: id, "cancellation reason": "Test"})))
    .toHaveProperty("error");
  expect(mocks.update).not.toHaveBeenCalled();
});


it("rejects a mismatched provider profile before opening private records", async () => {
  mocks.readProvider.mockResolvedValueOnce(snapshot({...provider, ownerId: "different-owner"}));
  await expect(readWalkInProvider()).rejects.toThrow("Your provider account");
  expect(mocks.records).not.toHaveBeenCalled();
});

it.each([
  ["full name", "1111111111"],
  ["contact number", "11111111111"],
  ["event type", "11111"],
  ["custom service", "11111111"],
  ["number of guests", "100001"],
  ["agreed price", "8000.125"],
])("rejects an invalid %s before writing", async (name, value) => {
  expect(await mutateWalkIn(form({[name]: value}))).toHaveProperty("error");
  expect(mocks.runTransaction).not.toHaveBeenCalled();
});

const publishedOffer = {
  providerId: "provider-one", status: "published", isPublished: true, isActive: true,
  name: "Wedding catering", price: 15000, pricingModel: "per_bundle",
};

it("loads only owned, published, available offers and reads newly published offers on refresh", async () => {
  mocks.readProvider.mockResolvedValue(snapshot(provider));
  const newOffer = {...publishedOffer, name: "New package", status: "draft", isPublished: false};
  mocks.catalog.mockImplementation(async (kind) => ({docs: kind === "packages" ? [
    snapshot(publishedOffer, "owned"),
    snapshot({...publishedOffer, status: "archived"}, "archived"),
    snapshot({...publishedOffer, status: "rejected"}, "rejected"),
    snapshot({...publishedOffer, providerId: "other"}, "foreign"),
    snapshot({...publishedOffer, isDeleted: true}, "deleted"),
    snapshot(newOffer, "new"),
  ] : [
    snapshot({...publishedOffer, name: "Available service", isAvailable: true}, "available"),
    snapshot({...publishedOffer, isAvailable: false}, "unavailable"),
  ]}));
  expect((await listWalkInOffers()).map((offer) => offer.id)).toEqual(["available", "owned"]);
  expect(mocks.catalog).toHaveBeenCalledWith("packages", "providerId", "==", "provider-one");
  Object.assign(newOffer, {status: "published", isPublished: true});
  expect((await listWalkInOffers()).map((offer) => offer.id)).toEqual(["available", "new", "owned"]);
});

it("snapshots the original price and selected tier separately from the agreed amount", async () => {
  const offer = {...publishedOffer, serviceOptions: {
    drop_off: {price: 15000, includedServices: ["Delivery"]},
    full_service: {price: 20000, includedServices: ["Staff"]},
  }};
  mocks.get.mockResolvedValueOnce(snapshot(offer));
  expect(await mutateWalkIn(form({
    package: "packages/wedding", "pricing option": "full_service", "agreed price": "13500",
  }))).toHaveProperty("message");
  offer.price = 99999;
  const saved = mocks.create.mock.calls[0][1];
  expect(saved.catalogOffer.publishedPriceCentavos).toBe(1500000);
  expect(saved.pricingOption).toMatchObject({id: "full_service", priceCentavos: 2000000});
  expect(saved.agreedPriceCentavos).toBe(1350000);
  expect(mocks.update.mock.calls.every(([reference]) => reference !== "packages")).toBe(true);
});

it("rejects a forged tier or a multi-price booking with no tier or agreed amount", async () => {
  const offer = {...publishedOffer, serviceOptions: {
    drop_off: {price: 15000}, full_service: {price: 20000},
  }};
  mocks.get.mockResolvedValueOnce(snapshot(offer));
  expect(await mutateWalkIn(form({package: "packages/wedding", "pricing option": "forged"}))).toHaveProperty("error");
  mocks.get.mockResolvedValueOnce(snapshot(provider)).mockResolvedValueOnce(missing)
    .mockResolvedValueOnce({docs: []}).mockResolvedValueOnce(snapshot(offer));
  expect(await mutateWalkIn(form({package: "packages/wedding", "agreed price": ""}))).toHaveProperty("error");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("records a custom event type with the single booking acknowledgment", async () => {
  expect(await mutateWalkIn(form({"event type": "other", "custom event type": "Community celebration"})))
    .toHaveProperty("reference", id);
  expect(mocks.create).toHaveBeenCalledWith({id}, expect.objectContaining({
    eventType: "Community celebration", customerAcknowledged: true,
  }));
  expect(mocks.create.mock.calls[0][1]).not.toHaveProperty("customerRecordConsent");
});
