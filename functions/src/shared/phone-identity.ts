import {getAuth, type UserRecord} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {normalizePhilippineMobile} from "./validation.js";

const phoneCollisionMessage =
  "This mobile number is already associated with another FEASTA account. " +
  "Sign in with that account or use a different mobile number.";

/** Returns a normalized phone only when Firebase Auth links the phone provider. */
export function authoritativeFirebasePhone(
  authUser: UserRecord,
): string | null {
  const phoneNumber = normalizePhilippineMobile(authUser.phoneNumber);
  return phoneNumber && authUser.providerData.some(
    (provider) => provider.providerId === "phone",
  ) ? phoneNumber : null;
}

/**
 * Confirms that Firebase Auth resolves the normalized phone back to the same
 * UID and that no different FEASTA identity/profile projects that phone.
 */
export async function requireGlobalPhoneIdentityOwnership(
  authUser: UserRecord,
  expectedPhoneNumber?: string,
): Promise<string> {
  const phoneNumber = authoritativeFirebasePhone(authUser);
  if (
    !phoneNumber ||
    (expectedPhoneNumber !== undefined &&
      normalizePhilippineMobile(expectedPhoneNumber) !== phoneNumber)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The verified mobile identity is unavailable or inconsistent.",
    );
  }

  const owner = await lookupPhoneOwner(phoneNumber);
  if (!owner || owner.uid !== authUser.uid) {
    throw new HttpsError("failed-precondition", phoneCollisionMessage);
  }
  await requireNoConflictingFeastaPhoneProjection(
    authUser.uid,
    phoneNumber,
  );
  return phoneNumber;
}

/**
 * Authenticated pre-verification check. Firebase credential linking remains
 * the race-safe authority; this avoids sending an account into a known
 * collision and detects malformed FEASTA projections without public lookup.
 */
export async function requirePhoneAvailableToUid(
  uid: string,
  phoneNumber: string,
): Promise<void> {
  const normalizedPhone = normalizePhilippineMobile(phoneNumber);
  if (!normalizedPhone) {
    throw new HttpsError(
      "invalid-argument",
      "Enter a valid Philippine mobile number.",
    );
  }
  const owner = await lookupPhoneOwner(normalizedPhone);
  if (owner && owner.uid !== uid) {
    throw new HttpsError("already-exists", phoneCollisionMessage);
  }
  await requireNoConflictingFeastaPhoneProjection(uid, normalizedPhone);
}

async function lookupPhoneOwner(phoneNumber: string): Promise<UserRecord | null> {
  try {
    return await getAuth().getUserByPhoneNumber(phoneNumber);
  } catch (error) {
    if (firebaseAuthErrorCode(error) === "auth/user-not-found") return null;
    throw error;
  }
}

async function requireNoConflictingFeastaPhoneProjection(
  uid: string,
  phoneNumber: string,
): Promise<void> {
  const db = getFirestore();
  const projectionVariants = phoneProjectionVariants(phoneNumber);
  const [users, customers, providers] = await Promise.all([
    db.collection("users")
      .where("phoneNumber", "in", projectionVariants)
      .get(),
    db.collection("customers")
      .where("phoneNumber", "in", projectionVariants)
      .get(),
    db.collection("providers")
      .where("ownerPhone", "in", projectionVariants)
      .get(),
  ]);
  const conflict = users.docs.some((document) => document.id !== uid) ||
    customers.docs.some((document) => document.id !== uid) ||
    providers.docs.some((document) => document.data().ownerId !== uid);
  if (conflict) {
    throw new HttpsError(
      "failed-precondition",
      "The mobile identity relationship is inconsistent. Contact support.",
    );
  }
}

function phoneProjectionVariants(phoneNumber: string): string[] {
  return [phoneNumber, phoneNumber.slice(1), `0${phoneNumber.slice(3)}`];
}

function firebaseAuthErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ?
    String(error.code) :
    "";
}
