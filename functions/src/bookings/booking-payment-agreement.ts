import {createHash} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";

import {
  bookingPolicyTimingV3,
  paymentDefaultAllocation,
  BOOKING_LIFECYCLE_POLICY_V3,
} from "./booking-policy-v3.js";

export type BookingPaymentAgreement =
  ReturnType<typeof buildBookingPaymentAgreement>;

export type BookingPaymentAgreementDisclosure =
  ReturnType<typeof bookingPaymentAgreementDisclosure>;

/**
 * Inputs come exclusively from the trusted submission selection resolver.
 *
 * The complete returned agreement is historical server evidence and is
 * intentionally richer than the browser disclosure.
 */
export function buildBookingPaymentAgreement(input: {
  customerId: string;
  providerId: string;
  providerName: string;

  serviceNames: readonly string[];
  serviceTierLabel?: string | null;

  selection: unknown;

  eventStartAt: Date;
  eventEndTime: string;

  grossAmountInCentavos: number;
  requiredUpfrontAmountInCentavos: number;

  depositEligible: boolean;
  eligibilityReason?: string;

  paymentPolicy: unknown;
  refundPolicy: unknown;
}) {
  const gross = input.grossAmountInCentavos;
  const upfront = input.requiredUpfrontAmountInCentavos;

  if (
    ![gross, upfront].every(
      (value) =>
        Number.isSafeInteger(value) &&
        value > 0,
    ) ||
    upfront > gross
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Agreement financial evidence is invalid.",
    );
  }

  const serviceNames = [
    ...new Set(
      input.serviceNames
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];

  if (
    serviceNames.length < 1 ||
    serviceNames.length > 32 ||
    serviceNames.some(
      (name) => name.length > 200,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Agreement service evidence is invalid.",
    );
  }

  const serviceTierLabel =
    typeof input.serviceTierLabel === "string" &&
    input.serviceTierLabel.trim().length > 0
      ? input.serviceTierLabel.trim()
      : null;

  const policyTiming =
    bookingPolicyTimingV3(
      input.eventStartAt,
    );

  const timing = {
    eventStartAt:
      policyTiming.eventStartAt.toISOString(),

    depositEligibilityCutoffAt:
      policyTiming.depositEligibilityCutoffAt.toISOString(),

    remainingBalanceDueAt:
      policyTiming.remainingBalanceDueAt.toISOString(),

    hardPaymentDeadlineAt:
      policyTiming.hardPaymentDeadlineAt.toISOString(),

    preparationStartsAt:
      policyTiming.preparationStartsAt.toISOString(),
  };
  const depositEligible =
    input.depositEligible &&
    upfront < gross;

  const contract = {
    schemaVersion: 1,
    timingSchemaVersion: 3,
    channel: "booking_submission",

    customerId: input.customerId,

    providerId: input.providerId,
    providerName: input.providerName,

    serviceNames,
    serviceTierLabel,

    selection: input.selection,

    eventEndTime: input.eventEndTime,

    ...timing,

    grossAmountInCentavos: gross,

    requiredUpfrontAmountInCentavos:
      depositEligible
        ? upfront
        : gross,

    remainingBalanceInCentavos:
      depositEligible
        ? gross - upfront
        : 0,

    depositEligible,

    eligibilityReason:
      input.eligibilityReason ??
      (depositEligible
        ? "deposit_eligible"
        : "package_full_payment"),

    initialPaymentEligibilitySchemaVersion: 2,

    paymentPolicy:
      input.paymentPolicy,

    refundPolicy:
      input.refundPolicy,

    lifecyclePolicy:
      BOOKING_LIFECYCLE_POLICY_V3,

    paymentDefaultAllocation:
      depositEligible
        ? paymentDefaultAllocation(
            upfront,
          )
        : null,
  };

  const agreementKey =
    createHash("sha256")
      .update(stable(contract))
      .digest("hex");

  return {
    ...contract,
    agreementKey,
  };
}

/**
 * Public Customer disclosure.
 *
 * Never return the complete frozen agreement to the browser. The full
 * agreement contains trusted selection/policy evidence that is required
 * only for server validation and historical audit.
 */
export function bookingPaymentAgreementDisclosure(
  agreement: BookingPaymentAgreement,
) {
  return {
    schemaVersion:
      agreement.schemaVersion,

    timingSchemaVersion:
      agreement.timingSchemaVersion,

    agreementKey:
      agreement.agreementKey,

    providerId:
      agreement.providerId,

    providerName:
      agreement.providerName,

    serviceNames:
      [...agreement.serviceNames],

    serviceTierLabel:
      agreement.serviceTierLabel,

    eventStartAt:
      agreement.eventStartAt,

    depositEligibilityCutoffAt:
      agreement.depositEligibilityCutoffAt,

    remainingBalanceDueAt:
      agreement.remainingBalanceDueAt,

    hardPaymentDeadlineAt:
      agreement.hardPaymentDeadlineAt,

    preparationStartsAt:
      agreement.preparationStartsAt,

    grossAmountInCentavos:
      agreement.grossAmountInCentavos,

    requiredUpfrontAmountInCentavos:
      agreement.requiredUpfrontAmountInCentavos,

    remainingBalanceInCentavos:
      agreement.remainingBalanceInCentavos,

    depositEligible:
      agreement.depositEligible,

    eligibilityReason:
      agreement.eligibilityReason,

    paymentDefaultAllocation:
      agreement.paymentDefaultAllocation,
  };
}

export function assertBookingPaymentAgreementAcknowledgements(
  agreements:
    readonly BookingPaymentAgreement[],
  value: unknown,
) {
  if (
    !Array.isArray(value) ||
    value.length !==
      agreements.length ||
    value.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item)
          .sort()
          .join() !==
          "agreementKey,providerId" ||
        typeof item.providerId !==
          "string" ||
        !/^[a-f0-9]{64}$/u.test(
          item.agreementKey,
        ),
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Review and acknowledge each Booking & Payment Agreement.",
      {
        reason:
          "BOOKING_PAYMENT_AGREEMENT_REQUIRED",
      },
    );
  }

  if (
    new Set(
      value.map(
        (item) => item.providerId,
      ),
    ).size !== agreements.length ||
    agreements.some(
      (agreement) =>
        !value.some(
          (item) =>
            item.providerId ===
              agreement.providerId &&
            item.agreementKey ===
              agreement.agreementKey,
        ),
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Booking terms changed. Review the current agreement again.",
      {
        reason:
          "BOOKING_PAYMENT_AGREEMENT_CHANGED",
      },
    );
  }
}

function stable(
  value: unknown,
): string {
  if (Array.isArray(value)) {
    return `[${value
      .map(stable)
      .join(",")}]`;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const entries =
      Object.entries(value)
        .filter(
          ([key]) =>
            key !== "capturedAt",
        )
        .sort(([a], [b]) =>
          a.localeCompare(b),
        );

    return (
      "{" +
      entries
        .map(
          ([key, item]) =>
            `${JSON.stringify(
              key,
            )}:${stable(item)}`,
        )
        .join(",") +
      "}"
    );
  }

  return (
    JSON.stringify(value) ??
    "null"
  );
}