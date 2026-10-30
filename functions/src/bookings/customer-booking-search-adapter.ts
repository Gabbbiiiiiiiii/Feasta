import {FieldPath, Timestamp, type Firestore} from "firebase-admin/firestore";
import {
  BOOKING_CANDIDATE_BUDGET, BookingCandidateError,
  awaitingProviderCandidateQuery, awaitingProviderRelatedQuery,
  awaitingProviderCandidateMatches, consumeAwaitingProviderCandidates,
  type BookingCandidate, type CandidateCursorBinding, type CandidatePosition,
} from "./customer-booking-candidate-pagination.js";

/** Internal server-only context: uid must come from verified customer auth. */
export type BookingSearchContext = {readonly uid: string};

/**
 * Read-only internal adapter; raw snapshots are NOT a public response DTO.
 * One transaction, one parent batch, lazy sequential related reads, no retries.
 * The Admin SDK read-only transaction pins all reads to one snapshot.
 */
export async function readAwaitingProviderCandidatePage(input: {
  firestore: Pick<Firestore, "collection" | "runTransaction">;
  customer: BookingSearchContext;
  pageSize: number;
  after: CandidatePosition | null;
}) {
  const binding: CandidateCursorBinding = {
    customerId: input.customer.uid, status: "awaiting_provider", pageSize: input.pageSize,
    section: "history", searchMode: "none", searchValue: "", order: "created_at_desc_v1",
  };
  const plan = awaitingProviderCandidateQuery(binding);
  // Validate continuation before starting database work, using the pure contract.
  consumeAwaitingProviderCandidates({binding, after: input.after, candidates: [],
    evaluate: () => false});
  let parent = input.firestore.collection(plan.collection)
    .where("customerId", "==", binding.customerId)
    .where("status", "in", plan.filters[1].value)
    .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(plan.limit);
  if (input.after) {
    parent = parent.startAfter(new Timestamp(input.after.seconds, input.after.nanoseconds),
      input.after.documentId);
  }
  // Defensive guard against a future SDK/configuration change replaying our callback.
  let entered = false;
  return input.firestore.runTransaction(async transaction => {
    if (entered) throw new Error("Booking search transaction replay refused.");
    entered = true;
    const snapshot = await transaction.get(parent);
    const candidates: BookingCandidate[] = snapshot.docs.map(doc => ({
      id: doc.id, data: doc.data(),
    }));
    // Validate scope/order/batch bounds before any related query, including lookahead.
    consumeAwaitingProviderCandidates({binding, after: input.after, candidates,
      evaluate: () => false});
    const decisions = new Map<BookingCandidate, boolean>();
    let matched = 0;
    for (const candidate of candidates.slice(0, BOOKING_CANDIDATE_BUDGET)) {
      if (candidate.data.isDeleted === true) continue;
      const related = awaitingProviderRelatedQuery(candidate);
      const requests = await transaction.get(input.firestore.collection(related.collection)
        .where("mainEventId", "==", candidate.id).limit(related.limit));
      if (!snapshot.readTime.isEqual(requests.readTime)) {
        throw new Error("Booking search snapshot mismatch.");
      }
      const matches = awaitingProviderCandidateMatches(candidate,
        requests.docs.map(doc => ({id: doc.id, data: doc.data()})));
      decisions.set(candidate, matches);
      if (matches && ++matched === binding.pageSize) break;
    }
    // Replay only synchronous, resolved booleans through the unchanged pure consumer.
    return consumeAwaitingProviderCandidates({binding, after: input.after, candidates,
      evaluate: candidate => {
        const result = decisions.get(candidate);
        if (typeof result !== "boolean") {
          throw new BookingCandidateError("failed-precondition", "missing-awaited-evidence");
        }
        return result;
      }});
  }, {readOnly: true});
}
