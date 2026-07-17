import {initializeApp} from "firebase-admin/app";
import {
  FieldPath,
  Firestore,
  getFirestore,
} from "firebase-admin/firestore";

const RETAINED_COLLECTIONS = [
  "providers",
  "packages",
  "addons",
  "reviews",
  "complaints",
  "announcements",
] as const;
const PAGE_SIZE = 250;

function buildSearchTokens(values: unknown[]): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const word of value.toLowerCase().split(/[^a-z0-9]+/u)) {
      if (!word) continue;
      tokens.add(word);
      for (let length = 2; length <= Math.min(word.length, 20); length++) {
        tokens.add(word.slice(0, length));
      }
    }
  }
  return [...tokens].slice(0, 200);
}

async function backfillCollection(
  firestore: Firestore,
  collectionName: string,
  apply: boolean,
): Promise<number> {
  let lastId: string | undefined;
  let changed = 0;

  do {
    let query = firestore.collection(collectionName)
      .orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastId) query = query.startAfter(lastId);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = firestore.batch();
    let writes = 0;
    for (const document of snapshot.docs) {
      const data = document.data();
      const update: Record<string, unknown> = {};
      if (!("isDeleted" in data)) update.isDeleted = false;
      if (!("deletedAt" in data)) update.deletedAt = null;
      if (!("deletedBy" in data)) update.deletedBy = null;
      if (!("deletionReason" in data)) update.deletionReason = null;

      if (collectionName === "providers" && !("searchTokens" in data)) {
        update.searchTokens = buildSearchTokens([
          data.businessName,
          data.city,
          data.province,
          data.providerServiceType,
          data.providerCategory,
          ...(Array.isArray(data.serviceAreas) ? data.serviceAreas : []),
          ...(Array.isArray(data.eventTypesSupported) ?
            data.eventTypesSupported : []),
        ]);
      }

      if (Object.keys(update).length > 0) {
        changed++;
        writes++;
        if (apply) batch.update(document.ref, update);
      }
    }
    if (apply && writes > 0) await batch.commit();
    lastId = snapshot.docs.at(-1)?.id;
  } while (lastId);

  return changed;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  initializeApp();
  const firestore = getFirestore();

  for (const collectionName of RETAINED_COLLECTIONS) {
    const changed = await backfillCollection(
      firestore,
      collectionName,
      apply,
    );
    console.log(`${collectionName}: ${changed} document(s) ${
      apply ? "updated" : "would be updated"
    }`);
  }

  if (!apply) console.log("Dry run only. Re-run with --apply to write changes.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
