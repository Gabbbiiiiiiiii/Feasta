import {createHash} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore, Transaction} from "firebase-admin/firestore";
import {readTrustedMixedProviderSelections} from "./multi-provider-mixed-transaction-reader.js";
import {prepareMixedProviderFinancials} from "./multi-provider-mixed-financial-preparation.js";
import {prepareMixedProviderRefundPolicies} from "./multi-provider-mixed-refund-preparation.js";
import {prepareMixedProviderBookingAgreements} from "./multi-provider-mixed-agreement-preparation.js";
import {readMultiProviderOccupancy} from "./multi-provider-occupancy-reader.js";
import {prepareMultiProviderAvailability} from "./multi-provider-availability-preparation.js";
import {requireActiveServiceCategoryInTransaction} from "../shared/service-category-policy.js";
import {loadBookingPaymentPolicySnapshot} from "./load-booking-payment-policy.js";
import {evaluateSubmissionPaymentEligibility} from "../payments/initial-payment-eligibility.js";
import type {PreparedMultiProviderEligibilityItem} from "./multi-provider-payment-eligibility.js";
import type {MultiProviderMixedSubmissionEnvelope} from "./multi-provider-submission-contract.js";
import type {MultiProviderRefundRolloutSnapshot} from "./multi-provider-refund-preparation.js";

/** Read-only authority bridge. Every authority and occupancy read uses the submission transaction. */
export async function prepareTrustedMixedProviderSubmission(input: {
  transaction: Transaction; firestore: Firestore; customerId: string; bookingId: string;
  envelope: MultiProviderMixedSubmissionEnvelope; submissionTime: Date;
  loadRefundRollout: (transaction: Transaction) => Promise<MultiProviderRefundRolloutSnapshot>;
  platformCommissionRateBps?: number;
}) {
  const {transaction, firestore, customerId, bookingId, envelope, submissionTime, platformCommissionRateBps} = input;
  const eventDate = new Date(`${envelope.event.eventDate}T00:00:00+08:00`);
  const eventTime = String(envelope.event.eventTime);
  const eventEndTime = String(envelope.event.eventEndTime);
  const guestCount = Number(envelope.event.guestCount);
  if (envelope.schemaVersion !== 2 || !Number.isFinite(eventDate.getTime()) ||
      new Date(`${envelope.event.eventDate}T00:00:00Z`).toISOString().slice(0, 10) !== envelope.event.eventDate ||
      !Number.isFinite(submissionTime.getTime())) {
    throw new HttpsError("invalid-argument", "Mixed submission event is invalid.");
  }
  const rows = await readTrustedMixedProviderSelections({transaction, firestore, envelope});
  const financials = prepareMixedProviderFinancials(rows, {platformCommissionRateBps});
  const cateringEligibility = new Map<string, PreparedMultiProviderEligibilityItem>();
  const items = [];
  for (const [index, row] of rows.entries()) {
    const financial = financials.items[index];
    if (row.kind === "catering_package" && financial.kind === "catering_package") {
      const bookingPaymentPolicySnapshot = await loadBookingPaymentPolicySnapshot({
        transaction, packageId: row.resolved.packageId, packageData: row.packageData,
      });
      const item = {providerId: row.providerId, packageId: row.resolved.packageId,
        grossAmountInCentavos: financial.grossAmountInCentavos, bookingPaymentPolicySnapshot,
        initialPaymentEligibility: evaluateSubmissionPaymentEligibility({eventDate, eventTime, submissionTime,
          packagePaymentTerms: financial.packagePaymentTerms, bookingPaymentPolicySnapshot})};
      cateringEligibility.set(row.providerId, item);
      items.push(item);
    } else if (row.kind === "marketplace_service") {
      const category = await requireActiveServiceCategoryInTransaction(transaction, row.service.category, "addon");
      if (!Array.isArray(row.providerData.serviceCategories) || !row.providerData.serviceCategories.includes(category)) {
        throw new HttpsError("failed-precondition", "Provider does not offer the selected service category.");
      }
      items.push({providerId: row.providerId, packageId: null,
        grossAmountInCentavos: financial.grossAmountInCentavos, bookingPaymentPolicySnapshot: null,
        initialPaymentEligibility: evaluateSubmissionPaymentEligibility({eventDate, eventTime, submissionTime,
          packagePaymentTerms: null, bookingPaymentPolicySnapshot: null})});
    } else {
      throw new HttpsError("failed-precondition", "Mixed financial identity is invalid.");
    }
  }
  const refunds = prepareMixedProviderRefundPolicies({rows, rollout: await input.loadRefundRollout(transaction)});
  const agreements = prepareMixedProviderBookingAgreements({customerId, rows, financials,
    cateringEligibility, refunds, guestCount, eventEndTime, platformCommissionRateBps,
    standaloneEventStart: rows.length === 1 ? items[0].initialPaymentEligibility.eventStartAt : undefined});
  const requests = rows.map(row => {
    const type = row.kind === "catering_package" ? "catering" as const : "addon" as const;
    const services = row.kind === "catering_package"
      ? [{serviceId: row.resolved.packageId, name: row.resolved.packageName,
        category: "catering_package", price: row.resolved.basePrice}]
      : [{serviceId: row.service.serviceId, name: row.service.name,
        category: row.service.category, price: row.service.priceInCentavos / 100}];
    return {providerId: row.providerId, type, services, providerData: row.providerData,
      providerRequestId: createHash("sha256").update(`${bookingId}:${type}:${row.providerId}`).digest("hex").slice(0, 40)};
  });
  const standaloneMarketplace = rows.length === 1;
  const occupancy = await readMultiProviderOccupancy({transaction, firestore, standaloneMarketplace,
    selections: requests.map(request => ({providerId: request.providerId, providerRequestId: request.providerRequestId, eventDate}))});
  const availability = prepareMultiProviderAvailability({now: submissionTime, standaloneMarketplace, candidates: requests.map(request => {
    const existingBookings = occupancy.get(request.providerId);
    if (!existingBookings) throw new HttpsError("failed-precondition", "Provider occupancy evidence is incomplete.");
    return {providerId: request.providerId, providerData: request.providerData,
      request: {providerRequestId: request.providerRequestId, type: request.type, services: request.services,
        eventDate, eventTime, eventEndTime, guestCount}, existingBookings};
  })});
  return {eventDate, eventTime, eventEndTime, guestCount, rows, financials, eligibility: {items},
    refunds, agreements, requests, occupancy, availability};
}
