/** Server-owned, bounded adjudication state. Historical records live separately. */
export const OBSERVATION_MS = 30 * 24 * 60 * 60 * 1000;
export const RESTRICTION_MS = 7 * 24 * 60 * 60 * 1000;
export type Strike = {id: string; occurredAtMs: number};
export type Restriction = {id: string; basis: Strike[]; startedAtMs: number; untilMs: number};
export type ViolationState = {
  schemaVersion: 1; revision: number; pending: Strike[]; restriction: Restriction | null;
};

const validTime = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const validStrike = (v: Strike) => v && typeof v.id === "string" &&
  /^[A-Za-z0-9_-]{8,160}$/.test(v.id) && validTime(v.occurredAtMs);

export class ViolationStateIntegrityError extends Error {}

export function readViolationState(value: unknown): ViolationState {
  if (value === undefined) return {schemaVersion: 1, revision: 0, pending: [], restriction: null};
  const v = value as ViolationState;
  const r = v?.restriction;
  if (!v || v.schemaVersion !== 1 || !Number.isSafeInteger(v.revision) || v.revision < 0 ||
    !Array.isArray(v.pending) || v.pending.length > 2 || !v.pending.every(validStrike) ||
    new Set(v.pending.map(s => s.id)).size !== v.pending.length ||
    (r !== null && (!r || typeof r.id !== "string" || !validTime(r.startedAtMs) ||
      !validTime(r.untilMs) || r.untilMs !== r.startedAtMs + RESTRICTION_MS ||
      !Array.isArray(r.basis) || r.basis.length !== 3 || !r.basis.every(validStrike) ||
      new Set(r.basis.map(s => s.id)).size !== 3)) || (r !== null && v.pending.length !== 0)) {
    throw new ViolationStateIntegrityError("Customer violation state requires administrative review.");
  }
  return {schemaVersion: 1, revision: v.revision, pending: v.pending, restriction: r};
}

export function activeStrikes(state: ViolationState, now: number): Strike[] {
  return (state.restriction && state.restriction.untilMs > now ? state.restriction.basis : state.pending)
    .filter(s => s.occurredAtMs > now - OBSERVATION_MS && s.occurredAtMs <= now);
}

export function issueStrike(state: ViolationState, strike: Strike, now: number): {
  state: ViolationState; count: number; cycleId: string | null; began: boolean;
} {
  if (!validTime(now) || !validStrike(strike) || strike.occurredAtMs > now ||
    strike.occurredAtMs <= now - OBSERVATION_MS) throw new Error("Invalid strike time.");
  if (state.restriction && state.restriction.untilMs > now) {
    // Outstanding bookings may expire during a restriction. Audit them, but
    // consume them in this cycle rather than accumulating a second punishment.
    return {state: {...state, revision: state.revision + 1}, count: activeStrikes(state, now).length,
      cycleId: state.restriction.id, began: false};
  }
  const pending = [...activeStrikes({...state, restriction: null}, now), strike];
  if (pending.length >= 3) {
    return {state: {schemaVersion: 1, revision: state.revision + 1, pending: [],
      restriction: {id: strike.id, basis: pending, startedAtMs: now, untilMs: now + RESTRICTION_MS}},
    count: 3, cycleId: strike.id, began: true};
  }
  return {state: {schemaVersion: 1, revision: state.revision + 1, pending, restriction: null},
    count: pending.length, cycleId: null, began: false};
}

export function reverseStrike(state: ViolationState, id: string): ViolationState {
  // Consumed strikes never become fresh strikes after correction or expiry.
  return {...state, revision: state.revision + 1, pending: state.pending.filter(s => s.id !== id),
    restriction: state.restriction?.basis.some(s => s.id === id) ? null : state.restriction};
}
