import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {canonicalPaymentLinkageReason, canonicalRequestLinkageReason,
  paymentIdForProviderRequest} from "../payments/payment-lifecycle.js";
import {requireSafeDocumentId} from
  "../refund-policies/refund-policy-domain.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {PAYMENT_CURRENCY, USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireObject, requireString} from "../shared/validation.js";
import {parseProviderRequestCancellationStatus} from
  "../cancellations/refund-cancellation-domain.js";

export const inspectProviderRequestRefundReconciliation = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    await enforceCallableRateLimit(request, {
      scope: "refunds.reconciliation.inspect",
      limit: 60,
      windowSeconds: 60 * 60,
    });
    const cancellationRequestId = cancellationIdInput(request.data);
    const cancellationReference = db.collection(
      "providerRequestCancellationRequests",
    ).doc(cancellationRequestId);
    const cancellationSnapshot = await cancellationReference.get();
    if (!cancellationSnapshot.exists) throw notFound();
    const cancellation = cancellationSnapshot.data() ?? {};
    const providerRequestId = storedId(
      cancellation.providerRequestId,
      "Provider request",
    );
    const mainEventId = storedId(cancellation.mainEventId, "Main event");
    const customerId = storedId(cancellation.customerId, "Customer");
    const providerId = storedId(cancellation.providerId, "Provider");
    const paymentId = paymentIdForProviderRequest(providerRequestId);
    const paymentReference = db.collection("payments").doc(paymentId);
    const operationId = nullableStoredId(cancellation.refundOperationId);
    const [requestSnapshot, mainEventSnapshot, paymentSnapshot,
      operationSnapshot] = await Promise.all([
      db.collection("providerRequests").doc(providerRequestId).get(),
      db.collection("mainEvents").doc(mainEventId).get(),
      paymentReference.get(),
      operationId
        ? paymentReference.collection("refunds").doc(operationId).get()
        : Promise.resolve(null),
    ]);
    if (!requestSnapshot.exists || !mainEventSnapshot.exists) throw invalid();
    const providerRequest = requestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};
    const payment = paymentSnapshot.exists ? paymentSnapshot.data() ?? {} : null;
    if (canonicalRequestLinkageReason({
      providerRequestId,
      mainEventId,
      customerId,
      providerId,
      providerRequest,
      mainEvent,
    }) || payment && canonicalPaymentLinkageReason({
      paymentId,
      providerRequestId,
      mainEventId,
      customerId,
      providerId,
      payment,
      providerRequest,
      mainEvent,
    })) throw invalid();
    if (operationId && (!operationSnapshot?.exists ||
      operationSnapshot.data()?.cancellationRequestId !== cancellationRequestId ||
      operationSnapshot.data()?.providerRequestId !== providerRequestId)) {
      throw invalid();
    }
    const operation = operationSnapshot?.data() ?? null;
    const operationStatus = operationStatusValue(operation?.status);
    const cancellationStatus = parseProviderRequestCancellationStatus(
      cancellation.status,
    );
    const failureCode = boundedFailureCode(operation?.failureCode);
    const gatewayStatus = gatewayStatusValue(operation?.gatewayStatus);
    return {
      cancellationRequestId,
      providerRequestId,
      paymentId: payment ? paymentId : null,
      refundOperationId: operationId,
      cancellationStatus,
      operationStatus,
      refundAmountInCentavos: optionalCentavos(operation?.amountInCentavos),
      currency: operation ? PAYMENT_CURRENCY : null,
      gatewayStatus,
      failureCode,
      reconciliationRequired:
        cancellationStatus === "refund_failed" ||
        operationStatus === "processing" &&
          operation?.gatewayFailureCertainty === "ambiguous" ||
        failureCode === "GATEWAY_MINIMUM_UNSUPPORTED" ||
        failureCode === "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED",
      updatedAt: timestampIso(cancellation.updatedAt),
    };
  },
);

function cancellationIdInput(value: unknown): string {
  const input = requireObject(value);
  if (Object.keys(input).length !== 1 ||
    !Object.hasOwn(input, "cancellationRequestId")) {
    throw new HttpsError("invalid-argument", "Inspection input is invalid.");
  }
  return requireSafeDocumentId(requireString(
    input.cancellationRequestId,
    "cancellationRequestId",
    {minLength: 8, maxLength: 160},
  ), "Cancellation request");
}

function operationStatusValue(value: unknown) {
  return value === "reserved" || value === "processing" ||
    value === "completed" || value === "failed" || value === "released"
    ? value
    : value === undefined || value === null ? null : invalidNever();
}

function gatewayStatusValue(value: unknown) {
  return value === "pending" || value === "processing" ||
    value === "succeeded" || value === "failed"
    ? value
    : value === undefined || value === null ? null : invalidNever();
}

function optionalCentavos(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw invalid();
  return value as number;
}

function boundedFailureCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 80 ||
    !/^[A-Z0-9_:-]+$/u.test(value)) throw invalid();
  return value;
}

function timestampIso(value: unknown): string {
  if (!(value instanceof Timestamp)) throw invalid();
  return value.toDate().toISOString();
}

function nullableStoredId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return storedId(value, "Refund operation");
}

function storedId(value: unknown, label: string): string {
  try {
    return requireSafeDocumentId(value, label);
  } catch {
    throw invalid();
  }
}

function invalidNever(): never {
  throw invalid();
}

function notFound(): HttpsError {
  return new HttpsError("not-found", "Cancellation request was not found.");
}

function invalid(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "Refund reconciliation evidence is invalid.",
    {reason: "REFUND_RECONCILIATION_REQUIRED"},
  );
}
