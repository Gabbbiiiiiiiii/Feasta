import {describe, expect, it} from "vitest";
import {
  occasionDiscoveryScopeKey,
  encodeOccasionDiscoveryCursor,
  decodeOccasionDiscoveryCursor,
} from "@/lib/customer/providers/occasion-discovery-cursor";

const filters = {
  occasionId: "wedding",
  search: "flowers",
  serviceType: "addon",
  categories: ["photographer", "catering"],
};

function cursor(direction: "next" | "previous" = "next") {
  const scope = occasionDiscoveryScopeKey(filters);
  return encodeOccasionDiscoveryCursor({
    direction,
    favoriteCount: 25,
    providerId: "provider_123",
    scope,
  });
}

describe("occasion-scoped provider discovery cursors", () => {
  it("round-trips a forward cursor", () => {
    const scope = occasionDiscoveryScopeKey(filters);
    expect(decodeOccasionDiscoveryCursor(cursor(), scope)).toEqual({
      version: 1,
      direction: "next",
      favoriteCount: 25,
      providerId: "provider_123",
      scope,
    });
  });

  it("preserves backward pagination direction", () => {
    const scope = occasionDiscoveryScopeKey(filters);
    expect(decodeOccasionDiscoveryCursor(cursor("previous"), scope)?.direction)
      .toBe("previous");
  });

  it("rejects reuse between Wedding and Birthday", () => {
    const birthday = occasionDiscoveryScopeKey({
      ...filters,
      occasionId: "birthday",
    });

    expect(decodeOccasionDiscoveryCursor(cursor(), birthday)).toBeNull();
  });

  it("rejects reuse when the search changes", () => {
    const other = occasionDiscoveryScopeKey({
      ...filters,
      search: "catering",
    });

    expect(decodeOccasionDiscoveryCursor(cursor(), other)).toBeNull();
  });

  it("rejects reuse when service type changes", () => {
    const other = occasionDiscoveryScopeKey({
      ...filters,
      serviceType: "catering",
    });

    expect(decodeOccasionDiscoveryCursor(cursor(), other)).toBeNull();
  });

  it("rejects reuse when categories change", () => {
    const other = occasionDiscoveryScopeKey({
      ...filters,
      categories: ["photographer"],
    });

    expect(decodeOccasionDiscoveryCursor(cursor(), other)).toBeNull();
  });

  it("canonicalizes category order and duplicates", () => {
    const original = occasionDiscoveryScopeKey(filters);
    const reordered = occasionDiscoveryScopeKey({
      ...filters,
      categories: ["catering", "photographer", "catering"],
    });

    expect(reordered).toBe(original);
  });

  it("rejects malformed cursors", () => {
    const scope = occasionDiscoveryScopeKey(filters);

    expect(decodeOccasionDiscoveryCursor("invalid", scope)).toBeNull();
    expect(decodeOccasionDiscoveryCursor("a".repeat(1025), scope)).toBeNull();
    expect(decodeOccasionDiscoveryCursor(null, scope)).toBeNull();
  });
});