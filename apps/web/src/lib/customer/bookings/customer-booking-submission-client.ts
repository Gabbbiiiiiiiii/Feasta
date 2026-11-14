"use client";
import type {FoodChoiceSelectionV2} from "@feasta/shared-types/provider-package-v2";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";
import type {
  CateringPackageServiceTier,
} from "@/lib/catering/catering-service-tier";
import {BOOKING_SUBMISSION_DEADLINE_NOTICE} from "@/lib/customer/bookings/booking-submission-deadline";
import type {
  BookingRefundPolicyAcknowledgement,
} from "@/lib/customer/bookings/customer-refund-policy-client";

/* ==================================================================
   TYPES
   ================================================================== */

export type BookingMenuSelectionInput = {
  menuItemId: string;
  servingOptionId: string;
};

type SubmitBookingRequestBase = {
  agreementAcknowledgements?: readonly {providerId: string; agreementKey: string}[];
  clientRequestId: string;
  providerId: string;

  eventType: string;
  eventDate: string;
  eventTime: string;

  eventLocation: string;
  eventAddress: string;

  addonIds: readonly string[];

  specialRequest?: string;
  willArrangeOwnAddOns: boolean;
  customerArrangedAddOnsNote?: string;
  policyAcknowledgements: readonly BookingRefundPolicyAcknowledgement[];
};

export type SubmitPackageBookingRequestInput =
  SubmitBookingRequestBase & {
    cateringSelectionType?: "package";
    packageId: string;
    sharedContractVersion?: 2;
    expectedPackageRevision?: number;
    serviceTier?: CateringPackageServiceTier;
    packageThemeId?: string;

    eventEndTime: string;
    guestCount: number;

    foodChoiceSelections?: FoodChoiceSelectionV2[];
    selectedFoods: readonly string[];
    selectedDecorations: readonly string[];
    selectedFurniture: readonly string[];
  };

export type SubmitCustomMenuBookingRequestInput =
  SubmitBookingRequestBase & {
    cateringSelectionType: "custom_menu";
    eventEndTime?: never;
    guestCount?: never;
    menuSelections: readonly BookingMenuSelectionInput[];
  };

export type SubmitBookingRequestInput =
  | SubmitPackageBookingRequestInput
  | SubmitCustomMenuBookingRequestInput;

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
  options: {customerId?: string; freshAttempt?: boolean; restoredRequestId?: string} = {},
): Promise<SubmitBookingRequestResult> {
  return withSubmissionLock(options.customerId, async (uid, journal, save) => {
    const selectionKey = await bookingSelectionKey(input);
    assertSubmissionOwner(uid);
    const completed = journal.completed[input.clientRequestId] ?? journal.completed[selectionKey];
    if (completed) return parseSubmitBookingResponse(completed);
    if (!journal.active && options.restoredRequestId && !journal.outcomes[options.restoredRequestId]) {
      journal.active = options.restoredRequestId;
      journal.sourceRequestId = options.restoredRequestId;
      journal.sourceSelectionKey = undefined;
      save();
    }
    const previous = journal.outcomes[input.clientRequestId];
    if (previous?.outcome === "confirmed_created") return parseSubmitBookingResponse(previous.booking);
    if (previous?.outcome === "confirmed_rejected" && !options.freshAttempt) {
      throw new Error("Check Previous Request and acknowledge the current policies before starting a fresh attempt.");
    }
    if (journal.active) {
      const outcome = journal.outcomes[journal.active];
      if (outcome?.outcome !== "confirmed_rejected" || !options.freshAttempt) {
        throw new Error("Check Previous Request before submitting another booking. Its outcome may still be unresolved.");
      }
    }
    // A rejected identifier is permanently fenced, including when a restored
    // draft still contains it. Only the explicit, acknowledged retry reaches here.
    const clientRequestId = previous?.outcome === "confirmed_rejected" || journal.active
      ? `booking-${crypto.randomUUID()}` : input.clientRequestId;
    journal.active = clientRequestId;
    journal.sourceRequestId = input.clientRequestId;
    journal.sourceSelectionKey = selectionKey;
    save(); // Persist BEFORE dispatch; storage failure must prevent submission.
    assertSubmissionOwner(uid);
    const result = await dispatchCustomerBookingRequest({...input, clientRequestId}, uid);
    assertSubmissionOwner(uid);
    journal.outcomes[clientRequestId] = {outcome: "confirmed_created", booking: result};
    journal.completed[input.clientRequestId] = result;
    journal.completed[selectionKey] = result;
    journal.active = null;
    save();
    return result;
  });
}

