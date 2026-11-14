/**
 * Trusted-server inventory reader for future internal withdrawal coordination.
 * Not an HTTP endpoint, callable, scheduler, or transition executor.
 *
 * This only scans the currently stored package collection. Even a successful
 * terminal-page read is NOT transactionally frozen; publication writers and
 * catalog generation fencing must be integrated before execution is allowed.
 */
import {FieldPath} from "firebase-admin/firestore";
import {db} from "../shared/firestore.js";
import {
  scanOccasionPackageInventory,
  type OccasionInventoryScan,
  type OccasionInventoryRow,
} from "./occasion-transition-inventory-scan.js";

export async function inspectPrivateOccasionInventory(input: {
  action: "activate" | "deactivate";
  occasionId: string;
  applicableCategoryCodes: readonly string[];
}): Promise<OccasionInventoryScan> {
  return scanOccasionPackageInventory({
    ...input,
    readPage: async (afterId: string | null, limit: number):
    Promise<readonly OccasionInventoryRow[]> => {
      // Order by the canonical document ID, not updatedAt or createdAt.
      const base = db.collection("packages").orderBy(FieldPath.documentId());
      const query = (afterId === null ? base : base.startAfter(afterId)).limit(limit);
      const result = await query.get();
      return result.docs.map((doc) => ({id: doc.id, data: doc.data()}));
    },
  });
}
