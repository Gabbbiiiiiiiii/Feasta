export function computeTotalPages(
  totalCount: number | null | undefined,
  pageSize: number,
): number | null {
  if (
    typeof totalCount !== "number" ||
    !Number.isFinite(totalCount) ||
    totalCount < 0
  ) {
    return null;
  }

  const safePageSize = Math.max(1, Math.trunc(pageSize));
  return Math.max(1, Math.ceil(totalCount / safePageSize));
}

export function formatPageLabel(
  pageNumber: number,
  totalPages?: number | null,
  options?: {
    prefix?: string;
    hasMore?: boolean;
  },
): string {
  const safePage = Math.max(1, Math.trunc(pageNumber));
  const prefix = options?.prefix ?? "Page";

  if (
    typeof totalPages === "number" &&
    Number.isFinite(totalPages) &&
    totalPages >= 1
  ) {
    const safeTotal = Math.max(safePage, Math.trunc(totalPages));
    return `${prefix} ${safePage} of ${safeTotal}`;
  }

  if (options?.hasMore === false) {
    return `${prefix} ${safePage} of ${safePage}`;
  }

  return `${prefix} ${safePage}`;
}
