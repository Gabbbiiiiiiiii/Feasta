import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";

// Web Admin adapter for the B2A.2 authority, not a separate generation.
// Read all authorities before calling any returned writer.
export async function prepareProviderEligibilityAdvance(
  transaction: Transaction,
  provider: DocumentReference,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ownerChange?: { before: Record<string, unknown>; after: Record<string, unknown> },
): Promise<() => void> {
  const fields = ["ownerId", "providerServiceType", "providerCategory", "serviceCategories",
    "eventTypesSupported", "verificationStatus", "isActive", "isBlocked", "isSuspended", "isDeleted"];
  const ownerFields = ["role", "providerId", "accountStatus", "isActive", "isBlocked"];
  if (fields.every((key) => isDeepStrictEqual(before[key], after[key])) &&
    (!ownerChange || ownerFields.every((key) =>
      isDeepStrictEqual(ownerChange.before[key], ownerChange.after[key])))) return () => {};
  const ref = provider.firestore.collection("providerEligibilityAuthorities").doc(provider.id);
  const snapshot = await transaction.get(ref);
  const previous = snapshot.data()?.revision;
  if (snapshot.exists && (typeof previous !== "number" || !Number.isSafeInteger(previous) ||
    previous < 1 || previous === Number.MAX_SAFE_INTEGER)) {
    throw new Error("SETUP_GALLERY_AUTHORITY_UNAVAILABLE");
  }
  const revision = snapshot.exists ? (previous as number) + 1 : 1;
  return () => {
    if (snapshot.exists) transaction.update(ref, { revision });
    else transaction.create(ref, { revision });
  };
}
