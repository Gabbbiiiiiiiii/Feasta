export const BOARD_TABLE_PAGE_SIZE = 10;

export function paginateBoardRows<T>(
  rows: readonly T[],
  pageIndex: number,
  pageSize: number = BOARD_TABLE_PAGE_SIZE,
): {
  pageRows: T[];
  safePageIndex: number;
  previousCursor: number | null;
  nextCursor: number | null;
  pageLabel: string;
} {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePageIndex = Math.min(Math.max(pageIndex, 0), pageCount - 1);
  const start = safePageIndex * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const end = Math.min(start + pageRows.length, rows.length);

  return {
    pageRows,
    safePageIndex,
    previousCursor: safePageIndex > 0 ? safePageIndex - 1 : null,
    nextCursor: safePageIndex + 1 < pageCount ? safePageIndex + 1 : null,
    pageLabel:
      rows.length === 0
        ? "No rows to show"
        : `Showing ${start + 1}-${end} of ${rows.length}`,
  };
}
