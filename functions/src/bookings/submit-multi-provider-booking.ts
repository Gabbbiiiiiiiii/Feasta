// Task 3 work in progress. Deliberately NOT exported from src/index.ts:
// release still requires end-to-end downstream callable verification.
import {createHash} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireMaintenanceOpen, recordMaintenanceAdmission} from "../shared/maintenance.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {createNotificationInTransaction} from "../shared/notifications.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {stableOccasionPublicationGeneration, activeOccasionAuthority} from "../packages/occasion-publication-generation.js";
import {occasionDependencyEntryPath} from "../admin/occasion-dependency-registry.js";
import {readInitialPaymentRollout, initialPaymentEnrollment} from "../payments/initial-payment-rollout.js";
import {assertBookingSubmissionAllowed} from "./booking-authorization.js";
import {bookingPolicyV3Evidence, bookingSubmissionDeadlinePassedV3} from "./booking-policy-v3.js";
import {bookingOutcomeId} from "./submission-outcome.js";
import {parseMultiProviderSubmissionEnvelope, MultiProviderContractError} from "./multi-provider-submission-contract.js";
import {prepareTrustedMultiProviderSubmission} from "./multi-provider-authority-bridge.js";
import {coordinateMultiProviderSubmission} from "./multi-provider-transaction-coordinator.js";
import {confirmMultiProviderBookingAgreements} from "./multi-provider-agreement-preparation.js";
import {confirmMultiProviderRefundAcknowledgements} from "./multi-provider-refund-preparation.js";
import {REFUND_POLICY_ROLLOUT_DOCUMENT_ID} from "./booking-refund-policy.js";
import {validateAcceptanceProviderRequest} from "../provider-requests/provider-request-integrity.js";

type Identity = {customerId: string; emailVerified: boolean; phoneNumber: string | undefined};
type Prepared = Awaited<ReturnType<typeof prepareTrustedMultiProviderSubmission>>;

function parse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Submission is required.");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["submission", "policyAcknowledgements", "agreementAcknowledgements"].includes(key))) {
    throw new HttpsError("invalid-argument", "Unsupported submission fields.");
  }
  try {
    return {input, envelope: parseMultiProviderSubmissionEnvelope(input.submission)};
  } catch (error) {
    if (error instanceof MultiProviderContractError) throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
}

// Canonical object ordering makes transport/property ordering irrelevant to retries.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

async function authorizeAndPrepare(
  transaction: Transaction, firestore: Firestore, identity: Identity,
  envelope: ReturnType<typeof parse>["envelope"], bookingId: string, now: Date,
) {
  const [user, customer] = await Promise.all([
    transaction.get(firestore.collection("users").doc(identity.customerId)),
    transaction.get(firestore.collection("customers").doc(identity.customerId)),
  ]);
  if (!user.exists) throw new HttpsError("permission-denied", "Account is unavailable.");
  assertBookingSubmissionAllowed(user.data()!, identity.emailVerified, identity.phoneNumber);
  if (!customer.exists) throw new HttpsError("not-found", "Customer profile was not found.");
  await requireMaintenanceOpen(transaction, firestore, "intake");
  const catalog = await transaction.get(firestore.collection("occasionCatalog").doc("current"));
  const occasion = await transaction.get(firestore.collection("occasions").doc(String(envelope.event.eventType)));
  if (stableOccasionPublicationGeneration(catalog.data()) === null ||
      !activeOccasionAuthority(occasion.data(), String(envelope.event.eventType))) {
    throw new HttpsError("failed-precondition", "This occasion is unavailable for new bookings.");
  }
  const rollout = await readInitialPaymentRollout(transaction);
  const prepared = await prepareTrustedMultiProviderSubmission({
    transaction, firestore, customerId: identity.customerId, bookingId, envelope, submissionTime: now,
    loadRefundRollout: async tx => {
      const snapshot = await tx.get(firestore.collection("appSettings").doc(REFUND_POLICY_ROLLOUT_DOCUMENT_ID));
      return {exists: snapshot.exists, data: snapshot.data()};
    },
    classifyTrustedRequest: row => {
      // Current package/payment authority supports catering packages only.
      // Event services must retain their separate authoritative service contract.
      if (row.providerData.providerServiceType !== "catering") {
        throw new HttpsError("failed-precondition", "This provider's package contract is unavailable.");
      }
      return {type: "catering", services: [{serviceId: row.resolved.packageId,
        name: row.resolved.packageName, category: "catering_package", price: row.resolved.basePrice}]};
    },
  });
  assertDeadline(prepared);
  return {prepared, customer: customer.data()!, user: user.data()!, rollout};
}

