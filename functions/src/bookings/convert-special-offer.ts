import {specialOfferTotalIsValid} from "./special-request-policy.js";
import {providerOperationalReason} from "../payments/payment-lifecycle.js";
import {providerPayoutReadinessReason} from "../provider-finance/provider-payment-account-domain.js";
import {requireMaintenanceOpen, recordMaintenanceAdmission} from "../shared/maintenance.js";
import {Timestamp, type DocumentData, type DocumentReference, type Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {AVAILABILITY_COUNTED_REQUEST_STATUSES, manilaDateFromKey, validateProviderAvailability} from "../provider-availability/validate-provider-availability.js";
import {buildProviderRequestFinancialSnapshot, type ProviderRequestFinancialSnapshot} from "../provider-requests/provider-request-financial-snapshot.js";
import {buildPackagePaymentTermsSnapshot} from "../payments/package-payment-terms.js";
import {evaluateSubmissionPaymentEligibility} from "../payments/initial-payment-eligibility.js";
import {calculateInitialPaymentDeadlineV4, INITIAL_PAYMENT_DEADLINE_POLICY_VERSION} from "../payments/initial-payment-deadline.js";
import {initialPaymentEnrollment, readInitialPaymentRollout} from "../payments/initial-payment-rollout.js";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {createNotificationInTransaction} from "../shared/notifications.js";
import {requireNewBookingCanonicalPaymentTerms} from "./canonical-booking-payment-policy.js";
import {loadBookingPaymentPolicySnapshot} from "./load-booking-payment-policy.js";
import {bookingPolicyTimingV3, bookingPolicyV3Evidence} from "./booking-policy-v3.js";
import {buildBookingPaymentAgreement} from "./booking-payment-agreement.js";
import {assertRefundPolicyAcknowledgements, buildProviderRequestRefundPolicyEvidence, parseRefundPolicyAcknowledgements} from "./booking-refund-policy.js";
import {loadSpecialOfferRefundPolicies} from "./special-offer-refund-policy.js";
import {
  buildCancellationPolicySnapshot,
  CANCELLATION_POLICY_SETTINGS_DOC_ID,
  parseStoredAdminCancellationPolicy,
  parseStoredProviderCancellationPolicy,
  resolveEffectiveCancellationPolicy,
} from "../cancellations/cancellation-policy-domain.js";

export async function convertSpecialOfferToBooking(input: {
  tx: Transaction;
  reference: DocumentReference;
  row: DocumentData;
  providerRef: DocumentReference;
  provider: DocumentData;
  holds: Record<string, unknown>;
  eventStart: number;
  now: number;
  policyAcknowledgements?: unknown;
}) {
  const {tx, reference, row, providerRef, provider, holds, eventStart, now} = input;
  const offer = row.priceOffer;
  const date = manilaDateFromKey(row.eventDate);
  const acceptedAt = new Date(now);
  const eventStartAt = new Date(eventStart);
  const timing = bookingPolicyTimingV3(eventStartAt);
  if (!date || !specialOfferTotalIsValid(offer)) {
    throw new HttpsError("failed-precondition", "The offer has an invalid date or price.");
  }
  if (acceptedAt >= timing.hardPaymentDeadlineAt) {
    throw new HttpsError("failed-precondition", "FEASTA closes payment 24 hours before the event. Submit a new request for a later schedule.");
  }

  await requireMaintenanceOpen(tx, db, "intake",
    "Booking creation is temporarily unavailable. Your offer is still subject to its original deadline.");
  const [packageDoc, platformDoc, taxDoc, customerDoc, rollout, ownerDoc, payoutDoc, cancellationPolicyDoc, occupied] = await Promise.all([
    tx.get(db.collection("packages").doc(row.packageId)),
    tx.get(db.doc("appSettings/platform")),
    tx.get(db.collection("providerTaxProfiles").doc(row.providerId)),
    tx.get(db.collection("users").doc(row.customerId)),
    readInitialPaymentRollout(tx),
    tx.get(db.collection("users").doc(provider.ownerId)),
    tx.get(db.collection("providerPaymentAccounts").doc(row.providerId)),
    tx.get(db.collection("appSettings").doc(CANCELLATION_POLICY_SETTINGS_DOC_ID)),
    tx.get(db.collection("providerRequests").where("providerId", "==", row.providerId)
      .where("status", "in", [...AVAILABILITY_COUNTED_REQUEST_STATUSES])
      .where("eventDate", ">=", Timestamp.fromDate(date))
      .where("eventDate", "<", Timestamp.fromMillis(date.getTime() + 86_400_000))),
  ]);
  if (providerOperationalReason(row.providerId, provider, ownerDoc.data() ?? {}) ||
      providerPayoutReadinessReason({payoutSetupRequired: true, providerId: row.providerId,
        account: payoutDoc.data() ?? null})) {
    throw new HttpsError("failed-precondition", "The provider is unavailable for paid bookings.");
  }
  delete holds[reference.id];
  const availability = validateProviderAvailability({
    providerData: {...provider, specialOfferHolds: holds},
    now: acceptedAt,
    request: {providerRequestId: reference.id, type: "catering", eventDate: date,
      eventTime: row.eventTime, eventEndTime: row.eventEndTime, serviceTier: row.serviceTier,
      guestCount: provider.minGuestsPerEvent, services: []},
    existingBookings: occupied.docs.map(doc => ({
      ...doc.data(), providerRequestId: doc.id, status: doc.get("status"),
      eventTime: doc.get("eventTime"), eventEndTime: doc.get("eventEndTime"),
    })),
  });
  if (!availability.available) {
    throw new HttpsError("failed-precondition", availability.issues[0]?.message ?? "The date is unavailable.");
  }
  const packageData = packageDoc.data();
  if (!packageData || packageData.providerId !== row.providerId ||
      packageData.isDeleted === true || packageData.isActive !== true || packageData.isPublished !== true) {
    throw new HttpsError("failed-precondition", "The quoted package is unavailable.");
  }
  const packagePaymentTerms = requireNewBookingCanonicalPaymentTerms(buildPackagePaymentTermsSnapshot(packageData));
  const refundPolicies = await loadSpecialOfferRefundPolicies(tx, {
    providerId: row.providerId, providerName: row.providerName, providerData: provider,
    packageRecord: {packageId: row.packageId, data: packageData},
  });
  assertRefundPolicyAcknowledgements(refundPolicies, parseRefundPolicyAcknowledgements(input.policyAcknowledgements));
  const platformSettings = platformDoc.data() ?? null;
  const bookingPaymentPolicySnapshot = await loadBookingPaymentPolicySnapshot({
    transaction: tx, packageId: row.packageId, packageData, platformSettings,
  });
  const eligibility = evaluateSubmissionPaymentEligibility({
    eventDate: date, eventTime: row.eventTime, submissionTime: acceptedAt,
    packagePaymentTerms, bookingPaymentPolicySnapshot,
  });
  const gross = offer.totalInCentavos;
  const offerPlatformFee =
    typeof offer.platformFeeInCentavos === "number" &&
    Number.isSafeInteger(offer.platformFeeInCentavos) &&
    offer.platformFeeInCentavos >= 0
      ? offer.platformFeeInCentavos
      : null;
  const offerCommissionRateBps =
    typeof offer.platformCommissionRateBps === "number" &&
    Number.isSafeInteger(offer.platformCommissionRateBps) &&
    offer.platformCommissionRateBps > 0
      ? offer.platformCommissionRateBps
      : (typeof (offer.pricing as Record<string, unknown> | undefined)?.platformCommissionRateBps === "number"
          ? ((offer.pricing as Record<string, unknown>).platformCommissionRateBps as number)
          : null);
  const depositRateBps = eligibility.depositEligible ? packagePaymentTerms.depositRateBps : 10_000;
  const upfront = Math.max(1, Number((BigInt(gross) * BigInt(depositRateBps) + 5000n) / 10000n));
  const deadline = Timestamp.fromDate(calculateInitialPaymentDeadlineV4({
    acceptedAt, eventStartAt, hardDeadlines: [timing.hardPaymentDeadlineAt],
  }));
  if (Date.now() >= Math.min(offer.expiresAtMs, deadline.toMillis())) {
    throw new HttpsError("failed-precondition", "The price offer expired. Ask the provider for a new offer.");
  }

  const bookingId = reference.id;
  const providerRequestId = bookingId + "-catering";
  const bookingRef = db.collection("mainEvents").doc(bookingId);
  const providerRequestRef = db.collection("providerRequests").doc(providerRequestId);
  const acceptedTimestamp = Timestamp.fromMillis(now);
  const refundPolicy = refundPolicies.get(row.providerId);
  const refundEvidence = refundPolicy && buildProviderRequestRefundPolicyEvidence(refundPolicy, acceptedTimestamp);
  const customer = customerDoc.data() ?? {};
  const amount = gross / 100;
  const customerPaidFields =
    offerPlatformFee !== null && offerCommissionRateBps !== null
      ? {
          serviceSubtotalInCentavos: offer.subtotalInCentavos as number,
          platformFeeInCentavos: offerPlatformFee,
          platformCommissionRateBps: offerCommissionRateBps,
          platformCommissionModel: "customer_paid_flat_v1" as const,
        }
      : {};
  const payment = {
    amount, downPaymentAmount: upfront / 100, downPaymentPercentage: depositRateBps / 100,
    remainingBalance: (gross - upfront) / 100, paymentStatus: "unpaid",
    ...customerPaidFields,
    packagePaymentTerms, bookingPaymentPolicySnapshot,
    initialPaymentEligibilitySchemaVersion: 2,
    initialPaymentEligibility: {...eligibility, evaluatedAt: acceptedTimestamp,
      submittedAt: acceptedTimestamp, eventStartAt: Timestamp.fromDate(eligibility.eventStartAt)},
    ...bookingPolicyV3Evidence(eventStartAt, Timestamp.fromDate),
  };
  const agreedOffer = {specialRequestId: reference.id, ...offer};
  const agreement = buildBookingPaymentAgreement({
    customerId: row.customerId, providerId: row.providerId, providerName: row.providerName,
    serviceNames: [row.packageName], selection: agreedOffer,
    eventStartAt, eventEndTime: row.eventEndTime ?? "",
    grossAmountInCentavos: gross, requiredUpfrontAmountInCentavos: upfront,
    ...(offerPlatformFee !== null && offerCommissionRateBps !== null
      ? {
          serviceSubtotalInCentavos: offer.subtotalInCentavos as number,
          platformFeeInCentavos: offerPlatformFee,
          platformCommissionRateBps: offerCommissionRateBps,
        }
      : {}),
    depositEligible: eligibility.depositEligible, eligibilityReason: eligibility.reason,
    paymentPolicy: {packagePaymentTerms, bookingPaymentPolicySnapshot},
    refundPolicy: refundEvidence?.refundPolicySnapshot ?? null,
  });
  const quotedPricing = offer.pricing as ProviderRequestFinancialSnapshot | undefined;
  if (quotedPricing && (quotedPricing.schemaVersion !== 1 ||
      quotedPricing.currency !== "PHP" || quotedPricing.grossAmountInCentavos !== gross)) {
    throw new HttpsError("failed-precondition", "The offer pricing does not match its quoted total.");
  }
  const financialSnapshot = quotedPricing ? {
    ...quotedPricing,
    packagePaymentTerms,
    requiredUpfrontAmountInCentavos: upfront,
    remainingBalanceInCentavos: gross - upfront,
    requiredUpfrontRateBps: Math.round(upfront / gross * 10_000),
  } : buildProviderRequestFinancialSnapshot({
    providerId: row.providerId, providerOwnerId: provider.ownerId, providerRequest: payment,
    platformSettings, providerTaxProfile: taxDoc.data() ?? null,
  });
  const adminCancellationPolicy = parseStoredAdminCancellationPolicy(
    cancellationPolicyDoc.exists ? cancellationPolicyDoc.data() : null,
  );
  const cancellationPolicySnapshot = buildCancellationPolicySnapshot({
    effective: resolveEffectiveCancellationPolicy(
      parseStoredProviderCancellationPolicy(provider.cancellationPolicy),
      adminCancellationPolicy,
    ),
    eventStartAt,
    submittedAt: acceptedAt,
    capturedAt: acceptedTimestamp,
  });
  const shared = {
    bookingId, mainEventId: bookingId, customerId: row.customerId, providerId: row.providerId,
    customerFirstName: customer.firstName ?? "", customerLastName: customer.lastName ?? "",
    customerEmail: customer.email ?? "", customerPhoneNumber: customer.phoneNumber ?? "",
    providerBusinessName: row.providerName, packageId: row.packageId, packageName: row.packageName,
    cateringSelectionType: "package", serviceTier: row.serviceTier,
    eventType: packageData.eventType ?? "other", eventDate: Timestamp.fromDate(date),
    eventTime: row.eventTime, eventEndTime: row.eventEndTime, eventAddress: row.address,
    eventLocation: row.address, guestCount: provider.minGuestsPerEvent,
    specialRequest: row.instructions ?? "", acceptedSpecialOffer: agreedOffer,
    bookingPaymentAgreement: {...agreement, agreedAt: acceptedTimestamp},
    cancellationPolicySnapshot,
    ...payment, status: "waiting_for_down_payment", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  recordMaintenanceAdmission(tx, db);
  tx.create(bookingRef, {
    ...shared, bookingCode: bookingId.slice(0, 12).toUpperCase(),
    customerViolationPolicyVersion: 1,
    currentProviderId: row.providerId, originalProviderId: row.providerId,
    providerRequestIds: [providerRequestId], providerRequestCount: 1,
    waitingPaymentProviderRequestCount: 1, pendingProviderRequestCount: 0,
    confirmedProviderRequestCount: 0, rejectedProviderRequestCount: 0, completedProviderRequestCount: 0,
    recoveryStatus: "none", cancellationStatus: "none", refundStatus: "none", refundAmount: 0,
    totalAmount: amount, estimatedEventTotal: amount, cateringSubtotal: amount,
    packagePrice: offer.subtotalInCentavos / 100, submittedAt: acceptedTimestamp,
  });
  tx.create(bookingRef.collection("timeline").doc(), {
    type: "provider_accepted", status: "waiting_for_down_payment",
    title: "Price Offer Accepted", description: "Complete payment before the deadline to confirm your booking.",
    providerRequestId, providerId: row.providerId, createdBy: row.customerId,
    createdByRole: "customer", createdAt: serverTimestamp(),
  });
  tx.create(providerRequestRef, {
    ...shared, providerRequestId, providerOwnerId: provider.ownerId, type: "catering",
    services: [{serviceId: row.packageId, name: row.packageName, category: "catering_package",
      price: amount, downPaymentAmount: payment.downPaymentAmount, downPaymentPercentage: payment.downPaymentPercentage}],
    financialSnapshot, financialSnapshotCapturedAt: acceptedTimestamp,
    ...refundEvidence,
    acceptedAt: acceptedTimestamp, requestedAt: acceptedTimestamp, respondedAt: acceptedTimestamp,
    initialPaymentDeadlinePolicyVersion: INITIAL_PAYMENT_DEADLINE_POLICY_VERSION,
    initialPaymentDeadlineAt: deadline, expiresAt: deadline, confirmedAt: null,
    paymentId: null, paidAt: null, ...initialPaymentEnrollment(rollout),
  });
  tx.update(providerRef, {specialOfferHolds: holds, availabilityReservationUpdatedAt: serverTimestamp()});
  tx.update(reference, {status: "converted_to_booking", bookingId, providerRequestId,
    acceptedPriceOfferVersion: offer.version, priceOfferAcceptedAt: acceptedTimestamp,
    initialPaymentDeadlineAtMs: deadline.toMillis(), requiredPaymentInCentavos: upfront, updatedAt: serverTimestamp()});
  writeAuditLogInTransaction(tx, {actorId: row.customerId, actorRole: "customer",
    action: "special_request.converted_to_booking", targetCollection: "mainEvents", targetId: bookingId,
    after: {status: "waiting_for_down_payment", specialRequestId: reference.id}});
  createNotificationInTransaction(tx, {
    userId: provider.ownerId, title: "Price offer accepted",
    message: "Your quotation has been accepted. The customer is now awaiting payment.",
    type: "special_request", relatedCollection: "specialRequests", relatedId: reference.id,
  });
  return {status: "converted_to_booking", bookingId};
}
