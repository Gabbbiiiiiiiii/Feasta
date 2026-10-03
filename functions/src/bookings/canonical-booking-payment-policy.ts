import {BALANCE_DUE_HOURS_BEFORE_EVENT} from "../payments/canonical-balance-timing.js";
import {parsePackagePaymentTermsSnapshot} from "../payments/package-payment-terms.js";
import {HttpsError} from "firebase-functions/v2/https";

import type {PackagePaymentTermsSnapshot} from "../payments/package-payment-terms.js";

export const FULL_PAYMENT_PERCENTAGE = 100;
export const FULL_PAYMENT_RATE_BPS = 10_000;

export type NewBookingCanonicalPaymentTerms = PackagePaymentTermsSnapshot & {
  source: "canonical_package";
  paymentPolicy: "full_payment" | "deposit_then_balance";
  usesLegacyPaymentTerms: false;
};

export function requireNewBookingCanonicalPaymentTerms(
  terms: PackagePaymentTermsSnapshot,
): NewBookingCanonicalPaymentTerms {
  terms = parsePackagePaymentTermsSnapshot(terms)!;
  const validPolicyTerms = terms.paymentPolicy === "full_payment"
    ? terms.depositRateBps === FULL_PAYMENT_RATE_BPS &&
      terms.balanceDueDaysBeforeEvent === null
    : terms.paymentPolicy === "deposit_then_balance" &&
      Number.isSafeInteger(terms.depositRateBps) &&
      terms.depositRateBps > 0 && terms.depositRateBps < FULL_PAYMENT_RATE_BPS &&
      (terms.schemaVersion === 2 ? terms.balanceDueHoursBeforeEvent === BALANCE_DUE_HOURS_BEFORE_EVENT :
        Number.isSafeInteger(terms.balanceDueDaysBeforeEvent) && terms.balanceDueDaysBeforeEvent !== null &&
        terms.balanceDueDaysBeforeEvent > 0 && terms.balanceDueDaysBeforeEvent <= 365);

  if (
    (terms.schemaVersion !== 1 && terms.schemaVersion !== 2) ||
    terms.source !== "canonical_package" ||
    terms.usesLegacyPaymentTerms !== false ||
    !validPolicyTerms
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This package must have valid canonical payment terms before it can receive new bookings.",
      {reason: "canonical-payment-terms-required"},
    );
  }

  return {...terms, schemaVersion: 2, balanceDueDaysBeforeEvent: null,
    balanceDueHoursBeforeEvent: terms.paymentPolicy === "deposit_then_balance" ? BALANCE_DUE_HOURS_BEFORE_EVENT : null,
  } as NewBookingCanonicalPaymentTerms;
}
