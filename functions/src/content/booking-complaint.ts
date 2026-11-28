import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {createIdempotencyKey} from "../shared/idempotency.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireString} from "../shared/validation.js";
import {
  requireProviderRequestDocuments,
} from "../provider-requests/provider-request-relationship-integrity.js";

export const BOOKING_COMPLAINT_CATEGORIES = [
  "service_quality", "provider_conduct", "booking_details", "payment", "other",
] as const;
const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/u;

/** Booking complaints are scoped to one service, never a client-selected party. */
export async function createBookingComplaint(
  actorId: string, input: Record<string, unknown>, description: string,
) {
  const providerRequestId = requireString(input.providerRequestId, "providerRequestId", {
    minLength: 8, maxLength: 160,
  });
  if (!SAFE_ID.test(providerRequestId)) {
    throw new HttpsError("invalid-argument", "providerRequestId is invalid.");
  }
  const category = requireString(input.category, "category", {minLength: 1, maxLength: 80});
  if (!BOOKING_COMPLAINT_CATEGORIES.some(value => value === category)) {
    throw new HttpsError("invalid-argument", "Choose a supported complaint category.");
  }
  // Content-derived identity survives retries, double taps, and reopening either client.
  // A client key cannot hide changed content or a different booking behind a replay.
  const key = createIdempotencyKey({operation: "createBookingComplaint", actorId,
    payload: {providerRequestId, category, description}});
  const complaintId = `complaint_${key.slice(0, 32)}`;
  const result = await db.runTransaction(async transaction => {
    const requestSnapshot = await transaction.get(
      db.collection("providerRequests").doc(providerRequestId),
    );
    const request = requestSnapshot.data();
    if (!request) throw new HttpsError("not-found", "The booked service was not found.");
    if (request.customerId !== actorId) {
      throw new HttpsError("permission-denied", "Only the booking owner can report an issue.");
    }
    const bookingId = request.mainEventId;
    if (typeof bookingId !== "string" || !SAFE_ID.test(bookingId)) {
      throw new HttpsError("failed-precondition", "The booked service relationship is invalid.");
    }
    const [parent, requests, existing] = await Promise.all([
      transaction.get(db.collection("mainEvents").doc(bookingId)),
      transaction.get(db.collection("providerRequests").where("mainEventId", "==", bookingId)),
      transaction.get(db.collection("complaints").doc(complaintId)),
    ]);
    const mainEvent = parent.data();
    if (!mainEvent) throw new HttpsError("not-found", "The booking was not found.");
    if (mainEvent.customerId !== actorId) {
      throw new HttpsError("permission-denied", "Only the booking owner can report an issue.");
    }
    const relations = requireProviderRequestDocuments({
      mainEventId: bookingId, mainEvent, requests: requests.docs,
    });
    if (!relations.complete.includes(providerRequestId)) {
      throw new HttpsError("failed-precondition", "The service does not belong to this booking.");
    }
    const parties = {bookingId, mainEventId: bookingId, providerId: request.providerId,
      customerId: mainEvent.customerId, userId: mainEvent.customerId};
    for (const [field, canonical] of Object.entries(parties)) {
      if (input[field] !== undefined && input[field] !== canonical) {
        throw new HttpsError(
          "permission-denied", "The supplied booking relationship does not match.",
        );
      }
    }
    if (existing.exists) return {complaintId, created: false};
    transaction.create(db.collection("complaints").doc(complaintId), {
      ...parties, providerRequestId, category, description, evidenceUrls: [],
      status: "submitted", priority: "normal", resolution: null, resolvedAt: null, resolvedBy: null,
      assignedAdminId: null, assignedAt: null, isDeleted: false, deletedAt: null,
      deletedBy: null, deletionReason: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    writeAuditLogInTransaction(transaction, {
      actorId, actorRole: "customer", action: "complaint_created",
      targetCollection: "complaints", targetId: complaintId, source: "cloud_function", before: null,
      after: {status: "submitted"}, metadata: {...parties, providerRequestId, category},
    });
    return {complaintId, created: true};
  });
  return {success: true, ...result, idempotentReplay: !result.created};
}