async function dispatchCustomerBookingRequest(
  input: SubmitBookingRequestInput,
  uid: string,
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
    assertSubmissionOwner(uid);

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

export type BookingSubmissionOutcome =
  | {outcome: "confirmed_created"; booking: SubmitBookingRequestResult}
  | {outcome: "confirmed_rejected"}
  | {outcome: "unresolved"};

type SubmissionJournal = {
  active: string | null;
  sourceRequestId?: string;
  sourceSelectionKey?: string;
  completed: Record<string, SubmitBookingRequestResult>;
  outcomes: Record<string, Exclude<BookingSubmissionOutcome, {outcome: "unresolved"}>>;
};

async function bookingSelectionKey(input: SubmitBookingRequestInput): Promise<string> {
  const selection = Object.fromEntries(Object.entries(input)
    .filter(([key]) => !["clientRequestId", "policyAcknowledgements", "agreementAcknowledgements"].includes(key))
    .sort(([left], [right]) => left.localeCompare(right)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(selection)));
  return `selection:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function assertSubmissionOwner(uid: string) {
  if (auth.currentUser?.uid !== uid) {
    throw new Error("Your account changed. Reload this booking page before continuing.");
  }
}

async function withSubmissionLock<T>(
  expectedCustomerId: string | undefined,
  run: (uid: string, journal: SubmissionJournal, save: () => void) => Promise<T>,
): Promise<T> {
  await auth.authStateReady();
  if (!expectedCustomerId) throw new Error("Sign in and reload this booking page before continuing.");
  assertSubmissionOwner(expectedCustomerId);
  if (!navigator.locks) throw new Error("This browser cannot safely preserve booking attempts. Use a browser with Web Locks support.");
  return navigator.locks.request(`feasta-booking:${expectedCustomerId}`, {ifAvailable: true}, async (lock) => {
    if (!lock) throw new Error("A booking operation is already in progress. Check Previous Request when it finishes.");
    assertSubmissionOwner(expectedCustomerId);
    const key = `feasta:booking-submission:v1:${expectedCustomerId}`;
    const stored = localStorage.getItem(key);
    const journal: SubmissionJournal = stored ? JSON.parse(stored) : {active: null, outcomes: {}, completed: {}};
    if (!journal || (journal.active !== null && !validId(journal.active)) ||
        !journal.outcomes || typeof journal.outcomes !== "object" || Array.isArray(journal.outcomes) ||
        !journal.completed || typeof journal.completed !== "object" || Array.isArray(journal.completed)) {
      throw new Error("Saved booking evidence cannot be read safely. Contact support before submitting.");
    }
    return run(expectedCustomerId, journal, () => {
      assertSubmissionOwner(expectedCustomerId);
      localStorage.setItem(key, JSON.stringify(journal));
    });
  });
}

/** Read-only authenticated reconciliation. Missing records remain unresolved. */
export async function reconcileCustomerBookingSubmission(customerId?: string, restoredRequestId?: string): Promise<BookingSubmissionOutcome> {
  return withSubmissionLock(customerId, async (uid, journal, save) => {
    if (restoredRequestId && journal.completed[restoredRequestId]) {
      return {outcome: "confirmed_created", booking: parseSubmitBookingResponse(journal.completed[restoredRequestId])};
    }
    if (!journal.active && restoredRequestId && !journal.outcomes[restoredRequestId]) {
      if (!/^[A-Za-z0-9_-]{8,160}$/.test(restoredRequestId)) throw new Error("Invalid saved request identifier.");
      journal.active = restoredRequestId;
      journal.sourceRequestId = restoredRequestId;
      journal.sourceSelectionKey = undefined;
      save();
    }
    const clientRequestId = journal.active;
    if (!clientRequestId) throw new Error("No previous request is saved for this account on this device.");
    initializeBrowserAppCheck();
    const callable = httpsCallable<{clientRequestId: string}, {
      clientRequestId?: unknown; outcome?: unknown; booking?: SubmitBookingRequestResponse;
    }>(functions, "reconcileBookingSubmission", {timeout: 30_000});
    const {data} = await callable({clientRequestId});
    assertSubmissionOwner(uid);
    if (data?.clientRequestId !== clientRequestId) throw new Error("Invalid reconciliation response. Keep the original request and check again.");
    if (data.outcome === "confirmed_created" && data.booking) {
      const booking = parseSubmitBookingResponse(data.booking);
      if (booking.created || !booking.providerRequestIds.length) throw new Error("Invalid recovery evidence. Check again.");
      const outcome = {outcome: "confirmed_created" as const, booking};
      journal.outcomes[clientRequestId] = outcome;
      journal.completed[journal.sourceRequestId ?? clientRequestId] = booking;
      if (journal.sourceSelectionKey) journal.completed[journal.sourceSelectionKey] = booking;
      journal.active = null;
      save();
      return outcome;
    }
    if (data.outcome === "confirmed_rejected") {
      journal.outcomes[clientRequestId] = {outcome: "confirmed_rejected"};
      save(); // Retain terminal evidence even after an explicitly initiated retry.
      return {outcome: "confirmed_rejected"};
    }
    return {outcome: "unresolved"};
  });
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
  const agreementReason = (error as FirebaseError & {details?: {reason?: unknown}}).details?.reason;

  if (agreementReason === "customer_booking_restricted") {
    const expiresAt = (error as FirebaseError & {details?: {expiresAt?: unknown}}).details?.expiresAt;
    const date = typeof expiresAt === "string" ? new Date(expiresAt) : null;
    const expiry = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
    }).format(date) : null;
    return Object.assign(new Error(`New bookings are restricted after three verified unpaid booking expirations within 30 days.${expiry ? ` Your restriction ends ${expiry} (Manila).` : " Contact support for the restriction end date."} Existing bookings, permitted payments, messages and support remain available.`),
      {reason: agreementReason, expiresAt});
  }

  if (agreementReason === "booking_submission_payment_deadline_passed") {
    return Object.assign(
      new Error(BOOKING_SUBMISSION_DEADLINE_NOTICE),
      {reason: agreementReason},
    );
  }
  if (agreementReason === "BOOKING_PAYMENT_AGREEMENT_CHANGED" || agreementReason === "BOOKING_PAYMENT_AGREEMENT_REQUIRED") {
    return Object.assign(new Error("Booking terms changed. Review and acknowledge the current agreement again."), {reason: agreementReason});
  }

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
        "The booking request took too long to complete. Use Check Previous Request to recover its outcome before submitting again.",
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
