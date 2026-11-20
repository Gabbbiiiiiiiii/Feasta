import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  catalogGet: vi.fn(),
  occasionGet: vi.fn(),
  getAll: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    doc: () => ({get: mocks.catalogGet}),
    collection: (name: string) => ({
      doc: (id: string) => ({
        id,
        get: name === "occasions"
          ? mocks.occasionGet
          : vi.fn(),
      }),
    }),
    getAll: mocks.getAll,
  },
}));

import {checkTrustedProviderOccasion} from
  "@/lib/customer/providers/trusted-provider-occasion-reader";

const provider = {
  verificationStatus: "approved",
  publiclyVisible: true,
  isActive: true,
  isBlocked: false,
  isSuspended: false,
  isDeleted: false,
  serviceCategories: ["catering"],
  eventTypesSupported: ["wedding"],
};

const candidate = {
  id: "provider_1",
  data: provider,
};

const approvedAuthority = {
  revision: 3,
  approvedOccasionIds: ["birthday"],
  approvedCategoryCodes: ["catering"],
};

describe("trusted provider occasion reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.catalogGet.mockResolvedValue({
      data: () => ({
        revision: 7,
        activationState: "stable",
      }),
    });

    mocks.occasionGet.mockResolvedValue({
      data: () => ({
        id: "birthday",
        active: true,
        moderationState: "approved",
        applicableServiceCategoryCodes: ["catering"],
      }),
    });

    mocks.getAll.mockResolvedValue([{
      id: "provider_1",
      exists: true,
      data: () => approvedAuthority,
    }]);
  });

  it("accepts a verified Admin grant, not the legacy event types", async () => {
    const result = await checkTrustedProviderOccasion(
      "birthday",
      [candidate],
    );

    expect(result.valid).toBe(true);
    expect([...result.eligibleProviderIds]).toEqual(["provider_1"]);
    expect(mocks.getAll).toHaveBeenCalledOnce();
  });

  it("does not grant eligibility when the authority is missing", async () => {
    mocks.getAll.mockResolvedValue([{
      id: "provider_1",
      exists: false,
      data: () => undefined,
    }]);

    const result = await checkTrustedProviderOccasion(
      "birthday",
      [candidate],
    );

    expect(result.valid).toBe(true);
    expect(result.eligibleProviderIds.size).toBe(0);
  });

  it("fails closed when the catalog is unstable", async () => {
    mocks.catalogGet.mockResolvedValue({
      data: () => ({
        revision: 7,
        activationState: "updating",
      }),
    });

    const result = await checkTrustedProviderOccasion(
      "birthday",
      [candidate],
    );

    expect(result.valid).toBe(false);
    expect(result.eligibleProviderIds.size).toBe(0);
    expect(mocks.getAll).not.toHaveBeenCalled();
  });

  it("fails closed when the catalog revision changes during the read", async () => {
    mocks.catalogGet
      .mockResolvedValueOnce({
        data: () => ({
          revision: 7,
          activationState: "stable",
        }),
      })
      .mockResolvedValueOnce({
        data: () => ({
          revision: 8,
          activationState: "stable",
        }),
      });

    const result = await checkTrustedProviderOccasion(
      "birthday",
      [candidate],
    );

    expect(result.valid).toBe(false);
    expect(result.eligibleProviderIds.size).toBe(0);
  });

  it("rejects oversized candidate batches", async () => {
    const candidates = Array.from({length: 51}, (_, index) => ({
      id: `provider_${index}`,
      data: provider,
    }));

    const result = await checkTrustedProviderOccasion(
      "birthday",
      candidates,
    );

    expect(result.valid).toBe(false);
    expect(mocks.getAll).not.toHaveBeenCalled();
  });
});