import {HttpsError} from "firebase-functions/v2/https";

import {
  buildBookingPaymentAgreement,
  bookingPaymentAgreementDisclosure,
  assertBookingPaymentAgreementAcknowledgements,
} from "./booking-payment-agreement.js";

import {
  prepareMultiProviderFinancials,
  type PreparedMultiProviderFinancials,
} from "./multi-provider-financial-preparation.js";

import type {
  PreparedMultiProviderEligibility,
} from "./multi-provider-payment-eligibility.js";

import type {
  PreparedMultiProviderRefundPolicies,
} from "./multi-provider-refund-preparation.js";

import {
  buildProviderRequestRefundPolicyEvidence,
} from "./booking-refund-policy.js";

import type {
  TrustedMultiProviderPackage,
} from "./multi-provider-transaction-reader.js";

type Agreement = ReturnType<typeof buildBookingPaymentAgreement>;

type Input = {
  customerId: string;
  rows: readonly TrustedMultiProviderPackage[];
  financials: PreparedMultiProviderFinancials;
  eligibility: PreparedMultiProviderEligibility;
  refunds: PreparedMultiProviderRefundPolicies;
  guestCount: number;
  eventEndTime: string;
};

export type PreparedMultiProviderAgreements = {
  agreements: Agreement[];
  disclosures: ReturnType<typeof bookingPaymentAgreementDisclosure>[];
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

/**
 * Matches the existing submitBookingRequest calculation:
 * roundCurrency(amount * (percentage / 100)).
 *
 * This is the minimum for agreement disclosure, not a payment
 * choice, charge instruction or authorization to submit.
 */
function canonicalMinimumCentavos(
  grossCentavos: number,
  rateBps: number,
): number {
  if (
    !Number.isSafeInteger(grossCentavos) ||
    grossCentavos <= 0 ||
    !Number.isSafeInteger(rateBps) ||
    rateBps <= 0 ||
    rateBps > 10000
  ) {
    return reject("Agreement payment amount is invalid.");
  }

  const amount = grossCentavos / 100;
  const percentage = rateBps / 100;

  const rounded =
    Math.round(
      (amount * (percentage / 100) + Number.EPSILON) * 100,
    );

  if (
    !Number.isSafeInteger(rounded) ||
    rounded <= 0 ||
    rounded > grossCentavos
  ) {
    return reject("Agreement minimum payment is invalid.");
  }

  return rounded;
}

/**
 * Read-only construction of the current agreements for disclosure.
 *
 * All inputs must originate from trusted transaction reads and
 * existing server-side financial and eligibility authorities.
 *
 * No checkout choice is made here. No Firestore writes occur.
 */
export function prepareMultiProviderBookingAgreements(
  input: Input,
): PreparedMultiProviderAgreements {
  const {
    customerId,
    rows,
    financials,
    eligibility,
    refunds,
    guestCount,
    eventEndTime,
  } = input;

  if (
    typeof customerId !== "string" ||
    !/^[A-Za-z0-9_-]{2,160}$/.test(customerId) ||
    !Array.isArray(rows) ||
    rows.length < 2 ||
    rows.length > 4 ||
    !Array.isArray(financials?.items) ||
    financials.items.length !== rows.length ||
    !Array.isArray(eligibility?.items) ||
    eligibility.items.length !== rows.length ||
    !Number.isSafeInteger(guestCount) ||
    guestCount <= 0 ||
    typeof eventEndTime !== "string" ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(eventEndTime) ||
    !refunds ||
    (refunds.mode !== "off" && refunds.mode !== "required")
  ) {
    return reject("Multi-provider agreement input is invalid.");
  }

  if (
    refunds.mode === "off"
      ? refunds.policies.size !== 0
      : refunds.policies.size !== rows.length
  ) {
    return reject("Agreement refund-policy evidence is inconsistent.");
  }

  // Independently reconstruct canonical financial amounts and
  // terms from the trusted package records.
  const canonical = prepareMultiProviderFinancials(
    rows.map((row) => ({
      providerId: row.providerId,
      packageId: row.resolved.packageId,
      packageData: row.packageData,
      resolved: row.resolved,
    })),
  );

  if (
    canonical.totalGrossAmountInCentavos !==
      financials.totalGrossAmountInCentavos
  ) {
    return reject("Agreement financial totals are inconsistent.");
  }

  const seen = new Set<string>();
  const agreements: Agreement[] = [];
  let sharedEventStart: number | null = null;

  // Validate the complete provider-to-financial correspondence
  // before creating any agreements.
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const financial = financials.items[index];
    const expected = canonical.items[index];
    const eligibilityItem = eligibility.items[index];

    const eventStart =
      eligibilityItem?.initialPaymentEligibility?.eventStartAt;

    if (
      !row ||
      seen.has(row.providerId) ||
      !financial ||
      !expected ||
      !eligibilityItem ||
      row.resolved.providerId !== row.providerId ||
      financial.providerId !== row.providerId ||
      financial.packageId !== row.resolved.packageId ||
      eligibilityItem.providerId !== row.providerId ||
      eligibilityItem.packageId !== row.resolved.packageId ||
      financial.grossAmountInCentavos !==
        expected.grossAmountInCentavos ||
      eligibilityItem.grossAmountInCentavos !==
        expected.grossAmountInCentavos ||
      JSON.stringify(financial.packagePaymentTerms) !==
        JSON.stringify(expected.packagePaymentTerms) ||
      !(eventStart instanceof Date) ||
      !Number.isFinite(eventStart.getTime()) ||
      typeof row.providerData.businessName !== "string" ||
      !row.providerData.businessName.trim() ||
      typeof row.resolved.packageName !== "string" ||
      !row.resolved.packageName.trim()
    ) {
      return reject("Agreement provider or financial evidence is invalid.");
    }

    const eventStartMillis = eventStart.getTime();

    if (
      sharedEventStart !== null &&
      sharedEventStart !== eventStartMillis
    ) {
      return reject("Providers must share the same event start.");
    }

    sharedEventStart = eventStartMillis;
    seen.add(row.providerId);
  }

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const financial = financials.items[index];
    const eligibilityItem = eligibility.items[index];
    const initial = eligibilityItem.initialPaymentEligibility;

    const grossAmountInCentavos =
      financial.grossAmountInCentavos;

    const requiredUpfrontAmountInCentavos =
      initial.depositEligible
        ? canonicalMinimumCentavos(
            grossAmountInCentavos,
            financial.packagePaymentTerms.depositRateBps,
          )
        : grossAmountInCentavos;

    const refundPolicy =
      refunds.mode === "required"
        ? refunds.policies.get(row.providerId)
        : undefined;

    if (refunds.mode === "required" && !refundPolicy) {
      return reject("Provider refund-policy evidence is missing.");
    }

    // Only the current refund policy snapshot enters the
    // agreement fingerprint. The customer acknowledgement
    // is validated in a separate submission stage.
    const currentRefundSnapshot = refundPolicy
      ? buildProviderRequestRefundPolicyEvidence(
          refundPolicy,
          null,
        ).refundPolicySnapshot
      : null;

    agreements.push(
      buildBookingPaymentAgreement({
        customerId,
        providerId: row.providerId,
        providerName: row.providerData.businessName as string,
        serviceNames: [row.resolved.packageName],
        serviceTierLabel:
          row.resolved.offer.serviceTierLabel ?? null,
        selection: {
          packageId: row.resolved.packageId,
          offer: row.resolved.offer,
          guestCount,
          foodChoices: row.resolved.foodChoices,
        },
        eventStartAt: initial.eventStartAt,
        eventEndTime,
        grossAmountInCentavos,
        requiredUpfrontAmountInCentavos,
        depositEligible: initial.depositEligible,
        eligibilityReason: initial.reason,
        paymentPolicy: {
          packagePaymentTerms: financial.packagePaymentTerms,
          bookingPaymentPolicySnapshot:
            eligibilityItem.bookingPaymentPolicySnapshot,
        },
        refundPolicy: currentRefundSnapshot,
      }),
    );
  }

  return {
    agreements,
    disclosures: agreements.map(bookingPaymentAgreementDisclosure),
  };
}

/**
 * Validate acknowledgement of every current agreement.
 *
 * The outer transaction must separately preserve FEASTA's
 * terminal acknowledgement-rejection and idempotency semantics.
 */
export function confirmMultiProviderBookingAgreements(
  prepared: PreparedMultiProviderAgreements,
  acknowledgementValue: unknown,
): void {
  if (
    !prepared ||
    !Array.isArray(prepared.agreements) ||
    prepared.agreements.length < 2 ||
    prepared.agreements.length > 4 ||
    !Array.isArray(prepared.disclosures) ||
    prepared.disclosures.length !== prepared.agreements.length
  ) {
    return reject("Agreement preparation is invalid.");
  }

  assertBookingPaymentAgreementAcknowledgements(
    prepared.agreements,
    acknowledgementValue,
  );
}