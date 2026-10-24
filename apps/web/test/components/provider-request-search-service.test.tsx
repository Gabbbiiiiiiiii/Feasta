import {Timestamp} from "firebase-admin/firestore";
import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({providerId: "provider-one", authorize: vi.fn(), where: vi.fn(), reads: 0, parentReads: 0,
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
  return {adminDb: {collection: () => query(), getAll: async (...refs: {id: string}[]) => {mocks.parentReads += refs.length; return refs.map(ref => ({id: ref.id, exists: mocks.parents.has(ref.id), data: () => mocks.parents.get(ref.id)}));}}};
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
  mocks.providerId = "provider-one"; mocks.reads = 0; mocks.parentReads = 0; mocks.documents = []; mocks.parents.clear(); mocks.where.mockClear();
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
    expect((await getProviderRequestPage()).requests).toHaveLength(10); expect(mocks.reads).toBe(11); expect(mocks.parentReads).toBe(0);
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


describe("provider frozen payment presentation projection", () => {
  it.each([false, true])("carries frozen agreement amounts through request details (accepted: %s)", async accepted => {
    const submittedAt = Timestamp.fromDate(new Date("2026-10-19T00:00:00Z"));
    const eventStartAt = "2026-10-20T00:00:00Z";
    const original = {status: accepted ? "accepted" : "pending", amount: 1000, downPaymentAmount: 500, downPaymentPercentage: 50,
      packagePaymentTerms: {paymentPolicy: "deposit_then_balance"},
      initialPaymentEligibilitySchemaVersion: 2,
      initialPaymentEligibility: {mode: "full_only", reason: "short_notice", depositAllowed: true,
        depositEligible: false, depositMinimumNoticeHours: 72, authorityTimeSource: "booking_submission", submittedAt, evaluatedAt: submittedAt, eventStartAt: Timestamp.fromDate(new Date(eventStartAt))},
      bookingPaymentAgreement: {schemaVersion: 1, timingSchemaVersion: 3, channel: "booking_submission",
        customerId: "customer-one", providerId: "provider-one", initialPaymentEligibilitySchemaVersion: 2, depositEligible: false, eligibilityReason: "short_notice", agreedAt: submittedAt, eventStartAt,
        grossAmountInCentavos: 100000, requiredUpfrontAmountInCentavos: 100000, remainingBalanceInCentavos: 0},
      ...(accepted ? {financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
        requiredUpfrontAmountInCentavos: 50000, remainingBalanceInCentavos: 50000}} : {})};
    const {bookingPaymentAgreement, ...child} = original;
    mocks.parents.set("event-one", {customerId: "customer-one", providerId: "provider-one", mainEventId: "event-one",
      providerRequestIds: ["request-0000"], bookingPaymentAgreement,
      initialPaymentEligibilitySchemaVersion: 2, initialPaymentEligibility: child.initialPaymentEligibility});
    mocks.documents = [document(0, child)];
    const result = await getProviderRequestDetail("request-0000");
    expect(result.initialPaymentPresentation).toEqual({kind: "full", amount: 1000,
      explanation: "Full payment is required because the booking was submitted fewer than 72 hours before the event."});
    expect(result.downPaymentAmount).toBe(500);
    expect(result.downPaymentPercentage).toBe(50);
    expect(original.bookingPaymentAgreement.requiredUpfrontAmountInCentavos).toBe(100000);
    if (!accepted) expect(original).not.toHaveProperty("financialSnapshot");
    expect(mocks.documents[0].data()).not.toHaveProperty("bookingPaymentAgreement");
    const parent = mocks.parents.get("event-one")!;
    for (const patch of [
      {customerId: "foreign"}, {providerId: "foreign"}, {currentProviderId: "foreign"},
      {mainEventId: "foreign"}, {bookingId: "foreign"}, {providerRequestIds: ["foreign"]},
      {bookingPaymentAgreement: {...bookingPaymentAgreement, customerId: "foreign"}},
      {bookingPaymentAgreement: {...bookingPaymentAgreement, providerId: "foreign"}},
      {bookingPaymentAgreement: {...bookingPaymentAgreement, grossAmountInCentavos: 200000}},
      {initialPaymentEligibility: {...child.initialPaymentEligibility, submittedAt: Timestamp.fromMillis(0)}},
      {bookingPaymentAgreement: undefined}, {initialPaymentEligibility: undefined},
    ]) {
      mocks.parents.set("event-one", {...parent, ...patch});
      expect((await getProviderRequestDetail("request-0000")).initialPaymentPresentation?.kind).toBe("unavailable");
    }
    mocks.parents.set("event-one", parent);
    for (const patch of [{bookingId: "foreign"}, {providerRequestId: "foreign"}, {amount: 999},
      {bookingPaymentAgreement: {...bookingPaymentAgreement, requiredUpfrontAmountInCentavos: 50000}},
      {financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
        requiredUpfrontAmountInCentavos: 60000, remainingBalanceInCentavos: 40000}},
    ]) {
      mocks.documents = [document(0, {...child, ...patch})];
      expect((await getProviderRequestDetail("request-0000")).initialPaymentPresentation?.kind).toBe("unavailable");
    }
    const depositEligibility = {...child.initialPaymentEligibility, mode: "minimum_or_full", reason: "deposit_eligible",
      depositEligible: true, submittedAt: Timestamp.fromMillis(submittedAt.toMillis() - 4 * 86400000),
      evaluatedAt: Timestamp.fromMillis(submittedAt.toMillis() - 4 * 86400000)};
    mocks.parents.set("event-one", {...parent, initialPaymentEligibility: depositEligibility,
      bookingPaymentAgreement: {...bookingPaymentAgreement, depositEligible: true, eligibilityReason: "deposit_eligible",
        agreedAt: depositEligibility.submittedAt, requiredUpfrontAmountInCentavos: 50000, remainingBalanceInCentavos: 50000}});
    mocks.documents = [document(0, {...child, initialPaymentEligibility: depositEligibility})];
    expect((await getProviderRequestDetail("request-0000")).initialPaymentPresentation).toMatchObject({kind: "minimum", amount: 500});

  });
});


