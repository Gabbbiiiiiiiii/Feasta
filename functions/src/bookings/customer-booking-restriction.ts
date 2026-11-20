import type {Firestore, Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {readViolationState} from "./customer-violation-policy.js";

/** Read in the creation transaction, after successful replay handling. Every
 * issuance/reversal writes this same document, serializing concurrent intake. */
export async function assertNoCustomerBookingRestriction(
  transaction: Transaction, firestore: Firestore, customerId: string,
): Promise<void> {
  const snapshot = await transaction.get(firestore.collection("customerViolationStates").doc(customerId));
  let state;
  try { state = readViolationState(snapshot.data()); }
  catch {
    throw new HttpsError("failed-precondition", "Booking access requires account support review.",
      {reason: "customer_booking_restriction_review_required"});
  }
  if (state.restriction && state.restriction.untilMs > Date.now()) {
    const expiresAt = new Date(state.restriction.untilMs).toISOString();
    throw new HttpsError("failed-precondition",
      `New bookings are restricted for seven days after three verified unpaid booking expirations. Restriction ends ${expiresAt}.`,
      {reason: "customer_booking_restricted", expiresAt});
  }
}
