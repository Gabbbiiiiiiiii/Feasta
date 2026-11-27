import "server-only";

import type {DocumentData, Query} from "firebase-admin/firestore";

/**
 * Safely executes a Firestore aggregation count query.
 * Returns null if the query object is a test double without `.count()`
 * or if the count query cannot be evaluated.
 */
export async function countFirestoreQuery(
  query: Query<DocumentData>,
): Promise<number | null> {
  if (typeof (query as {count?: unknown}).count !== "function") {
    return null;
  }

  try {
    const snapshot = await query.count().get();
    const count = snapshot.data()?.count;
    return typeof count === "number" && Number.isFinite(count) && count >= 0
      ? count
      : null;
  } catch {
    return null;
  }
}
