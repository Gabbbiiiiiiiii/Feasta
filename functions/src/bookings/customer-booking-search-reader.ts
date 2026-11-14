import {FieldPath, Timestamp, type Firestore, type Query, type Transaction}
  from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {readAwaitingProviderCandidatePage} from "./customer-booking-search-adapter.js";
import {awaitingProviderCandidateMatches, awaitingProviderRelatedQuery,
  compareCandidatePositions, type BookingCandidate, type CandidatePosition}
  from "./customer-booking-candidate-pagination.js";
import {bookingSearchPosition, SEARCH_STATUS_GROUPS, searchReconciliation, validateSearchSource,
  type SearchInput, type SearchPosition} from "./customer-booking-search-contract.js";

type SearchFirestore = Pick<Firestore, "collection" | "runTransaction">;

async function awaitingMatch(firestore: SearchFirestore, transaction: Transaction,
  candidate: BookingCandidate, readTime: Timestamp): Promise<boolean> {
  const plan = awaitingProviderRelatedQuery(candidate);
  const related = await transaction.get(firestore.collection(plan.collection)
    .where("mainEventId", "==", candidate.id).limit(plan.limit));
  if (!readTime.isEqual(related.readTime)) throw searchReconciliation();
  return awaitingProviderCandidateMatches(candidate,
    related.docs.map(doc => ({id: doc.id, data: doc.data()})));
}

function compare(left: SearchPosition, right: SearchPosition, input: SearchInput): number {
  if (input.section === "undated_drafts") {
    return Buffer.compare(Buffer.from(right.documentId), Buffer.from(left.documentId));
  }
  if (input.search.mode === "code_prefix") {
    const a = left as {code: string; documentId: string};
    const b = right as {code: string; documentId: string};
    return Buffer.compare(Buffer.from(a.code), Buffer.from(b.code)) ||
      Buffer.compare(Buffer.from(a.documentId), Buffer.from(b.documentId));
  }
  return compareCandidatePositions(left as CandidatePosition, right as CandidatePosition);
}

/** One bounded source read; evidence reads only for consumed awaiting-provider candidates. */
export async function readCustomerBookingSearch(input: {
  firestore: SearchFirestore; uid: string; request: SearchInput; after: SearchPosition | null;
}) {
  const {firestore, uid, request, after} = input;
  if (request.search.mode === "none" && request.section === "history" &&
    request.status === "awaiting_provider") {
    const result = await readAwaitingProviderCandidatePage({firestore, customer: {uid},
      pageSize: request.pageSize, after: after as CandidatePosition | null});
    for (const candidate of result.bookings) validateSearchSource(candidate, uid);
    return result;
  }
  let entered = false;
  return firestore.runTransaction(async transaction => {
    if (entered) throw searchReconciliation();
    entered = true;
    if (request.search.mode === "booking_id") {
      const reference = firestore.collection("mainEvents").doc(request.search.value);
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();
      // Never validate foreign/deleted source data before the indistinguishable miss.
      if (!snapshot.exists || !data || data.customerId !== uid || data.isDeleted === true) {
        throw new HttpsError("not-found", "Booking could not be found.");
      }
      const candidate = {id: snapshot.id, data};
      validateSearchSource(candidate, uid);
      const statuses = SEARCH_STATUS_GROUPS[request.status];
      const matches = !statuses || (statuses as readonly unknown[]).includes(data.status);
      const eligible = matches && (request.status !== "awaiting_provider" ||
        await awaitingMatch(firestore, transaction, candidate, snapshot.readTime));
      return {bookings: eligible ? [candidate] : [], hasMore: false, nextPosition: null};
    }
    let query: Query = firestore.collection("mainEvents").where("customerId", "==", uid);
    const statuses = request.section === "undated_drafts" ? ["draft"] :
      SEARCH_STATUS_GROUPS[request.status];
    if (statuses) query = query.where("status", statuses.length === 1 ? "==" : "in",
      statuses.length === 1 ? statuses[0] : [...statuses]);
    if (request.section === "undated_drafts") {
      query = query.orderBy(FieldPath.documentId(), "desc");
      if (after) query = query.startAfter(after.documentId);
    } else if (request.search.mode === "code_prefix") {
      const prefix = request.search.value;
      const end = prefix.slice(0, -1) +
        String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
      query = query.where("bookingCode", ">=", prefix).where("bookingCode", "<", end)
        .orderBy("bookingCode", "asc").orderBy(FieldPath.documentId(), "asc");
      if (after) query = query.startAfter((after as {code: string}).code, after.documentId);
    } else {
      query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
      if (after) {
        const p = after as CandidatePosition;
        query = query.startAfter(new Timestamp(p.seconds, p.nanoseconds), p.documentId);
      }
    }
    const snapshot = await transaction.get(query.limit(31));
    if (snapshot.docs.length > 31) throw searchReconciliation();
    const candidates = snapshot.docs.map(doc => ({id: doc.id, data: doc.data()}));
    let previous = after;
    // Every fetched row must respect ownership, query scope and cursor ordering,
    // including tombstones and unconsumed lookahead. Other source validation is lazy.
    for (const candidate of candidates) {
      if (candidate.data.customerId !== uid ||
        (statuses && !(statuses as readonly unknown[]).includes(candidate.data.status))) {
        throw searchReconciliation();
      }
      const position = bookingSearchPosition(candidate, request);
      if (previous && compare(previous, position, request) >= 0) throw searchReconciliation();
      previous = position;
    }
    const bookings: BookingCandidate[] = [];
    let consumed = 0;
    let last: SearchPosition | null = null;
    for (const candidate of candidates.slice(0, 30)) {
      consumed++;
      last = bookingSearchPosition(candidate, request);
      if (candidate.data.isDeleted === true) continue;
      validateSearchSource(candidate, uid);
      if (request.section === "undated_drafts" && candidate.data.createdAt !== undefined) continue;
      if (request.status === "awaiting_provider" &&
        !await awaitingMatch(firestore, transaction, candidate, snapshot.readTime)) continue;
      bookings.push(candidate);
      if (bookings.length === request.pageSize) break;
    }
    const hasMore = consumed < candidates.length;
    return {bookings, hasMore, nextPosition: hasMore ? last : null};
  }, {readOnly: true});
}
