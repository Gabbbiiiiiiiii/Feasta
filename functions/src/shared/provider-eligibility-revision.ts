import {isDeepStrictEqual} from "node:util";
import type {DocumentReference, Transaction} from "firebase-admin/firestore";
import {
  authorityRevision,
  nextEligibilityRevision,
  PROVIDER_ELIGIBILITY_AUTHORITY_COLLECTION,
} from "../packages/setup-gallery-v2-authority.js";

// This is an invalidation generation, never approval evidence. In particular,
// onboarding categories and legacy event types must not create occasion grants.
const eligibilityFields = [
  "ownerId", "providerServiceType", "providerCategory", "serviceCategories",
  "eventTypesSupported", "verificationStatus", "isActive", "isBlocked",
  "isSuspended", "isDeleted",
] as const;

/** Call after authorization/validation and all other reads, before any writes.
 * The provider must be read (or created) in this same transaction. No external
 * calls or caller-provided revision/authority documents belong here.
 * Missing legacy authority initializes only an invalidation counter; no grant or
 * approval is created. A future gallery reader must independently prove approval.
 */
export async function advanceProviderEligibilityInTransaction(
  transaction: Transaction,
  provider: DocumentReference,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  ownerChange?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  },
): Promise<void> {
  const ownerFields = ["role", "providerId", "accountStatus", "isActive", "isBlocked"];
  const ownerUnchanged = !ownerChange || ownerFields.every((field) =>
    isDeepStrictEqual(ownerChange.before[field], ownerChange.after[field]));
  if (before !== null && eligibilityFields.every((field) =>
    isDeepStrictEqual(before[field], after[field])) && ownerUnchanged) return;

  const reference = provider.firestore
    .collection(PROVIDER_ELIGIBILITY_AUTHORITY_COLLECTION).doc(provider.id);
  const snapshot = await transaction.get(reference);
  // A newly created profile must not inherit grants from an orphaned sidecar.
  if (before === null && snapshot.exists) {
    throw new Error("SETUP_GALLERY_AUTHORITY_UNAVAILABLE");
  }
  // An existing malformed document is corruption, not legacy initialization.
  const previous = snapshot.exists ? authorityRevision(snapshot.data()?.revision) : undefined;
  const revision = nextEligibilityRevision(previous);
  if (snapshot.exists) {
    transaction.update(reference, {revision});
  } else {
    transaction.create(reference, {revision});
  }
}
