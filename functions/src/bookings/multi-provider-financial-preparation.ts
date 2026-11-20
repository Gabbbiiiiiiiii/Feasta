import {HttpsError} from "firebase-functions/v2/https";
import {
  buildPackagePaymentTermsSnapshot,
} from "../payments/package-payment-terms.js";
import {
  requireNewBookingCanonicalPaymentTerms,
  type NewBookingCanonicalPaymentTerms,
} from "./canonical-booking-payment-policy.js";

/**
 * Only server-loaded package records and previously validated package
 * resolutions may enter this preparation step.
 *
 * This module does NOT authorize bookings, deposits, refunds, payment
 * collection, or Firestore writes.
 */
export type FinancialPreparationEntry = {
  providerId: string;
  packageId: string;
  packageData: Readonly<Record<string, unknown>>;
  resolved: {
    providerId: string;
    packageId: string;
    basePrice: number;
  };
};

export type PreparedMultiProviderFinancialItem = {
  providerId: string;
  packageId: string;
  grossAmountInCentavos: number;
  packagePaymentTerms: NewBookingCanonicalPaymentTerms;
};

export type PreparedMultiProviderFinancials = {
  items: PreparedMultiProviderFinancialItem[];
  totalGrossAmountInCentavos: number;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

/**
 * Convert the trusted server-resolved amount to exact integer centavos.
 * Refuse invalid precision, overflow, negative values, and zero amounts.
 */
function amountToCentavos(amount: number): number {
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return reject("Authoritative package amount is invalid.");
  }

  const centavos = Math.round(amount * 100);

  if (
    !Number.isSafeInteger(centavos) ||
    centavos <= 0 ||
    Math.abs(amount * 100 - centavos) > 1e-7
  ) {
    return reject("Authoritative package amount is invalid.");
  }

  return centavos;
}

export function prepareMultiProviderFinancials(
  entries: readonly FinancialPreparationEntry[],
): PreparedMultiProviderFinancials {
  if (
    !Array.isArray(entries) ||
    entries.length < 2 ||
    entries.length > 4
  ) {
    return reject("Multi-provider financial selection is invalid.");
  }

  const providerIds = new Set<string>();
  const items: PreparedMultiProviderFinancialItem[] = [];
  let totalGrossAmountInCentavos = 0;

  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.providerId !== "string" ||
      !entry.providerId.trim() ||
      typeof entry.packageId !== "string" ||
      !entry.packageId.trim() ||
      providerIds.has(entry.providerId) ||
      entry.resolved?.providerId !== entry.providerId ||
      entry.resolved?.packageId !== entry.packageId ||
      !entry.packageData ||
      typeof entry.packageData !== "object" ||
      Array.isArray(entry.packageData) ||
      entry.packageData.providerId !== entry.providerId
    ) {
      return reject("Multi-provider financial identity is invalid.");
    }

    providerIds.add(entry.providerId);

    const grossAmountInCentavos = amountToCentavos(
      entry.resolved.basePrice,
    );

    // Reuse FEASTA's canonical payment-term authority unchanged.
    const packagePaymentTerms =
      requireNewBookingCanonicalPaymentTerms(
        buildPackagePaymentTermsSnapshot(entry.packageData),
      );

    const nextTotal = totalGrossAmountInCentavos +
      grossAmountInCentavos;

    if (!Number.isSafeInteger(nextTotal)) {
      return reject("Multi-provider financial total is invalid.");
    }

    totalGrossAmountInCentavos = nextTotal;

    items.push({
      providerId: entry.providerId,
      packageId: entry.packageId,
      grossAmountInCentavos,
      packagePaymentTerms,
    });
  }

  return {
    items,
    totalGrossAmountInCentavos,
  };
}