import "server-only";

import {normalizePhilippineMobile} from "@feasta/shared-types";
import type {UserRecord} from "firebase-admin/auth";

import {adminAuth, adminDb} from "@/lib/firebase/admin";

/** Server-only confirmation of Firebase ownership and FEASTA projection integrity. */
export async function requireServerPhoneIdentityOwnership(
  authUser: UserRecord,
  expectedPhoneNumber?: string,
): Promise<string> {
  const phoneNumber = normalizePhilippineMobile(authUser.phoneNumber);
  const phoneLinked = authUser.providerData.some(
    (provider) => provider.providerId === "phone",
  );
  if (
    !phoneNumber ||
    !phoneLinked ||
    (expectedPhoneNumber !== undefined &&
      normalizePhilippineMobile(expectedPhoneNumber) !== phoneNumber)
  ) {
    throw new Error("The verified mobile identity is inconsistent.");
  }

  const projectionVariants = phoneProjectionVariants(phoneNumber);
  const [owner, users, customers, providers] = await Promise.all([
    adminAuth.getUserByPhoneNumber(phoneNumber),
    adminDb.collection("users")
      .where("phoneNumber", "in", projectionVariants)
      .get(),
    adminDb.collection("customers")
      .where("phoneNumber", "in", projectionVariants)
      .get(),
    adminDb.collection("providers")
      .where("ownerPhone", "in", projectionVariants)
      .get(),
  ]);
  const conflict = owner.uid !== authUser.uid ||
    users.docs.some((document) => document.id !== authUser.uid) ||
    customers.docs.some((document) => document.id !== authUser.uid) ||
    providers.docs.some(
      (document) => document.data().ownerId !== authUser.uid,
    );
  if (conflict) {
    throw new Error("The mobile identity relationship is inconsistent.");
  }
  return phoneNumber;
}

function phoneProjectionVariants(phoneNumber: string): string[] {
  return [phoneNumber, phoneNumber.slice(1), `0${phoneNumber.slice(3)}`];
}
