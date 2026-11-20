import {createHash} from "node:crypto";
import type {Firestore, Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {serverTimestamp} from "../shared/timestamps.js";
import {offerNameKey} from "./service-offer-policy.js";

/** A read/write lock serializes concurrent claims for the same provider/name. */
export async function prepareUniqueServiceName(
  transaction: Transaction, firestore: Firestore, providerId: string, name: string, serviceId: string,
) {
  return prepareOfferName(transaction, firestore, providerId, name, ["addons", "packages"], serviceId);
}

/** Catering packages share the service namespace while retaining package-to-package behavior. */
export async function preparePackageServiceName(
  transaction: Transaction, firestore: Firestore, providerId: string, name: string, previousName?: unknown,
) {
  if (typeof previousName === "string" && offerNameKey(previousName) === offerNameKey(name)) {
    return;
  }
  return prepareOfferName(transaction, firestore, providerId, name, ["addons"]);
}

async function prepareOfferName(
  transaction: Transaction, firestore: Firestore, providerId: string, name: string,
  collections: readonly string[], serviceId?: string,
) {
  const key = offerNameKey(name);
  const lockId = createHash("sha256").update(JSON.stringify([providerId, key])).digest("hex");
  const lock = firestore.collection("providerOfferNameLocks").doc(lockId);
  await transaction.get(lock);
  // Legacy offers have only a display name. Read only this provider's records
  // and compare their names with the same normalization as the lock key.
  for (const collection of collections) {
    const snapshot = await transaction.get(
      firestore.collection(collection).where("providerId", "==", providerId).select("name", "isDeleted"),
    );
    if (snapshot.docs.some((doc) => {
      const data = doc.data();
      return !(collection === "addons" && doc.id === serviceId) && data.isDeleted !== true &&
        typeof data.name === "string" && offerNameKey(data.name) === key;
    })) throw new HttpsError("already-exists","You already have a package with this name.");
  }
  // Caller invokes only after all other transaction reads have completed.
  return () => transaction.set(lock,{providerId,nameKey:key,updatedAt:serverTimestamp()});
}
