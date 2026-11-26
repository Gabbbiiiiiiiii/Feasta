import {randomUUID} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

const HOUR_MS = 3_600_000;

export type ArrangedPaymentOffer = {
  schemaVersion: 1;
  id: string;
  status: "offered" | "accepted" | "declined" | "withdrawn";
  providerOwnerId: string;
  grossInCentavos: number;
  upfrontInCentavos: number;
  initialDueAt: Timestamp;
  balanceDueAt: Timestamp;
  offeredAt: Timestamp;
  respondedAt?: Timestamp;
};

export function parseArrangedPaymentOffer(value: unknown): ArrangedPaymentOffer | null {
  if (value == null) return null;
  const offer = value as ArrangedPaymentOffer;
  if (offer.schemaVersion !== 1 || !/^[\da-f-]{36}$/u.test(offer.id) ||
      !["offered", "accepted", "declined", "withdrawn"].includes(offer.status) ||
      typeof offer.providerOwnerId !== "string" || !offer.providerOwnerId ||
      !Number.isSafeInteger(offer.grossInCentavos) ||
      !validInstallments(offer.grossInCentavos, offer.upfrontInCentavos) ||
      !(offer.initialDueAt instanceof Timestamp) || !(offer.balanceDueAt instanceof Timestamp) ||
      !(offer.offeredAt instanceof Timestamp) ||
      offer.offeredAt.toMillis() >= offer.initialDueAt.toMillis() ||
      offer.initialDueAt.toMillis() >= offer.balanceDueAt.toMillis() ||
      (offer.status === "offered"
        ? offer.respondedAt !== undefined
        : !(offer.respondedAt instanceof Timestamp) ||
          offer.respondedAt.toMillis() < offer.offeredAt.toMillis() ||
          (offer.status === "accepted" && offer.respondedAt.toMillis() >= offer.initialDueAt.toMillis()))) {
    throw new HttpsError("failed-precondition", "The saved arranged payment offer is invalid.");
  }
  return offer;
}

export function makeArrangedPaymentOffer(input: {
  grossInCentavos: number; upfrontInCentavos: unknown; initialDueAt: unknown; balanceDueAt: unknown;
  providerOwnerId: string; now: Date; standardBalanceDueAt: Date;
}): ArrangedPaymentOffer {
  const parseManilaDate = (value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)
      ? new Date(value + ":00+08:00") : new Date(Number.NaN);
  const initial = parseManilaDate(input.initialDueAt);
  const balance = parseManilaDate(input.balanceDueAt);
  const isCalendarDate = (date: Date, value: unknown) => Number.isFinite(date.getTime()) &&
    new Date(date.getTime() + 8 * HOUR_MS).toISOString().slice(0, 16) === value;
  if (!validInstallments(input.grossInCentavos, input.upfrontInCentavos)) {
    throw new HttpsError("invalid-argument", "Enter a first payment of at least ₱1 that leaves at least ₱1 for the balance.");
  }
  if (input.now >= input.standardBalanceDueAt) {
    throw new HttpsError("failed-precondition", "Arranged payment is no longer available because fewer than 48 hours remain before the event.");
  }
  if (!isCalendarDate(initial, input.initialDueAt) || !isCalendarDate(balance, input.balanceDueAt) ||
      initial <= input.now || balance <= initial || balance > input.standardBalanceDueAt) {
    throw new HttpsError("invalid-argument", "Choose a future first payment deadline, then a later balance due date no later than 48 hours before the event.");
  }
  return {
    schemaVersion: 1, id: randomUUID(), status: "offered", providerOwnerId: input.providerOwnerId,
    grossInCentavos: input.grossInCentavos, upfrontInCentavos: input.upfrontInCentavos,
    initialDueAt: Timestamp.fromDate(initial), balanceDueAt: Timestamp.fromDate(balance),
    offeredAt: Timestamp.fromDate(input.now),
  };
}

function validInstallments(gross: number, upfront: unknown): upfront is number {
  return typeof upfront === "number" && Number.isSafeInteger(upfront) &&
    upfront >= 100 && gross - upfront >= 100;
}

export function requireArrangedPaymentEligibility(request: Readonly<Record<string, unknown>>, depositAllowed: boolean) {
  const submitted = (request.initialPaymentEligibility as {submittedAt?: unknown} | null)?.submittedAt;
  if (request.type !== "catering" || !request.packageId || request.remainingBalanceTimingSchemaVersion !== 3 ||
      request.initialPaymentEligibilitySchemaVersion !== 2 || request.paymentStatus !== "unpaid" ||
      (request.settlementStatus != null && request.settlementStatus !== "unpaid") ||
      request.paymentId != null || request.initialPaymentId != null || request.financialSnapshot != null ||
      request.activeCancellationRequestId != null || request.approvedCancellationRequestId != null ||
      request.refundExecutionLock != null || request.reconciliationRequired === true ||
      !depositAllowed || !(submitted instanceof Timestamp) || !(request.eventStartAt instanceof Timestamp) ||
      request.eventStartAt.toMillis() - submitted.toMillis() < 72 * HOUR_MS) {
    throw new HttpsError("failed-precondition", "Arranged payment is available for unpaid catering requests submitted at least 72 hours ahead, where down payments are allowed.");
  }
}
