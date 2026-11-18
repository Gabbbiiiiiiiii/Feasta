import {HttpsError} from "firebase-functions/v2/https";

import {
  buildPackagePaymentTermsSnapshot,
} from "../payments/package-payment-terms.js";

import {
  requireNewBookingCanonicalPaymentTerms,
  type NewBookingCanonicalPaymentTerms,
} from "./canonical-booking-payment-policy.js";

import type {
  TrustedMixedProviderRow,
} from "./multi-provider-mixed-transaction-reader.js";

export type MixedCateringFinancialItem = {
  kind: "catering_package";
  providerId: string;
  packageId: string;
  grossAmountInCentavos: number;
  packagePaymentTerms: NewBookingCanonicalPaymentTerms;
};

export type MixedMarketplaceFinancialItem = {
  kind: "marketplace_service";
  providerId: string;
  serviceId: string;
  grossAmountInCentavos: number;
  requiredUpfrontAmountInCentavos: number;
  paymentPolicy: "full_payment";
  packagePaymentTerms: null;
};

export type MixedFinancialItem =
  | MixedCateringFinancialItem
  | MixedMarketplaceFinancialItem;

export type PreparedMixedFinancials = {
  items: readonly MixedFinancialItem[];
  cateringSubtotalInCentavos: number;
  marketplaceSubtotalInCentavos: number;
  totalGrossAmountInCentavos: number;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

function toCentavos(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return reject("Trusted financial amount is invalid.");
  }

  const cents = Math.round(value * 100);

  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    Math.abs(value * 100 - cents) > 1e-7
  ) {
    return reject("Trusted financial precision is invalid.");
  }

  return cents;
}

function addSafe(left: number, right: number): number {
  const result = left + right;

  if (!Number.isSafeInteger(result)) {
    return reject("Mixed booking financial total is invalid.");
  }

  return result;
}

/**
 * Pure financial preparation from already trusted Firestore rows.
 *
 * Catering retains FEASTA canonical package payment terms.
 * Marketplace services require the entire fixed price upfront.
 *
 * This does not authorize collection of payments, refunds,
 * agreements, eligibility or Firestore booking writes.
 */
export function prepareMixedProviderFinancials(
  rows: readonly TrustedMixedProviderRow[],
): PreparedMixedFinancials {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 4) {
    return reject("Mixed financial selection is invalid.");
  }

  const seen = new Set<string>();
  const items: MixedFinancialItem[] = [];
  let cateringSubtotalInCentavos = 0;
  let marketplaceSubtotalInCentavos = 0;

  for (const row of rows) {
    if (
      !row ||
      typeof row.providerId !== "string" ||
      !/^[A-Za-z0-9_-]{8,160}$/u.test(row.providerId) ||
      seen.has(row.providerId)
    ) {
      return reject("Mixed financial provider identity is invalid.");
    }

    seen.add(row.providerId);

    if (row.kind === "catering_package") {
      if (
        row.resolved.providerId !== row.providerId ||
        row.packageData.providerId !== row.providerId ||
        row.resolved.packageId.length === 0
      ) {
        return reject("Catering financial linkage is invalid.");
      }

      const grossAmountInCentavos = toCentavos(
        row.resolved.basePrice,
      );

      const packagePaymentTerms =
        requireNewBookingCanonicalPaymentTerms(
          buildPackagePaymentTermsSnapshot(row.packageData),
        );

      cateringSubtotalInCentavos = addSafe(
        cateringSubtotalInCentavos,
        grossAmountInCentavos,
      );

      items.push({
        kind: "catering_package",
        providerId: row.providerId,
        packageId: row.resolved.packageId,
        grossAmountInCentavos,
        packagePaymentTerms,
      });

      continue;
    }

    if (row.kind !== "marketplace_service") {
      return reject("Mixed financial selection kind is invalid.");
    }

    if (
      row.service.providerId !== row.providerId ||
      row.service.ownerId !== row.providerOwnerId ||
      typeof row.service.serviceId !== "string" ||
      !/^[A-Za-z0-9_-]{8,160}$/u.test(row.service.serviceId) ||
      !Number.isSafeInteger(row.service.priceInCentavos) ||
      row.service.priceInCentavos <= 0
    ) {
      return reject("Marketplace financial linkage is invalid.");
    }

    const grossAmountInCentavos = row.service.priceInCentavos;

    marketplaceSubtotalInCentavos = addSafe(
      marketplaceSubtotalInCentavos,
      grossAmountInCentavos,
    );

    items.push({
      kind: "marketplace_service",
      providerId: row.providerId,
      serviceId: row.service.serviceId,
      grossAmountInCentavos,
      requiredUpfrontAmountInCentavos: grossAmountInCentavos,
      paymentPolicy: "full_payment",
      packagePaymentTerms: null,
    });
  }

  if (
    (rows.length > 1 && cateringSubtotalInCentavos <= 0) ||
    marketplaceSubtotalInCentavos <= 0
  ) {
    return reject(
      "Mixed booking requires Catering and an event service.",
    );
  }

  return {
    items,
    cateringSubtotalInCentavos,
    marketplaceSubtotalInCentavos,
    totalGrossAmountInCentavos: addSafe(
      cateringSubtotalInCentavos,
      marketplaceSubtotalInCentavos,
    ),
  };
}