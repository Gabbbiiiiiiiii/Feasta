/**
 * Routine event-type activation policy.
 *
 * The normal Admin action must not require software release attestations.
 * This module does NOT authorize Firestore mutations by itself.
 *
 * The caller must enforce admin authorization, App Check, revision
 * consistency, eligible category mappings, publication safety,
 * existing-booking protection, and transaction auditing.
 */

export type RoutineOccasionAction = "activate" | "deactivate";

export interface RoutineOccasionState {
  id: string;
  moderationState: string;
  active: boolean;
  revision: number;
}

export function isRoutineOccasionTransitionValid(
  occasion: RoutineOccasionState | null,
  action: RoutineOccasionAction,
  expectedRevision: number,
): boolean {
  if (!occasion || occasion.moderationState !== "approved") return false;

  if (!Number.isSafeInteger(occasion.revision) ||
      occasion.revision <= 0 ||
      occasion.revision !== expectedRevision) return false;

  return action === "activate" ? occasion.active === false :
    occasion.active === true;
}