function assertDeadline(prepared: Prepared) {
  if (prepared.eligibility.items.some(item => bookingSubmissionDeadlinePassedV3(item.initialPaymentEligibility.eventStartAt, new Date()))) {
    throw new HttpsError("failed-precondition", "The payment deadline has passed.", {reason: "booking_submission_payment_deadline_passed"});
  }
}

/** Offline-testable application boundary; identity is supplied only by the authenticated handler. */
export async function submitAuthorizedMultiProviderBooking(
  firestore: Firestore, identity: Identity, value: unknown, disclosureOnly = false,
) {
  const {input, envelope} = parse(value);
  const now = new Date();
  const customerId = identity.customerId;
  const fingerprint = createHash("sha256").update(stable({customerId, envelope})).digest("hex");
  const bookingId = bookingOutcomeId(customerId, envelope.clientRequestId);
  if (disclosureOnly) {
    return firestore.runTransaction(async transaction => {
      const {prepared} = await authorizeAndPrepare(transaction, firestore, identity, envelope, bookingId, now);
      return {agreements: prepared.agreements.disclosures, refundPolicies: prepared.refunds.disclosures};
    });
  }
  return coordinateMultiProviderSubmission({
    firestore, customerId, clientRequestId: envelope.clientRequestId, submissionFingerprint: fingerprint,
    prepare: async transaction => {
      const {prepared, customer, user, rollout} = await authorizeAndPrepare(transaction, firestore, identity, envelope, bookingId, now);
      const common = {
        bookingId, mainEventId: bookingId, customerId,
        customerFirstName: customer.firstName ?? "", customerLastName: customer.lastName ?? "",
        customerEmail: customer.email ?? "", customerPhoneNumber: user.phoneNumber,
        ...envelope.event, eventDate: Timestamp.fromDate(prepared.eventDate),
        paymentStatus: "unpaid", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      };
      let refundEvidence: ReturnType<typeof confirmMultiProviderRefundAcknowledgements>;
      const requests = prepared.rows.map((row, index) => {
        const financial = prepared.financials.items[index];
        const eligibility = prepared.eligibility.items[index];
        const initial = eligibility.initialPaymentEligibility;
        const agreement = prepared.agreements.agreements[index];
        const gross = financial.grossAmountInCentavos / 100;
        const upfront = agreement.requiredUpfrontAmountInCentavos / 100;
        const selection = envelope.selections[index].configuration;
        const request = prepared.requests[index];
        const data = {
          ...common, providerRequestId: request.providerRequestId, providerId: row.providerId,
          providerBusinessName: row.providerData.businessName, type: request.type,
          assignmentKind: "independent_package", packageRevision: row.resolved.expectedPackageRevision,
          cateringSelectionType: "package", packageId: row.resolved.packageId, packageName: row.resolved.packageName,
          ...row.resolved.offer, packagePaymentTerms: financial.packagePaymentTerms,
          bookingPaymentPolicySnapshot: eligibility.bookingPaymentPolicySnapshot,
          bookingPaymentPolicyCapturedAt: serverTimestamp(), bookingPaymentPolicyCapturedAtStage: "submission",
          ...bookingPolicyV3Evidence(initial.eventStartAt, Timestamp.fromDate),
          lifecycleNextTransitionAt: null, remainingBalanceNextCheckAt: null,
          initialPaymentEligibilitySchemaVersion: 2,
          initialPaymentEligibility: {...initial, evaluatedAt: Timestamp.fromDate(now), submittedAt: Timestamp.fromDate(now),
            eventStartAt: Timestamp.fromDate(initial.eventStartAt)},
          bookingPaymentAgreement: {...agreement, agreedAt: Timestamp.fromDate(now)},
          selectedFoods: selection.selectedFoods ?? [], selectedDecorations: selection.selectedDecorations ?? [],
          selectedFurniture: selection.selectedFurniture ?? [], foodChoiceSelections: row.resolved.foodChoices,
          menuSelections: [], services: [{serviceId: row.resolved.packageId, name: row.resolved.packageName,
            category: "catering_package", price: gross, downPaymentPercentage: financial.packagePaymentTerms.depositRateBps / 100,
            downPaymentAmount: upfront}], amount: gross, downPaymentPercentage: financial.packagePaymentTerms.depositRateBps / 100,
          downPaymentAmount: upfront, remainingBalance: (financial.grossAmountInCentavos - agreement.requiredUpfrontAmountInCentavos) / 100,
          status: "pending", ...initialPaymentEnrollment(rollout),
          rejectionReason: null, cancellationReason: null, requestedAt: serverTimestamp(),
          respondedAt: null, confirmedAt: null, completedAt: null, cancelledAt: null, expiresAt: null, paymentId: null, paidAt: null,
        };
        return {reference: firestore.collection("providerRequests").doc(request.providerRequestId),
          providerId: row.providerId, type: request.type, data};
      });
      const first = requests[0].data;
      const total = prepared.financials.totalGrossAmountInCentavos / 100;
      const upfrontTotal = requests.reduce((sum, request) => sum + request.data.downPaymentAmount, 0);
      const booking = {reference: firestore.collection("mainEvents").doc(bookingId), data: {
        ...first, status: "pending_provider_approval", clientRequestId: envelope.clientRequestId, submissionFingerprint: fingerprint,
        bookingCode: `BK-${bookingId.slice(0, 10).toUpperCase()}`, currentProviderId: first.providerId, originalProviderId: first.providerId,
        // Singular package fields remain a display projection of the first
        // assignment; all financial linkage uses packageAssignments instead.
        packagePrice: first.amount, cateringSubtotal: total, amount: total, totalAmount: total, estimatedEventTotal: total,
        downPaymentAmount: upfrontTotal, remainingBalance: Math.round((total - upfrontTotal) * 100) / 100,
        downPaymentPercentage: total === 0 ? 0 : Math.round(upfrontTotal / total * 10000) / 100,
        cateringAddOnsTotal: 0, marketplaceAddOnsTotal: 0, addOnsTotal: 0, selectedAddOns: [],
        willArrangeOwnAddOns: false, customerArrangedAddOnsNote: "", outsidePlatformServicesMonitored: false,
        recoveryStatus: "none", cancellationStatus: "none", refundStatus: "none", refundAmount: 0,
        packageAssignmentVersion: 1,
        packageAssignments: requests.map(({data}) => Object.fromEntries([
          "providerRequestId", "providerId", "packageId", "packageName", "packageRevision", "services",
          "amount", "downPaymentAmount", "remainingBalance", "downPaymentPercentage", "packagePaymentTerms",
        ].map(field => [field, (data as Record<string, unknown>)[field]]))),
        providerRequestIds: requests.map(item => item.reference.id), providerRequestCount: requests.length,
        pendingProviderRequestCount: requests.length, confirmedProviderRequestCount: 0, rejectedProviderRequestCount: 0,
        completedProviderRequestCount: 0, rejectedByProviderIds: [], submittedAt: serverTimestamp(),
      }};
      // Exercise the real acceptance snapshot validator before any booking writes.
      for (const [index, request] of requests.entries()) {
        try {
          validateAcceptanceProviderRequest({
          authorized: {
            providerRequestId: request.reference.id, mainEventId: bookingId,
            customerId, providerId: request.providerId,
            providerOwnerId: prepared.rows[index].providerOwnerId,
            type: request.type, status: "pending", requestData: request.data,
            providerData: prepared.rows[index].providerData,
          },
            mainEventData: booking.data, now,
          });
        } catch (error) {
          if (!(error instanceof HttpsError)) throw error;
          throw new HttpsError(error.code, error.message, {
            reason: "MULTI_PROVIDER_ASSIGNMENT_CONTRACT_INVALID", providerId: request.providerId,
          });
        }
      }
      return {
        plan: {customerId, clientRequestId: envelope.clientRequestId, submissionFingerprint: fingerprint, booking, requests},
        validateRefundAcknowledgements: () => {
          refundEvidence = confirmMultiProviderRefundAcknowledgements(prepared.refunds, input.policyAcknowledgements, serverTimestamp());
          for (const request of requests) Object.assign(request.data, refundEvidence.get(request.providerId) ?? {});
        },
        validatePaymentAgreements: () => {
          confirmMultiProviderBookingAgreements(prepared.agreements, input.agreementAcknowledgements);
          assertDeadline(prepared);
          // All authority reads and acknowledgement checks are complete before side effects.
          recordMaintenanceAdmission(transaction, firestore);
          const entry = {schemaVersion: 1 as const, kind: "submitted_booking" as const,
            occasionId: String(envelope.event.eventType), sourceId: bookingId, sourcePath: booking.reference.path};
          transaction.create(firestore.doc(occasionDependencyEntryPath(entry)), entry);
          transaction.create(booking.reference.collection("timeline").doc(), {
            status: "pending_provider_approval", title: "Booking Request Submitted",
            description: "Customer submitted booking requests to the selected providers.",
            createdBy: customerId, createdByRole: "customer", createdAt: serverTimestamp(),
          });
          for (const [index, row] of prepared.rows.entries()) createNotificationInTransaction(transaction, {
            userId: row.providerOwnerId, title: "New Booking Request", message: "A customer sent a booking request.",
            type: "booking", relatedId: requests[index].reference.id, relatedCollection: "providerRequests",
          });
          writeAuditLogInTransaction(transaction, {actorId: customerId, actorRole: "customer", action: "booking.submitted",
            targetCollection: "mainEvents", targetId: bookingId, after: {status: "pending_provider_approval", providerRequestCount: requests.length},
            metadata: {providerRequestIds: requests.map(item => item.reference.id)}});
        },
      };
    },
  });
}

async function handle(request: CallableRequest, disclosureOnly: boolean) {
  const actor = requireAuth(request);
  await requireRole(actor.uid, ["customer"]);
  await enforceCallableRateLimit(request, {scope: disclosureOnly ? "bookings.multiProviderDisclosure" : "bookings.submit",
    limit: disclosureOnly ? 30 : 8, windowSeconds: 600});
  const authUser = await getAuth().getUser(actor.uid);
  if (authUser.disabled) throw new HttpsError("permission-denied", "Account is unavailable.");
  return submitAuthorizedMultiProviderBooking(db, {customerId: actor.uid,
    emailVerified: request.auth?.token.email_verified === true, phoneNumber: authUser.phoneNumber}, request.data, disclosureOnly);
}

export const submitMultiProviderBookingRequest = onCall(
  {...appCheckCallableOptions, maxInstances: 20, memory: "256MiB", concurrency: 80, timeoutSeconds: 30},
  request => handle(request, false),
);
export const getMultiProviderBookingDisclosures = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 30}, request => handle(request, true),
);