describe("external add-on payment projection through request details", () => {
  it.each([false, true])("reads agreement-only add-on payment (accepted: %s)", async accepted => {
    const eventStartAt = Timestamp.fromDate(new Date("2030-10-10T06:00:00Z"));
    const agreement = {schemaVersion: 1, timingSchemaVersion: 3, channel: "booking_submission",
      initialPaymentEligibilitySchemaVersion: 2, paymentPolicy: {paymentPolicy: "full_payment"},
      customerId: "customer-one", providerId: "provider-one", agreedAt: Timestamp.fromMillis(1700000000000),
      eventStartAt: eventStartAt.toDate().toISOString(), depositEligible: false, eligibilityReason: "package_full_payment",
      grossAmountInCentavos: 100000, requiredUpfrontAmountInCentavos: 100000, remainingBalanceInCentavos: 0};
    const original = {type: "addon", status: accepted ? "accepted" : "pending", amount: 1000, downPaymentAmount: 1000,
      downPaymentPercentage: 100, eventStartAt, bookingPaymentAgreement: agreement,
      ...(accepted ? {financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
        requiredUpfrontAmountInCentavos: 100000, remainingBalanceInCentavos: 0}} : {})};
    mocks.documents = [document(0, original)];
    const result = await getProviderRequestDetail("request-0000");
    expect(result.initialPaymentPresentation).toMatchObject({kind: "full", amount: 1000});
    expect(result.downPaymentAmount).toBe(1000);
    expect(original).not.toHaveProperty("initialPaymentEligibility");
    if (!accepted) expect(original).not.toHaveProperty("financialSnapshot");
  });
});

it("keeps historical detail payment eligibility unavailable when frozen evidence is absent", async () => {
  mocks.documents = [document(0)];
  expect((await getProviderRequestDetail("request-0000")).initialPaymentPresentation?.kind).toBe("unavailable");
});
