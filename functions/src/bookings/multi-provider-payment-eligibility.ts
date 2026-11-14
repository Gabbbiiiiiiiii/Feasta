import {HttpsError} from "firebase-functions/v2/https";
import type {Transaction} from "firebase-admin/firestore";

import {
  loadBookingPaymentPolicySnapshot,
} from "./load-booking-payment-policy.js";

import {
  evaluateSubmissionPaymentEligibility,
} from "../payments/initial-payment-eligibility.js";

import type {
  InitialPaymentEligibility,
} from "../payments/initial-payment-eligibility.js";

import type {
  BookingPaymentPolicySnapshot,
} from "./booking-payment-eligibility-policy.js";

import type {
  FinancialPreparationEntry,
  PreparedMultiProviderFinancials,
} from "./multi-provider-financial-preparation.js";

export type PreparedMultiProviderEligibilityItem = {
  providerId: string;
  packageId: string;
  grossAmountInCentavos: number;
  bookingPaymentPolicySnapshot: BookingPaymentPolicySnapshot;
  initialPaymentEligibility: InitialPaymentEligibility<Date>;
};

export type PreparedMultiProviderEligibility = {
  items: PreparedMultiProviderEligibilityItem[];
};

type Input = {
  transaction: Transaction;
  entries: readonly FinancialPreparationEntry[];
  financials: PreparedMultiProviderFinancials;
  eventDate: Date;
  eventTime: string;
  submissionTime: Date;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

/**
 * Read-only payment eligibility for an already trusted package selection.
 *
 * - Requires independently prepared canonical package terms.
 * - Loads the current category/package payment-policy authority.
 * - Uses the same captured server time for every provider.
 * - Never trusts customer payment amounts or deposit eligibility.
 *
 * This is not a booking write authorization, payment obligation,
 * refund acknowledgement, or agreement disclosure.
 */
export async function prepareMultiProviderPaymentEligibility(
  input: Input,
): Promise<PreparedMultiProviderEligibility> {
  const {
    transaction,
    entries,
    financials,
    eventDate,
    eventTime,
    submissionTime,
  } = input;

  if (
    !Array.isArray(entries) ||
    entries.length < 2 ||
    entries.length > 4 ||
    !financials ||
    !Array.isArray(financials.items) ||
    financials.items.length !== entries.length ||
    !(eventDate instanceof Date) ||
    !Number.isFinite(eventDate.getTime()) ||
    !(submissionTime instanceof Date) ||
    !Number.isFinite(submissionTime.getTime()) ||
    typeof eventTime !== "string" ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(eventTime)
  ) {
    return reject("Multi-provider payment eligibility input is invalid.");
  }

  const seen = new Set<string>();
  const items: PreparedMultiProviderEligibilityItem[] = [];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const financial = financials.items[index];

    if (
      !entry ||
      !financial ||
      typeof entry.providerId !== "string" ||
      typeof entry.packageId !== "string" ||
      seen.has(entry.providerId) ||
      financial.providerId !== entry.providerId ||
      financial.packageId !== entry.packageId ||
      entry.resolved.providerId !== entry.providerId ||
      entry.resolved.packageId !== entry.packageId ||
      entry.packageData.providerId !== entry.providerId ||
      !Number.isSafeInteger(financial.grossAmountInCentavos) ||
      financial.grossAmountInCentavos <= 0
    ) {
      return reject("Multi-provider payment eligibility identity is invalid.");
    }

    seen.add(entry.providerId);

    const bookingPaymentPolicySnapshot =
      await loadBookingPaymentPolicySnapshot({
        transaction,
        packageId: entry.packageId,
        packageData: entry.packageData,
      });

    const initialPaymentEligibility =
      evaluateSubmissionPaymentEligibility({
        eventDate,
        eventTime,
        submissionTime,
        packagePaymentTerms: financial.packagePaymentTerms,
        bookingPaymentPolicySnapshot,
      });

    items.push({
      providerId: entry.providerId,
      packageId: entry.packageId,
      grossAmountInCentavos: financial.grossAmountInCentavos,
      bookingPaymentPolicySnapshot,
      initialPaymentEligibility,
    });
  }

  return {items};
}