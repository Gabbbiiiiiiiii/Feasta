import {describe, expect, it} from "vitest";

import {paginateBoardRows} from "@/components/admin/payments/board-table-pagination";

describe("paginateBoardRows", () => {
  it("pages a full list into fixed-size windows", () => {
    const rows = Array.from({length: 25}, (_, index) => index + 1);
    const first = paginateBoardRows(rows, 0, 10);
    expect(first.pageRows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(first.previousCursor).toBeNull();
    expect(first.nextCursor).toBe(1);
    expect(first.pageLabel).toBe("Showing 1-10 of 25");

    const second = paginateBoardRows(rows, 1, 10);
    expect(second.pageRows).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(second.previousCursor).toBe(0);
    expect(second.nextCursor).toBe(2);

    const last = paginateBoardRows(rows, 2, 10);
    expect(last.pageRows).toEqual([21, 22, 23, 24, 25]);
    expect(last.nextCursor).toBeNull();
    expect(last.pageLabel).toBe("Showing 21-25 of 25");
  });

  it("clamps an out-of-range page index", () => {
    const rows = [1, 2, 3];
    const page = paginateBoardRows(rows, 99, 10);
    expect(page.safePageIndex).toBe(0);
    expect(page.pageRows).toEqual([1, 2, 3]);
  });
});
