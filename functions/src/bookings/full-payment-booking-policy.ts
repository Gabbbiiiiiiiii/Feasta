import {
  HttpsError,
} from "firebase-functions/v2/https";

import type {
  PackagePaymentTermsSnapshot,
} from "../payments/package-payment-terms.js";

export const FULL_PAYMENT_PERCENTAGE =
  100;

export const FULL_PAYMENT_RATE_BPS =
  10_000;

export type NewBookingFullPaymentTerms =
  PackagePaymentTermsSnapshot & {
    source: "canonical_package";
    paymentPolicy: "full_payment";
    depositRateBps: 10_000;
    balanceDueDaysBeforeEvent: null;
    usesLegacyPaymentTerms: false;
  };

export function requireNewBookingFullPaymentTerms(
  terms: PackagePaymentTermsSnapshot,
): NewBookingFullPaymentTerms {
  if (
    terms.source !==
      "canonical_package" ||
    terms.paymentPolicy !==
      "full_payment" ||
    terms.depositRateBps !==
      FULL_PAYMENT_RATE_BPS ||
    terms.balanceDueDaysBeforeEvent !==
      null ||
    terms.usesLegacyPaymentTerms
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This package must use Full Payment before it can receive new bookings.",
      {
        reason:
          "full-payment-required",
      },
    );
  }

  return terms as
    NewBookingFullPaymentTerms;
}
