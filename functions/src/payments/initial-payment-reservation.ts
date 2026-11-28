import {Timestamp, type Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {AVAILABILITY_COUNTED_REQUEST_STATUSES, isCanonicalCateringSchedule, manilaDateRange,
  providerRequestOccupiesAvailability, validateProviderAvailability}
  from "../provider-availability/validate-provider-availability.js";
import {scheduledEventStart} from "./canonical-balance-timing.js";
import {originalInitialPaymentDeadline} from "./initial-payment-deadline.js";
export {originalInitialPaymentDeadline} from "./initial-payment-deadline.js";
import {parseProviderRequestType} from "../shared/constants.js";
import {frozenBookingPolicyTimingV3} from "../bookings/booking-policy-v3.js";

/** A status alone cannot authorize a new charge after capacity was released. */
export function requireInitialPaymentHold(request: Readonly<Record<string, unknown>>, now: Date): void {
  let deadline: Timestamp | null = null;
  try { deadline = originalInitialPaymentDeadline(request); } catch { /* invalid frozen evidence fails closed */ }
  if (!deadline || !Number.isFinite(now.getTime()) || now.getTime() >= deadline.toMillis()) {
    throw new HttpsError("failed-precondition", "The provider's original payment reservation is unavailable or expired.",
      {reason: "initial_payment_reservation_expired_or_invalid"});
  }
  const acceptedAt = request.acceptedAt;
  const expiresAt = request.expiresAt;
  const eventDate = request.eventDate;
  const hardDeadline = request.remainingBalanceTimingSchemaVersion === 3
    ? frozenBookingPolicyTimingV3(request).hardPaymentDeadlineAt.getTime()
    : request.hardPaymentDeadlineAt instanceof Timestamp ? request.hardPaymentDeadlineAt.toMillis() : Infinity;
  if (!(acceptedAt instanceof Timestamp) || acceptedAt.toMillis() > now.getTime() ||
    !(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= acceptedAt.toMillis() ||
    !(eventDate instanceof Timestamp) || typeof request.eventTime !== "string" ||
    !providerRequestOccupiesAvailability({...request, status: request.status, expiresAt, acceptedAt, now}) ||
    now >= scheduledEventStart(eventDate.toDate(), request.eventTime) ||
    now.getTime() >= hardDeadline) {
    throw new HttpsError("failed-precondition", "The provider's original payment reservation is unavailable or expired.",
      {reason: "initial_payment_reservation_expired_or_invalid"});
  }
}

/** Read the provider reservation guard and occupancy in the authorizing transaction. */
export async function requireInitialPaymentReservation(transaction: Transaction, providerRequestId: string,
  request: Readonly<Record<string, unknown>>, now: Date): Promise<void> {
  requireInitialPaymentHold(request, now);
  const eventDate = request.eventDate as Timestamp;
  const range = manilaDateRange(eventDate.toDate());
  const type = parseProviderRequestType(request.type);
  const eventTime = typeof request.eventTime === "string" ? request.eventTime : "";
  const eventEndTime = typeof request.eventEndTime === "string" ? request.eventEndTime : null;
  const serviceTier = request.serviceTier ?? null;
  if (!range || !type || typeof request.providerId !== "string" ||
    typeof request.guestCount !== "number" ||
    !isCanonicalCateringSchedule(eventTime, eventEndTime, serviceTier)) {
    throw new HttpsError("failed-precondition", "Invalid reservation.");
  }
  const [provider, bookings] = await Promise.all([
    transaction.get(db.collection("providers").doc(request.providerId)),
    transaction.get(db.collection("providerRequests").where("providerId", "==", request.providerId)
      .where("eventDate", ">=", Timestamp.fromDate(range.start))
      .where("eventDate", "<", Timestamp.fromDate(range.end))
      .where("status", "in", [...AVAILABILITY_COUNTED_REQUEST_STATUSES])),
  ]);
  const providerData = provider.data() ?? {};
  const reducedAt = providerData.availabilityCapacityReducedAt;
  const acceptedAt = request.acceptedAt;
  const preserveExistingReservation = reducedAt instanceof Timestamp && acceptedAt instanceof Timestamp &&
    acceptedAt.toMillis() <= reducedAt.toMillis() && reducedAt.toMillis() <= now.getTime() &&
    bookings.docs.some((document) => document.id === providerRequestId);
  const availability = validateProviderAvailability({providerData, preserveExistingReservation,
    request: {providerRequestId, mainEventId: request.mainEventId, type,
      eventDate: eventDate.toDate(), eventTime, eventEndTime, serviceTier,
      guestCount: request.guestCount, services: request.services},
    existingBookings: bookings.docs.map(document => ({...document.data(), providerRequestId: document.id,
      status: document.data().status, eventTime: document.data().eventTime,
      eventEndTime: document.data().eventEndTime, serviceTier: document.data().serviceTier,
      acceptedAt: document.data().acceptedAt, expiresAt: document.data().expiresAt})), now});
  if (!availability.available) throw new HttpsError("failed-precondition", "The provider reservation is no longer available.",
    {reason: "initial_payment_reservation_unavailable", issues: availability.issues});
}
