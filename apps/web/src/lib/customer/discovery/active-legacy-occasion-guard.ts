import "server-only";

import {adminDb} from "@/lib/firebase/admin";

const OCCASION_ID = /^[a-z][a-z0-9_]{1,63}$/u;

/**
 * Validate current occasion authority for legacy public packages.
 * Existing published package documents are never modified.
 * V2 packages use their separate generation-aware verification.
 */
export async function loadActiveLegacyOccasionIds(
  records: readonly Readonly<Record<string, unknown>>[],
): Promise<ReadonlySet<string>> {
  const ids = [...new Set(records.flatMap((record) => {
    if (record.occasionSchemaVersion === 2) return [];

    const eventType = record.eventType;

    return typeof eventType === "string" &&
        OCCASION_ID.test(eventType)
      ? [eventType]
      : [];
  }))];

  if (ids.length === 0) return new Set<string>();

  const snapshots = await adminDb.getAll(
    ...ids.map((id) => adminDb.collection("occasions").doc(id)),
  );

  return new Set(snapshots.flatMap((snapshot) => {
    const occasion = snapshot.data();

    return snapshot.exists &&
        occasion?.id === snapshot.id &&
        occasion.active === true &&
        occasion.moderationState === "approved" &&
        Number.isSafeInteger(occasion.revision) &&
        occasion.revision > 0
      ? [snapshot.id]
      : [];
  }));
}
