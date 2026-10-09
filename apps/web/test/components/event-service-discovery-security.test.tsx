import {readFileSync} from "node:fs";
import {join} from "node:path";

import {beforeEach, describe, expect, it, vi} from "vitest";

import {getPublicEventServices} from "@/lib/customer/discovery/event-service-discovery-service";

const state = vi.hoisted(() => {
  const records = new Map<string, Record<string, unknown>>();
  const candidates: {id: string; data: () => Record<string, unknown>}[] = [];
  const query = {
    where: vi.fn(),
    limit: vi.fn(),
    // Deliberately return raw candidates so query filters cannot hide a missing guard.
    get: vi.fn(async () => ({docs: candidates})),
  };
  const db = {
    collection: vi.fn((name: string) => ({
      ...query,
      doc: (id: string) => ({id, path: `${name}/${id}`}),
    })),
    getAll: vi.fn(async (...refs: {id: string; path: string}[]) => refs.map((ref) => ({
      id: ref.id,
      exists: records.has(ref.path),
      data: () => records.get(ref.path),
    }))),
  };
  return {records, candidates, query, db};
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: state.db}));

const provider = {
  ownerId: "provider-owner",
  businessName: "Public Event Services",
  providerServiceType: "addon",
  verificationStatus: "approved",
  publiclyVisible: true,
  isActive: true,
  isSuspended: false,
  isDeleted: false,
};
const owner = {
  role: "provider",
  providerId: "provider-one",
  accountStatus: "active",
  isActive: true,
  isBlocked: false,
};
const candidate = {
  providerId: "provider-one",
  ownerId: "provider-owner",
  name: "Event coordination",
  status: "published",
  isPublished: true,
  isActive: true,
  isAvailable: true,
  isDeleted: false,
};

function addCandidate(change: Record<string, unknown> = {}) {
  state.candidates.push({id: "service-one", data: () => ({...candidate, ...change})});
}

beforeEach(() => {
  vi.clearAllMocks();
  state.records.clear();
  state.candidates.length = 0;
  state.query.where.mockReturnValue(state.query);
  state.query.limit.mockReturnValue(state.query);
  state.records.set("providers/provider-one", {...provider});
  state.records.set("users/provider-owner", {...owner});
});

describe("public event-service discovery security", () => {
  it("returns a published service only with its canonical public provider and owner", async () => {
    addCandidate();
    const result = await getPublicEventServices("catering-provider");
    expect(result.services).toHaveLength(1);
    expect(result.services[0]).toMatchObject({
      id: "service-one",
      providerId: "provider-one",
      providerName: provider.businessName,
      name: candidate.name,
    });
    expect(state.db.getAll).toHaveBeenNthCalledWith(1,
      {id: "provider-one", path: "providers/provider-one"});
    expect(state.db.getAll).toHaveBeenNthCalledWith(2,
      {id: "provider-owner", path: "users/provider-owner"});
  });

  it.each([
    {isDeleted: true},
    {status: "draft"}, {status: undefined},
    {isPublished: false}, {isPublished: undefined}, {isPublished: "true"},
    {isActive: false}, {isActive: undefined}, {isActive: "true"},
    {isAvailable: false}, {isAvailable: undefined}, {isAvailable: "true"},
  ])("rejects a non-public candidate before provider reads: %j", async (change) => {
    addCandidate(change);
    expect(await getPublicEventServices("catering-provider")).toEqual({services: []});
    expect(state.db.getAll).not.toHaveBeenCalled();
  });

  it("permits an otherwise public record without a deletion flag", async () => {
    addCandidate({isDeleted: undefined});
    expect((await getPublicEventServices("catering-provider")).services).toHaveLength(1);
  });

  it.each([undefined, null, "", "   ", 42, "bad/provider", "bad provider"])(
    "rejects an absent or invalid candidate providerId: %j", async (providerId) => {
      addCandidate({providerId});
      expect(await getPublicEventServices("catering-provider")).toEqual({services: []});
      expect(state.db.getAll).not.toHaveBeenCalled();
    },
  );

  it.each(["providers/provider-one", "users/provider-owner"])(
    "rejects a missing canonical record: %s", async (missing) => {
      addCandidate();
      state.records.delete(missing);
      expect(await getPublicEventServices("catering-provider")).toEqual({services: []});
    },
  );

  it.each([
    {verificationStatus: "pending"}, {publiclyVisible: false}, {isActive: false},
    {isSuspended: true}, {isDeleted: true}, {ownerId: undefined},
    {businessName: ""}, {providerServiceType: "invalid"},
  ])("preserves canonical provider visibility validation: %j", async (change) => {
    addCandidate();
    state.records.set("providers/provider-one", {...provider, ...change});
    expect(await getPublicEventServices("catering-provider")).toEqual({services: []});
  });

  it.each([{isBlocked: true}, {accountStatus: "inactive"}, {providerId: "another-provider"}])(
    "preserves canonical owner validation: %j", async (change) => {
      addCandidate();
      state.records.set("users/provider-owner", {...owner, ...change});
      expect(await getPublicEventServices("catering-provider")).toEqual({services: []});
    },
  );

  it.each([undefined, null, "other-owner", "provider-one"])(
    "rejects candidate ownership that differs from the canonical provider owner: %j", async (ownerId) => {
      addCandidate({ownerId});
      expect(await getPublicEventServices("catering-provider")).toEqual({services: []});
    },
  );

  it("keeps candidate enumeration bounded and scoped to active, available addons", async () => {
    await getPublicEventServices("catering-provider");
    expect(state.db.collection).toHaveBeenCalledExactlyOnceWith("addons");
    expect(state.query.where.mock.calls).toEqual([
      ["isActive", "==", true],
      ["isAvailable", "==", true],
    ]);
    expect(state.query.limit).toHaveBeenCalledExactlyOnceWith(60);
    expect(state.query.get).toHaveBeenCalledOnce();

    const source = readFileSync(join(process.cwd(),
      "src/lib/customer/discovery/event-service-discovery-service.ts"), "utf8");
    expect(source).toContain("const EVENT_SERVICE_CANDIDATE_LIMIT = 60;");
    expect(source).toContain(".limit(EVENT_SERVICE_CANDIDATE_LIMIT)");
    expect(source).toMatch(/!providerId\s*\|\|\s*!isPublicProviderId\(providerId\)/u);
  });
});
