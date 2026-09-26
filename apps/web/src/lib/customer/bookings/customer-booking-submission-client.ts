"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";
import type {
  BookingRefundPolicyAcknowledgement,
} from "@/lib/customer/bookings/customer-refund-policy-client";

/* ==================================================================
   TYPES
   ================================================================== */

export type SubmitBookingRequestInput = {
  clientRequestId: string;
  providerId: string;
  packageId: string;

  eventType: string;
  eventDate: string;
  eventTime: string;
  eventEndTime: string;

  eventLocation: string;
  eventAddress: string;
  guestCount: number;

  selectedFoods: readonly string[];
  selectedDecorations: readonly string[];
  selectedFurniture: readonly string[];

  addonIds: readonly string[];

  specialRequest?: string;
  willArrangeOwnAddOns: boolean;
  customerArrangedAddOnsNote?: string;
  policyAcknowledgements: readonly BookingRefundPolicyAcknowledgement[];
};

export type SubmitBookingRequestResult = {
  bookingId: string;
  mainEventId: string;
  providerRequestIds: readonly string[];
  created: boolean;
};

type SubmitBookingRequestResponse = {
  bookingId?: unknown;
  mainEventId?: unknown;
  providerRequestIds?: unknown;
  created?: unknown;
};

/* ==================================================================
   PUBLIC CLIENT
   ================================================================== */

export async function submitCustomerBookingRequest(
  input: SubmitBookingRequestInput,
): Promise<SubmitBookingRequestResult> {
  try {
    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) {
    throw new Error(
        "You need to sign in before submitting a booking request.",
    );
    }

    initializeBrowserAppCheck();

    const callable = httpsCallable<
      SubmitBookingRequestInput,
      SubmitBookingRequestResponse
    >(
      functions,
      "submitBookingRequest",
      {
        timeout: 30_000,
      },
    );

    const response = await callable(input);

    return parseSubmitBookingResponse(
      response.data,
    );
  } catch (error) {
    throw normalizeBookingSubmissionError(
      error,
    );
  }
}

/* ==================================================================
   RESPONSE VALIDATION
   ================================================================== */

function parseSubmitBookingResponse(
  value: SubmitBookingRequestResponse,
): SubmitBookingRequestResult {
  const bookingId = validId(
    value.bookingId,
  );

  const mainEventId = validId(
    value.mainEventId,
  );

  const providerRequestIds =
    validIdList(
      value.providerRequestIds,
    );

  if (
    !bookingId ||
    !mainEventId ||
    providerRequestIds === null ||
    typeof value.created !== "boolean"
  ) {
    throw new Error(
      "FEASTA received an invalid booking response. Please try again.",
    );
  }

  if (bookingId !== mainEventId) {
    throw new Error(
      "FEASTA received inconsistent booking information. Please try again.",
    );
  }

  return {
    bookingId,
    mainEventId,
    providerRequestIds,
    created: value.created,
  };
}

/* ==================================================================
   ERROR NORMALIZATION
   ================================================================== */

function normalizeBookingSubmissionError(
  error: unknown,
): Error {
  if (!(error instanceof FirebaseError)) {
    if (error instanceof Error) {
      return error;
    }

    return new Error(
      "We could not submit your booking request. Please try again.",
    );
  }

  const code = error.code.replace(
    "functions/",
    "",
  );

  const refundPolicyReason = bookingRefundPolicyReason(error);
  if (refundPolicyReason) {
    return new CustomerBookingSubmissionError(
      refundPolicyReason === "REFUND_POLICY_CHANGED"
        ? "A Provider refund policy changed. Review the current policy and acknowledge it again."
        : "Review and acknowledge every current Provider refund policy before submitting.",
      refundPolicyReason,
    );
  }

  switch (code) {
    case "unauthenticated":
      return new Error(
        "Your session has expired. Please sign in again before submitting your booking.",
      );

    case "permission-denied":
      return new Error(
        "Your account cannot submit this booking request.",
      );

    case "invalid-argument":
      return new Error(
        safeCallableMessage(
          error,
          "Some booking information is invalid. Review your event details and selections before trying again.",
        ),
      );

    case "failed-precondition":
      return new Error(
        safeCallableMessage(
          error,
          "This booking can no longer be submitted with the current selections. Review the package, provider, date, or event services and try again.",
        ),
      );

    case "already-exists":
      return new Error(
        safeCallableMessage(
          error,
          "This booking request has already been submitted.",
        ),
      );

    case "resource-exhausted":
      return new Error(
        "Too many booking attempts were made. Please wait a few minutes before trying again.",
      );

    case "deadline-exceeded":
      return new Error(
        "The booking request took too long to complete. Please try again. FEASTA will safely reuse the same request identifier.",
      );

    case "unavailable":
      return new Error(
        "The booking service is temporarily unavailable. Please try again.",
      );

    case "internal":
    case "unknown":
      return new Error(
        "FEASTA could not complete the booking request. Please try again.",
      );

    default:
      return new Error(
        "We could not submit your booking request. Please try again.",
      );
  }
}

/* ==================================================================
   VALIDATION HELPERS
   ================================================================== */

function validId(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 160 ||
    normalized.includes("/")
  ) {
    return null;
  }

  return normalized;
}

function validIdList(
  value: unknown,
): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const result: string[] = [];

  for (const item of value) {
    const id = validId(item);

    if (!id) {
      return null;
    }

    result.push(id);
  }

  return result;
}

function safeCallableMessage(
  error: FirebaseError,
  fallback: string,
): string {
  const message =
    typeof error.message === "string"
      ? error.message
          .replace(
            /^Firebase:\s*/u,
            "",
          )
          .replace(
            /\s*\(functions\/[^)]+\)\.?$/u,
            "",
          )
          .trim()
      : "";

  if (
    !message ||
    message.length > 500
  ) {
    return fallback;
  }

  return message;
}

const REFUND_POLICY_REFRESH_REASONS = [
  "REFUND_POLICY_CHANGED",
  "REFUND_POLICY_REQUIRED",
  "REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED",
] as const;

type RefundPolicyRefreshReason =
  (typeof REFUND_POLICY_REFRESH_REASONS)[number];

export class CustomerBookingSubmissionError extends Error {
  constructor(
    message: string,
    readonly refundPolicyReason: RefundPolicyRefreshReason | null = null,
  ) {
    super(message);
    this.name = "CustomerBookingSubmissionError";
  }
}

export function bookingSubmissionRequiresRefundPolicyRefresh(
  error: unknown,
): boolean {
  return error instanceof CustomerBookingSubmissionError &&
    error.refundPolicyReason !== null;
}

function bookingRefundPolicyReason(
  error: FirebaseError,
): RefundPolicyRefreshReason | null {
  const details = (error as FirebaseError & {details?: unknown}).details ??
    error.customData?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const reason = (details as {reason?: unknown}).reason;
  return typeof reason === "string" &&
    REFUND_POLICY_REFRESH_REASONS.includes(reason as RefundPolicyRefreshReason)
    ? reason as RefundPolicyRefreshReason
    : null;
}
