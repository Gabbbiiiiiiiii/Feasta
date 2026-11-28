/**
 * Private server adapter for a future independently authorized release.
 * Intentionally NOT exported via functions/src/index.ts.
 *
 * No approval document or browser-supplied bit can flip this constant. An
 * independently reviewed complete writer inventory, rollback protocol,
 * customer Web/Flutter compatibility and release authorization must precede
 * any change to this release barrier.
 */
import {db} from "../shared/firestore.js";
import {atomicOccasionTransitionId,
  coordinateBoundedOccasionWithdrawalInTransaction,
  type AtomicCoordinatorInput} from "./occasion-transition-coordinator-atomic.js";

export const OCCASION_COORDINATOR_RELEASE_VERIFIED: boolean = false;

type Parameters = Pick<AtomicCoordinatorInput,
  "action" | "occasionId" | "expectedCatalogRevision" |
  "expectedOccasionRevision" | "actorUid" | "idempotencyKey" | "reason">;

export async function runPrivateOccasionWithdrawalCoordinator(input: Parameters) {
  if (!OCCASION_COORDINATOR_RELEASE_VERIFIED) {
    throw new Error("OCCASION_COORDINATOR_RELEASE_UNVERIFIED");
  }
  // Do not accept a request from a browser or public Callable. A trusted
  // privileged executor must independently verify active Firebase Auth status,
  // Admin App Check, authorized release and complete writer coverage first.
  const id = atomicOccasionTransitionId(input);
  const complete: AtomicCoordinatorInput = {...input,
    catalogRef: db.collection("occasionCatalog").doc("current"),
    occasionRef: db.collection("occasions").doc(input.occasionId),
    adminRef: db.collection("users").doc(input.actorUid),
    transitionRef: db.collection("occasionAtomicWithdrawalTransitions").doc(id),
    transitionAuditRef: db.collection("occasionAtomicWithdrawalAudits").doc(id)};
  return db.runTransaction((tx) =>
    coordinateBoundedOccasionWithdrawalInTransaction(tx, complete));
}
