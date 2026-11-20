/**
 * Private server-only Firestore historical inventory reader.
 *
 * No callable export, writes, backfill, or transition authorization.
 * Pagination alone does not establish snapshot isolation.
 */

import {FieldPath} from "firebase-admin/firestore";
import {db} from "../shared/firestore.js";

import {
  scanHistoricalOccasionInventory,
  type HistoricalCollection,
  type HistoricalInventoryScan,
} from "./occasion-historical-inventory-scan.js";

const COLLECTIONS = [
  "packages",
  "mainEvents",
  "providerRequests",
] as const;

function validCollection(
  value: unknown,
): value is HistoricalCollection {
  return typeof value === "string" &&
    COLLECTIONS.some(collection => collection === value);
}

/**
 * Private helper. Calling this reads Firestore but never writes.
 *
 * Not an authorization or evidence-completeness certificate.
 */
export async function readHistoricalOccasionCollection(
  collection: HistoricalCollection,
): Promise<HistoricalInventoryScan> {
  if (!validCollection(collection)) {
    throw new Error("INVALID_HISTORICAL_INVENTORY_REQUEST");
  }

  return scanHistoricalOccasionInventory({
    collection,
    readPage: async (afterId, limit) => {
      const base = db.collection(collection)
        .orderBy(FieldPath.documentId());

      const query = afterId === null ?
        base.limit(limit) :
        base.startAfter(afterId).limit(limit);

      const snapshot = await query.get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        data: doc.data(),
      }));
    },
  });
}
