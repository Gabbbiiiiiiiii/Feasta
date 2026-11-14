import {HttpsError} from "firebase-functions/v2/https";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./constants.js";

export interface PaginationInput {
  limit?: unknown;
  cursor?: unknown;
}

export interface ParsedPagination {
  limit: number;
  cursor?: string;
}

export function parsePagination(
  input: PaginationInput,
): ParsedPagination {
  let limit = DEFAULT_PAGE_SIZE;

  if (input.limit !== undefined) {
    if (
      typeof input.limit !== "number" ||
      !Number.isInteger(input.limit)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "limit must be an integer.",
      );
    }

    if (input.limit < 1) {
      throw new HttpsError(
        "invalid-argument",
        "limit must be at least 1.",
      );
    }

    limit = Math.min(
      input.limit,
      MAX_PAGE_SIZE,
    );
  }

  let cursor: string | undefined;

  if (input.cursor !== undefined) {
    if (typeof input.cursor !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "cursor must be a string.",
      );
    }

    const normalizedCursor =
      input.cursor.trim();

    if (normalizedCursor.length > 0) {
      cursor = normalizedCursor;
    }
  }

  return {
    limit,
    ...(cursor !== undefined
      ? {cursor}
      : {}),
  };
}