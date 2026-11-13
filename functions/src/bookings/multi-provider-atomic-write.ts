import {createHash} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";
import type {
  DocumentReference,
  Transaction,
} from "firebase-admin/firestore";

import {bookingOutcomeId} from "./submission-outcome.js";

type RecordData = Readonly<Record<string, unknown>>;

export type MultiProviderAtomicCreate = {
  reference: DocumentReference;
  data: RecordData;
};

export type MultiProviderAtomicRequest = MultiProviderAtomicCreate & {
  providerId: string;
  type: "catering" | "addon";
};

export type MultiProviderAtomicWritePlan = {
  customerId: string;
  clientRequestId: string;
  submissionFingerprint: string;
  booking: MultiProviderAtomicCreate;
  requests: readonly MultiProviderAtomicRequest[];
  additionalCreates?: readonly MultiProviderAtomicCreate[];
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

function record(value: unknown): value is RecordData {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function validReference(
  reference: DocumentReference | undefined,
): reference is DocumentReference {
  return typeof reference?.path === "string" &&
    reference.path.length > 0 &&
    typeof reference.id === "string" &&
    reference.id.length > 0;
}

function providerRequestId(
  bookingId: string,
  type: "catering" | "addon",
  providerId: string,
): string {
  // Same algorithm as submit-booking-request.ts.
  return createHash("sha256")
    .update(`${bookingId}:${type}:${providerId}`)
    .digest("hex")
    .slice(0, 40);
}

/**
 * Validate the full atomic write plan before any tx.create().
 *
 * All document data must already have been prepared through
 * FEASTA's trusted transaction reads and existing authorities.
 *
 * This function is not a replacement for customer authorization,
 * publication validation, financial validation, payment agreements,
 * refund acknowledgements, or availability checking.
 */
export function validateMultiProviderAtomicWritePlan(
  plan: MultiProviderAtomicWritePlan,
): void {
  if (
    !plan ||
    typeof plan.customerId !== "string" ||
    !/^[A-Za-z0-9_-]{2,160}$/.test(plan.customerId) ||
    typeof plan.clientRequestId !== "string" ||
    !/^[A-Za-z0-9_-]{8,160}$/.test(plan.clientRequestId) ||
    typeof plan.submissionFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(plan.submissionFingerprint) ||
    !Array.isArray(plan.requests) ||
    plan.requests.length < 2 ||
    plan.requests.length > 4 ||
    !validReference(plan.booking?.reference) ||
    !record(plan.booking.data) ||
    (plan.additionalCreates !== undefined &&
      !Array.isArray(plan.additionalCreates))
  ) {
    reject("Atomic submission plan is invalid.");
  }

  const bookingId = bookingOutcomeId(
    plan.customerId,
    plan.clientRequestId,
  );

  const booking = plan.booking;

  if (
    booking.reference.id !== bookingId ||
    booking.data.bookingId !== bookingId ||
    booking.data.mainEventId !== bookingId ||
    booking.data.customerId !== plan.customerId ||
    booking.data.clientRequestId !== plan.clientRequestId ||
    booking.data.submissionFingerprint !==
      plan.submissionFingerprint ||
    booking.data.status !== "pending_provider_approval" ||
    booking.data.paymentStatus !== "unpaid" ||
    booking.data.providerRequestCount !== plan.requests.length ||
    booking.data.pendingProviderRequestCount !==
      plan.requests.length ||
    booking.data.confirmedProviderRequestCount !== 0 ||
    booking.data.rejectedProviderRequestCount !== 0 ||
    booking.data.completedProviderRequestCount !== 0 ||
    !Array.isArray(booking.data.providerRequestIds)
  ) {
    reject("Atomic parent event identity is invalid.");
  }

  const providerIds = new Set<string>();
  const paths = new Set<string>([booking.reference.path]);
  const expectedRequestIds: string[] = [];

  for (const request of plan.requests) {
    if (
      !request ||
      !validReference(request.reference) ||
      !record(request.data) ||
      typeof request.providerId !== "string" ||
      !/^[A-Za-z0-9_-]{2,160}$/.test(request.providerId) ||
      (request.type !== "catering" && request.type !== "addon") ||
      providerIds.has(request.providerId) ||
      paths.has(request.reference.path)
    ) {
      reject("Atomic provider selection is invalid.");
    }

    const expectedId = providerRequestId(
      bookingId,
      request.type,
      request.providerId,
    );

    if (
      request.reference.id !== expectedId ||
      request.data.providerRequestId !== expectedId ||
      request.data.bookingId !== bookingId ||
      request.data.mainEventId !== bookingId ||
      request.data.customerId !== plan.customerId ||
      request.data.providerId !== request.providerId ||
      request.data.type !== request.type ||
      request.data.status !== "pending" ||
      request.data.paymentStatus !== "unpaid"
    ) {
      reject("Atomic provider request identity is invalid.");
    }

    providerIds.add(request.providerId);
    paths.add(request.reference.path);
    expectedRequestIds.push(expectedId);
  }

  const storedIds = booking.data.providerRequestIds;

  if (
    storedIds.length !== expectedRequestIds.length ||
    expectedRequestIds.some(
      (id, index) => storedIds[index] !== id,
    )
  ) {
    reject("Atomic parent event request linkage is invalid.");
  }

  const additional = plan.additionalCreates ?? [];

  if (additional.length > 20) {
    reject("Atomic submission has too many additional writes.");
  }

  for (const create of additional) {
    if (
      !create ||
      !validReference(create.reference) ||
      !record(create.data) ||
      paths.has(create.reference.path)
    ) {
      reject("Atomic additional write is invalid.");
    }

    paths.add(create.reference.path);
  }
}

/**
 * Queue all writes on the caller's existing Firestore transaction.
 *
 * Firestore commits them atomically. A failed transaction does not
 * commit only some of its queued creates.
 *
 * The caller must complete all authoritative reads, validation,
 * idempotency and acknowledgement handling before this call.
 */
export function createMultiProviderBookingAtomically(
  transaction: Transaction,
  plan: MultiProviderAtomicWritePlan,
): void {
  if (!transaction || typeof transaction.create !== "function") {
    reject("Atomic submission transaction is invalid.");
  }

  validateMultiProviderAtomicWritePlan(plan);

  transaction.create(
    plan.booking.reference,
    plan.booking.data,
  );

  for (const request of plan.requests) {
    transaction.create(request.reference, request.data);
  }

  for (const create of plan.additionalCreates ?? []) {
    transaction.create(create.reference, create.data);
  }
}