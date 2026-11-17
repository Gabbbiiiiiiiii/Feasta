import {createHash} from "node:crypto";
import type {Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {offerNameKey} from "./service-offer-policy.js";

/** A read/write lock serializes concurrent claims for the same provider/name. */
export async function prepareUniqueServiceName(
  transaction: Transaction, providerId: string, name: string, serviceId: string,
) {
  const key=offerNameKey(name);
  const lockId=createHash("sha256").update(JSON.stringify([providerId,key])).digest("hex");
  const lock=db.collection("providerOfferNameLocks").doc(lockId);
  await transaction.get(lock);
  for (const collection of ["addons","packages"]) {
    const snapshot=await transaction.get(
      db.collection(collection).where("providerId","==",providerId),
    );
    if (snapshot.docs.some((doc) => {
      const data=doc.data();
      return !(collection==="addons" && doc.id===serviceId) && data.isDeleted!==true &&
        typeof data.name==="string" && offerNameKey(data.name)===key;
    })) throw new HttpsError("already-exists","You already have a package with this name.");
  }
  // Caller invokes only after all other transaction reads have completed.
  return () => transaction.set(lock,{providerId,nameKey:key,updatedAt:serverTimestamp()});
}
