import {describe, expect, it} from "vitest";

import {computeTotalPages, formatPageLabel} from "@/lib/pagination";

describe("pagination helpers", () => {
  it("computes total pages from count and page size", () => {
    expect(computeTotalPages(0, 10)).toBe(1);
    expect(computeTotalPages(1, 10)).toBe(1);
    expect(computeTotalPages(10, 10)).toBe(1);
    expect(computeTotalPages(11, 10)).toBe(2);
    expect(computeTotalPages(45, 10)).toBe(5);
    expect(computeTotalPages(null, 10)).toBeNull();
    expect(computeTotalPages(undefined, 10)).toBeNull();
    expect(computeTotalPages(-1, 10)).toBeNull();
  });

  it("formats page labels with total pages when known or on the final page", () => {
    expect(formatPageLabel(1, 5)).toBe("Page 1 of 5");
    expect(formatPageLabel(2, 5)).toBe("Page 2 of 5");
    expect(formatPageLabel(6, 5)).toBe("Page 6 of 6");
    expect(formatPageLabel(1, null, {hasMore: false})).toBe("Page 1 of 1");
    expect(formatPageLabel(3, undefined, {hasMore: false})).toBe("Page 3 of 3");
    expect(formatPageLabel(2, null, {hasMore: true})).toBe("Page 2");
    expect(formatPageLabel(1, 3, {prefix: "Conversation page"})).toBe("Conversation page 1 of 3");
  });
});
