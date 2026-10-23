import {Timestamp, type Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {AVAILABILITY_COUNTED_REQUEST_STATUSES, manilaDateRange,
  providerRequestOccupiesAvailability, validateProviderAvailability}
  from "../provider-availability/validate-provider-availability.js";
import {scheduledEventStart} from "./canonical-balance-timing.js";
import {remainingBalanceHardDeadline} from "./canonical-balance-timing.js";
import {PROVIDER_PAYMENT_HOLD_WINDOW_MS} from "../provider-availability/validate-provider-availability.js";
import {parseProviderRequestType} from "../shared/constants.js";
import {frozenBookingPolicyTimingV3} from "../bookings/booking-policy-v3.js";

/** Original frozen boundaries only. No mutable package settings or renewal clock. */
export function originalInitialPaymentDeadline(request: Readonly<Record<string, unknown>>): Timestamp {
  if (!(request.acceptedAt instanceof Timestamp) || !(request.eventDate instanceof Timestamp)) {
    throw new Error("Initial payment timing evidence is missing.");
  }
  const accepted = request.acceptedAt.toMillis();
  if (request.remainingBalanceTimingSchemaVersion != null &&
    ![1, 2, 3].includes(request.remainingBalanceTimingSchemaVersion as number)) {
    throw new Error("Initial payment timing version is unsupported.");
  }
  const eventStart = scheduledEventStart(request.eventDate.toDate(), request.eventTime).getTime();
  if (request.eventStartAt != null && (!(request.eventStartAt instanceof Timestamp) ||
    request.eventStartAt.toMillis() !== eventStart)) throw new Error("Event timing evidence conflicts.");
  const optional = (value: unknown): number => {
    if (value == null) return Infinity;
    if (!(value instanceof Timestamp)) throw new Error("Initial payment deadline is invalid.");
    return value.toMillis();
  };
  const canonical = [2, 3].includes(Number(request.remainingBalanceTimingSchemaVersion))
    ? remainingBalanceHardDeadline(request).getTime() : Infinity;
  const deadline = Math.min(accepted + PROVIDER_PAYMENT_HOLD_WINDOW_MS, eventStart,
    optional(request.expiresAt), optional(request.hardPaymentDeadlineAt), canonical);
  if (!Number.isFinite(deadline) || deadline <= accepted) throw new Error("Initial payment timing contradicts acceptance.");
  return Timestamp.fromMillis(deadline);
}

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
  if (!range || !type || typeof request.providerId !== "string" ||
    typeof request.eventTime !== "string" || typeof request.eventEndTime !== "string" ||
    typeof request.guestCount !== "number") throw new HttpsError("failed-precondition", "Invalid reservation.");
  const [provider, bookings] = await Promise.all([
    transaction.get(db.collection("providers").doc(request.providerId)),
    transaction.get(db.collection("providerRequests").where("providerId", "==", request.providerId)
      .where("eventDate", ">=", Timestamp.fromDate(range.start))
      .where("eventDate", "<", Timestamp.fromDate(range.end))
      .where("status", "in", [...AVAILABILITY_COUNTED_REQUEST_STATUSES])),
  ]);
  const availability = validateProviderAvailability({providerData: provider.data() ?? {},
    request: {providerRequestId, type,
      eventDate: eventDate.toDate(), eventTime: request.eventTime, eventEndTime: request.eventEndTime,
      guestCount: request.guestCount, services: request.services},
    existingBookings: bookings.docs.map(document => ({...document.data(), providerRequestId: document.id,
      status: document.data().status, eventTime: document.data().eventTime,
      eventEndTime: document.data().eventEndTime, acceptedAt: document.data().acceptedAt,
      expiresAt: document.data().expiresAt})), now});
  if (!availability.available) throw new HttpsError("failed-precondition", "The provider reservation is no longer available.",
    {reason: "initial_payment_reservation_unavailable", issues: availability.issues});
}
