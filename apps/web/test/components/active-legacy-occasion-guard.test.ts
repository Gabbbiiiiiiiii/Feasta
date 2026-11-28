import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: (collection: string) => ({
      doc: (id: string) => ({
        path: `${collection}/${id}`,
      }),
    }),
    getAll: mocks.getAll,
  },
}));

import {loadActiveLegacyOccasionIds} from
  "@/lib/customer/discovery/active-legacy-occasion-guard";

function occasion(
  id: string,
  active: boolean,
  moderationState = "approved",
) {
  return {
    exists: true,
    id,
    data: () => ({
      id,
      active,
      moderationState,
      revision: 3,
    }),
  };
}

describe("Logical Deactivation — Web legacy discovery", () => {
  beforeEach(() => {
    mocks.getAll.mockReset();
  });

  it("excludes inactive Birthday and preserves active Wedding", async () => {
    mocks.getAll.mockResolvedValue([
      occasion("birthday", false),
      occasion("wedding", true),
    ]);

    const active = await loadActiveLegacyOccasionIds([
      {eventType: "birthday", isPublished: true},
      {eventType: "wedding", isPublished: true},
    ]);

    expect(active.has("birthday")).toBe(false);
    expect(active.has("wedding")).toBe(true);
    expect([...active]).toEqual(["wedding"]);

    expect(mocks.getAll).toHaveBeenCalledTimes(1);
    expect(
      mocks.getAll.mock.calls[0].map(
        (ref: {path: string}) => ref.path,
      ),
    ).toEqual([
      "occasions/birthday",
      "occasions/wedding",
    ]);
  });

  it("rejects missing or rejected occasion authority", async () => {
    mocks.getAll.mockResolvedValue([
      {exists: false, id: "birthday", data: () => undefined},
      occasion("wedding", true, "rejected"),
    ]);

    const active = await loadActiveLegacyOccasionIds([
      {eventType: "birthday"},
      {eventType: "wedding"},
    ]);

    expect(active.size).toBe(0);
  });

  it("rejects mismatched document identity and invalid revision", async () => {
    mocks.getAll.mockResolvedValue([
      {
        exists: true,
        id: "birthday",
        data: () => ({
          id: "another_occasion",
          active: true,
          moderationState: "approved",
          revision: 3,
        }),
      },
      {
        exists: true,
        id: "wedding",
        data: () => ({
          id: "wedding",
          active: true,
          moderationState: "approved",
          revision: 0,
        }),
      },
    ]);

    const active = await loadActiveLegacyOccasionIds([
      {eventType: "birthday"},
      {eventType: "wedding"},
    ]);

    expect(active.size).toBe(0);
  });

  it("rejects malformed occasion IDs without querying Firestore", async () => {
    const active = await loadActiveLegacyOccasionIds([
      {eventType: "../birthday", isPublished: true},
      {eventType: "", isPublished: true},
      {eventType: null, isPublished: true},
    ]);

    expect(active.size).toBe(0);
    expect(mocks.getAll).not.toHaveBeenCalled();
  });

  it("leaves V2 packages to their separate verifier", async () => {
    const active = await loadActiveLegacyOccasionIds([
      {
        occasionSchemaVersion: 2,
        eventType: "birthday",
        isPublished: true,
      },
    ]);

    expect(active.size).toBe(0);
    expect(mocks.getAll).not.toHaveBeenCalled();
  });

  it("deduplicates occasion lookups", async () => {
    mocks.getAll.mockResolvedValue([
      occasion("wedding", true),
    ]);

    const active = await loadActiveLegacyOccasionIds([
      {eventType: "wedding"},
      {eventType: "wedding"},
    ]);

    expect(active.has("wedding")).toBe(true);
    expect(mocks.getAll).toHaveBeenCalledTimes(1);
    expect(mocks.getAll.mock.calls[0]).toHaveLength(1);
  });

  it("does not publish packages when Firestore authority fails", async () => {
    mocks.getAll.mockRejectedValue(
      new Error("Authority unavailable"),
    );

    await expect(
      loadActiveLegacyOccasionIds([
        {eventType: "birthday", isPublished: true},
      ]),
    ).rejects.toThrow("Authority unavailable");
  });
});
