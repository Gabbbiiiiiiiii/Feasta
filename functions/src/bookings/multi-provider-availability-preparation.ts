import {HttpsError} from "firebase-functions/v2/https";

import {
  manilaDateKey,
  validateProviderAvailability,
  type ExistingProviderBooking,
  type ProviderAvailabilityRequest,
  type ProviderAvailabilityResult,
} from "../provider-availability/validate-provider-availability.js";

export type MultiProviderAvailabilityCandidate = {
  providerId: string;
  providerData: Readonly<Record<string, unknown>>;
  request: ProviderAvailabilityRequest;
  existingBookings: readonly ExistingProviderBooking[];
};

export type MultiProviderAvailabilityAssessment = {
  providerId: string;
  providerRequestId: string;
  result: ProviderAvailabilityResult;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

/**
 * Pure provider-availability preflight for 2-4 selections.
 *
 * The transaction caller must supply trusted providerData,
 * server-generated request IDs, and occupancy rows retrieved
 * using FEASTA's canonical Manila-date/status query.
 *
 * This does not reserve availability or write Firestore records.
 * Provider acceptance must continue enforcing its own
 * transaction-based reservation check.
 */
export function prepareMultiProviderAvailability(input: {
  candidates: readonly MultiProviderAvailabilityCandidate[];
  now: Date;
}): readonly MultiProviderAvailabilityAssessment[] {
  const {candidates, now} = input;

  if (
    !Array.isArray(candidates) ||
    candidates.length < 2 ||
    candidates.length > 4 ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    return reject("Multi-provider availability input is invalid.");
  }

  const providerIds = new Set<string>();
  const requestIds = new Set<string>();

  let commonDateKey: string | null = null;
  let commonStartTime: string | null = null;
  let commonEndTime: string | null = null;
  let commonGuestCount: number | null = null;

  // Validate the entire selection before invoking any provider validator.
  for (const candidate of candidates) {
    const request = candidate?.request;
    const date = request?.eventDate;

    const dateKey =
      date instanceof Date && Number.isFinite(date.getTime())
        ? manilaDateKey(date)
        : "";

    if (
      !candidate ||
      typeof candidate.providerId !== "string" ||
      !candidate.providerId.trim() ||
      providerIds.has(candidate.providerId) ||
      !candidate.providerData ||
      typeof candidate.providerData !== "object" ||
      Array.isArray(candidate.providerData) ||
      !request ||
      typeof request.providerRequestId !== "string" ||
      !request.providerRequestId.trim() ||
      requestIds.has(request.providerRequestId) ||
      (request.type !== "catering" && request.type !== "addon") ||
      !dateKey ||
      typeof request.eventTime !== "string" ||
      typeof request.eventEndTime !== "string" ||
      !Number.isSafeInteger(request.guestCount) ||
      request.guestCount <= 0 ||
      !Array.isArray(candidate.existingBookings)
    ) {
      return reject("Multi-provider availability identity is invalid.");
    }

    if (
      commonDateKey !== null &&
      (commonDateKey !== dateKey ||
        commonStartTime !== request.eventTime ||
        commonEndTime !== request.eventEndTime ||
        commonGuestCount !== request.guestCount)
    ) {
      return reject("All providers must share the same event schedule.");
    }

    commonDateKey = dateKey;
    commonStartTime = request.eventTime;
    commonEndTime = request.eventEndTime;
    commonGuestCount = request.guestCount;

    providerIds.add(candidate.providerId);
    requestIds.add(request.providerRequestId);
  }

  const assessments: MultiProviderAvailabilityAssessment[] = [];

  for (const candidate of candidates) {
    const result = validateProviderAvailability({
      providerData: candidate.providerData,
      request: candidate.request,
      existingBookings: candidate.existingBookings,
      now,
    });

    assessments.push({
      providerId: candidate.providerId,
      providerRequestId: candidate.request.providerRequestId,
      result,
    });
  }

  const unavailable = assessments.find((item) => !item.result.available);

  if (unavailable) {
    throw new HttpsError(
      "failed-precondition",
      "A selected provider is unavailable. Review the event schedule and try again.",
      {
        reason: "multi-provider-availability-failed",
        providerId: unavailable.providerId,
        issueCodes: unavailable.result.issues.map((issue) => issue.code),
      },
    );
  }

  return assessments;
}