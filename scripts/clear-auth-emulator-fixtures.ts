import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

import {
  AUTH_FIXTURE_ACCOUNTS,
  AUTH_FIXTURE_MARKER,
  SEEDED_TOP_LEVEL_COLLECTIONS,
} from "./auth-emulator-fixtures.ts";

const projectId = process.env.GCLOUD_PROJECT ?? "feasta-catering-system";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const firestoreHost =
  process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;

assertLocalEmulator(authHost, "Auth");
assertLocalEmulator(firestoreHost, "Firestore");

const app = getApps()[0] ?? initializeApp({projectId});
const auth = getAuth(app);
const db = getFirestore(app);

const fixtureUids = AUTH_FIXTURE_ACCOUNTS.map((account) => account.uid);
for (let offset = 0; offset < fixtureUids.length; offset += 1000) {
  await auth.deleteUsers(fixtureUids.slice(offset, offset + 1000));
}

let deletedDocuments = 0;
for (const collectionName of SEEDED_TOP_LEVEL_COLLECTIONS) {
  const snapshot = await db
    .collection(collectionName)
    .where("emulatorFixture", "==", AUTH_FIXTURE_MARKER)
    .get();
  deletedDocuments += await deleteReferences(snapshot.docs.map((doc) => doc.ref));
}

const nestedDocuments = await db
  .collectionGroup("documents")
  .where("emulatorFixture", "==", AUTH_FIXTURE_MARKER)
  .get();
deletedDocuments += await deleteReferences(
  nestedDocuments.docs.map((doc) => doc.ref),
);

console.log(
  `Removed ${fixtureUids.length} deterministic Auth fixture IDs and ` +
    `${deletedDocuments} marked Firestore fixture documents.`,
);

async function deleteReferences(
  references: FirebaseFirestore.DocumentReference[],
): Promise<number> {
  for (let offset = 0; offset < references.length; offset += 400) {
    const batch = db.batch();
    for (const reference of references.slice(offset, offset + 400)) {
      batch.delete(reference);
    }
    await batch.commit();
  }
  return references.length;
}

function assertLocalEmulator(host: string, name: string): void {
  const hostname = host.split(":")[0]?.toLowerCase();
  if (!hostname || !["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`${name} host must be local; received ${host}.`);
  }
}
