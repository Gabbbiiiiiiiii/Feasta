import {HttpsError} from "firebase-functions/v2/https";

import {
  buildBookingPaymentAgreement,
  bookingPaymentAgreementDisclosure,
  assertBookingPaymentAgreementAcknowledgements,
} from "./booking-payment-agreement.js";

import {
  buildProviderRequestRefundPolicyEvidence,
} from "./booking-refund-policy.js";

import {
  prepareMixedProviderFinancials,
  type PreparedMixedFinancials,
} from "./multi-provider-mixed-financial-preparation.js";

import type {
  TrustedMixedProviderRow,
} from "./multi-provider-mixed-transaction-reader.js";

import type {
  PreparedMultiProviderRefundPolicies,
} from "./multi-provider-refund-preparation.js";

import type {
  PreparedMultiProviderEligibilityItem,
} from "./multi-provider-payment-eligibility.js";

type Agreement = ReturnType<typeof buildBookingPaymentAgreement>;

export type PreparedMixedProviderAgreements = {
  agreements: Agreement[];
  disclosures: ReturnType<typeof bookingPaymentAgreementDisclosure>[];
};

type Input = {
  customerId: string;
  rows: readonly TrustedMixedProviderRow[];
  financials: PreparedMixedFinancials;
  cateringEligibility: ReadonlyMap<
    string,
    PreparedMultiProviderEligibilityItem
  >;
  refunds: PreparedMultiProviderRefundPolicies;
  guestCount: number;
  eventEndTime: string;
  standaloneEventStart?: Date;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

function minimumCentavos(gross: number, rateBps: number): number {
  if (
    !Number.isSafeInteger(gross) ||
    gross <= 0 ||
    !Number.isSafeInteger(rateBps) ||
    rateBps <= 0 ||
    rateBps > 10000
  ) {
    return reject("Mixed agreement deposit rate is invalid.");
  }

  // Match FEASTA's existing package agreement rounding.
  const amount = gross / 100;
  const percentage = rateBps / 100;
  const rounded = Math.round(
    (amount * (percentage / 100) + Number.EPSILON) * 100,
  );

  if (
    !Number.isSafeInteger(rounded) ||
    rounded <= 0 ||
    rounded > gross
  ) {
    return reject("Mixed agreement minimum payment is invalid.");
  }

  return rounded;
}

/**
 * Construct separate frozen agreements from trusted mixed selections.
 *
 * Catering eligibility MUST come from FEASTA's existing server-side
 * payment policy authority. Marketplace selections require full
 * payment and never inherit a Catering package policy.
 *
 * No booking writes or payment collection occur here.
 */
export function prepareMixedProviderBookingAgreements(
  input: Input,
): PreparedMixedProviderAgreements {
  const {
    customerId,
    rows,
    financials,
    cateringEligibility,
    refunds,
    guestCount,
    eventEndTime,
  } = input;

  if (
    typeof customerId !== "string" ||
    !/^[A-Za-z0-9_-]{2,160}$/.test(customerId) ||
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > 4 ||
    !Array.isArray(financials?.items) ||
    financials.items.length !== rows.length ||
    !(cateringEligibility instanceof Map) ||
    !Number.isSafeInteger(guestCount) ||
    guestCount <= 0 ||
    typeof eventEndTime !== "string" ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(eventEndTime) ||
    !refunds ||
    (refunds.mode !== "off" && refunds.mode !== "required")
  ) {
    return reject("Mixed agreement input is invalid.");
  }

  const canonical = prepareMixedProviderFinancials(rows);

  if (
    canonical.totalGrossAmountInCentavos !==
      financials.totalGrossAmountInCentavos ||
    canonical.cateringSubtotalInCentavos !==
      financials.cateringSubtotalInCentavos ||
    canonical.marketplaceSubtotalInCentavos !==
      financials.marketplaceSubtotalInCentavos
  ) {
    return reject("Mixed agreement financial totals are inconsistent.");
  }

  if (
    refunds.mode === "required"
      ? refunds.policies.size !== rows.length
      : refunds.policies.size !== 0
  ) {
    return reject("Mixed agreement refund policies are inconsistent.");
  }

  const cateringProviderIds = rows
    .filter((row) => row.kind === "catering_package")
    .map((row) => row.providerId);

  if (
    cateringEligibility.size !== cateringProviderIds.length ||
    cateringProviderIds.some((id) => !cateringEligibility.has(id))
  ) {
    return reject("Catering eligibility set is incomplete.");
  }

  let sharedEventStart: Date | null =
    rows.length === 1 && rows[0].kind === "marketplace_service" &&
      input.standaloneEventStart instanceof Date && Number.isFinite(input.standaloneEventStart.getTime())
      ? input.standaloneEventStart
      : null;

  for (const eligibility of cateringEligibility.values()) {
    const start = eligibility.initialPaymentEligibility.eventStartAt;

    if (
      !(start instanceof Date) ||
      !Number.isFinite(start.getTime()) ||
      (sharedEventStart &&
        sharedEventStart.getTime() !== start.getTime())
    ) {
      return reject("Mixed agreement event start is inconsistent.");
    }

    sharedEventStart = start;
  }

  if (!sharedEventStart) {
    return reject("Mixed agreement event start is missing.");
  }

  const agreements: Agreement[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const financial = financials.items[index];
    const expected = canonical.items[index];

    if (
      !financial ||
      !expected ||
      financial.kind !== row.kind ||
      expected.kind !== row.kind ||
      financial.providerId !== row.providerId ||
      expected.providerId !== row.providerId ||
      financial.grossAmountInCentavos !==
        expected.grossAmountInCentavos ||
      JSON.stringify(financial) !== JSON.stringify(expected)
    ) {
      return reject("Mixed agreement financial identity is invalid.");
    }

    const providerName = row.providerData.businessName;

    if (
      typeof providerName !== "string" ||
      !providerName.trim() ||
      providerName.length > 200
    ) {
      return reject("Mixed agreement provider name is invalid.");
    }

    const refund = refunds.mode === "required"
      ? refunds.policies.get(row.providerId)
      : undefined;

    if (refunds.mode === "required" && !refund) {
      return reject("Mixed agreement refund policy is missing.");
    }

    const refundPolicy = refund
      ? buildProviderRequestRefundPolicyEvidence(
          refund,
          null,
        ).refundPolicySnapshot
      : null;

    if (
      row.kind === "catering_package" &&
      financial.kind === "catering_package"
    ) {
      const eligibility = cateringEligibility.get(row.providerId);

      if (
        !eligibility ||
        eligibility.providerId !== row.providerId ||
        eligibility.packageId !== row.resolved.packageId ||
        eligibility.grossAmountInCentavos !==
          financial.grossAmountInCentavos ||
        eligibility.initialPaymentEligibility.eventStartAt.getTime() !==
          sharedEventStart.getTime()
      ) {
        return reject("Catering agreement eligibility is invalid.");
      }

      const initial = eligibility.initialPaymentEligibility;
      const gross = financial.grossAmountInCentavos;

      agreements.push(buildBookingPaymentAgreement({
        customerId,
        providerId: row.providerId,
        providerName,
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
        grossAmountInCentavos: gross,
        requiredUpfrontAmountInCentavos:
          initial.depositEligible
            ? minimumCentavos(
                gross,
                financial.packagePaymentTerms.depositRateBps,
              )
            : gross,
        depositEligible: initial.depositEligible,
        eligibilityReason: initial.reason,
        paymentPolicy: {
          packagePaymentTerms: financial.packagePaymentTerms,
          bookingPaymentPolicySnapshot:
            eligibility.bookingPaymentPolicySnapshot,
        },
        refundPolicy,
      }));

      continue;
    }

    if (
      row.kind !== "marketplace_service" ||
      financial.kind !== "marketplace_service" ||
      financial.serviceId !== row.service.serviceId ||
      financial.requiredUpfrontAmountInCentavos !==
        financial.grossAmountInCentavos ||
      financial.paymentPolicy !== "full_payment" ||
      financial.packagePaymentTerms !== null
    ) {
      return reject("Marketplace agreement linkage is invalid.");
    }

    const service = row.service;

    agreements.push(buildBookingPaymentAgreement({
      customerId,
      providerId: row.providerId,
      providerName,
      serviceNames: [service.name],
      serviceTierLabel: null,
      selection: {
        services: [{
          serviceId: service.serviceId,
          providerId: row.providerId,
          name: service.name,
          category: service.category,
          price: service.priceInCentavos / 100,
          downPaymentPercentage: 100,
        }],
      },
      eventStartAt: sharedEventStart,
      eventEndTime,
      grossAmountInCentavos: financial.grossAmountInCentavos,
      requiredUpfrontAmountInCentavos:
        financial.grossAmountInCentavos,
      depositEligible: false,
      paymentPolicy: {paymentPolicy: "full_payment"},
      refundPolicy,
    }));
  }

  return {
    agreements,
    disclosures: agreements.map(
      bookingPaymentAgreementDisclosure,
    ),
  };
}

export function confirmMixedProviderBookingAgreements(
  prepared: PreparedMixedProviderAgreements,
  acknowledgements: unknown,
): void {
  if (
    !prepared ||
    !Array.isArray(prepared.agreements) ||
    prepared.agreements.length < 1 ||
    prepared.agreements.length > 4 ||
    !Array.isArray(prepared.disclosures) ||
    prepared.disclosures.length !== prepared.agreements.length
  ) {
    return reject("Mixed agreement preparation is invalid.");
  }

  assertBookingPaymentAgreementAcknowledgements(
    prepared.agreements,
    acknowledgements,
  );
}