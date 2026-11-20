import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {scheduleCompletedProviderRequestDisbursementInTransaction,
  providerDisbursementIdForProviderRequest} from "./provider-disbursement-management.js";
/** Observe the committed, trusted refund accounting finalization. Never derive
 * 70/20/10 here, and never enroll requests without frozen payout policy v1. */
export const scheduleProviderDefaultCompensation = onDocumentUpdated({
  document: "providerRequests/{providerRequestId}", region: "asia-southeast1",
}, async event => {
  const after = event.data?.after.data();
  if (after?.paymentDefaultAccountingSchemaVersion !== 1 ||
      after.financialSnapshot?.providerDisbursementPolicyVersion !== 1) return;
  const id = event.params.providerRequestId;
  await db.runTransaction(async transaction => {
    const requestRef = db.collection("providerRequests").doc(id);
    const requestSnapshot = await transaction.get(requestRef);
    const request = requestSnapshot.data();
    if (!request || request.status !== "cancelled" ||
        request.cancellationReason !== "remaining_balance_unpaid_at_deadline" ||
        request.paymentDefaultAccountingSchemaVersion !== 1 ||
        request.financialSnapshot?.providerDisbursementPolicyVersion !== 1) return;
    const anchor = request.paymentDefaultAccountingFinalizedAt?.toDate?.();
    if (!(anchor instanceof Date) || !Number.isFinite(anchor.getTime())) throw new Error("Invalid compensation authority timestamp.");
    const disbursementRef = db.collection("providerDisbursements").doc(providerDisbursementIdForProviderRequest(id));
    if (typeof request.initialPaymentId !== "string") throw new Error("Compensation payment missing.");
    const [existing, settings, paymentSnapshot, earningSnapshot] = await Promise.all([
      transaction.get(disbursementRef), transaction.get(db.collection("appSettings").doc("platform")),
      transaction.get(db.collection("payments").doc(request.initialPaymentId)),
      transaction.get(db.collection("providerEarnings").doc(request.initialPaymentId)),
    ]);
    if (existing.exists) return;
    const payment = paymentSnapshot.data(); const earning = earningSnapshot.data();
    if (!payment || !earning || payment.paymentDefaultAccountingSchemaVersion !== 1 ||
        payment.providerRequestId !== id || payment.providerId !== request.providerId ||
        payment.customerId !== request.customerId || payment.mainEventId !== request.mainEventId ||
        earning.providerRequestId !== id || earning.providerId !== request.providerId ||
        earning.economicSource !== "payment_default_reservation_compensation" ||
        payment.paymentDefaultAccountingFinalizedAt?.toMillis() !== anchor.getTime() ||
        earning.netEarningAmountInCentavos !== request.providerReservationCompEarnedInCentavos ||
        !Number.isSafeInteger(earning.netEarningAmountInCentavos)) throw new Error("Compensation authority incomplete.");
    scheduleCompletedProviderRequestDisbursementInTransaction({transaction, providerRequestId: id,
      providerRequest: request, mainEventId: String(request.mainEventId), providerId: String(request.providerId),
      customerId: String(request.customerId), completedAt: anchor,
      platformSettings: settings.data() ?? {}, timestamp: serverTimestamp(),
      trigger: "payment_default_compensation", sourcePaymentIds: [request.initialPaymentId]});
  });
});
