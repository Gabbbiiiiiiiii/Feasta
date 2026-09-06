import {
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import {
  PROVIDER_REQUEST_CANCELLATION_STATUSES,
  REFUND_ELIGIBILITY_STAGES,
  type ParticipantRefundProgressStatus,
  type ProviderRequestCancellationStatus,
  type RefundEligibilityStage,
} from "@feasta/shared-types";

import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import type {
  AdminCancellationCalculationStatus,
  AdminCancellationQueue,
  AdminCancellationQueueItem,
} from "./admin-cancellation-types";

const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const QUEUE_LIMIT = 50;
const ACTIVE_DECISION_STATUSES = new Set(["submitted", "under_review"]);

export async function getAdminCancellationQueue(): Promise<AdminCancellationQueue> {
  await requireAdmin();

  const cancellationSnapshot = await adminDb
    .collection("providerRequestCancellationRequests")
    .orderBy("updatedAt", "desc")
    .limit(QUEUE_LIMIT)
    .get();
  const records = cancellationSnapshot.docs.map((document) => ({
    document,
    data: document.data(),
    providerRequestId: safeId(document.data().providerRequestId),
    mainEventId: safeId(document.data().mainEventId),
    providerId: safeId(document.data().providerId),
    customerId: safeId(document.data().customerId),
  }));

  const [requests, events, providers, customers] = await Promise.all([
    loadByIds("providerRequests", records.map((record) => record.providerRequestId)),
    loadByIds("mainEvents", records.map((record) => record.mainEventId)),
    loadByIds("providers", records.map((record) => record.providerId)),
    loadByIds("users", records.map((record) => record.customerId)),
  ]);
  const payments = await loadPayments(records.map((record) => record.providerRequestId));
  const operations = await Promise.all(records.map((record) => loadOperation(
    record.document.id,
    record.providerRequestId,
    record.data,
    record.providerRequestId ? payments.get(record.providerRequestId) : undefined,
  )));

  const items: AdminCancellationQueueItem[] = [];
  let skippedMalformedCount = 0;

  for (const [index, record] of records.entries()) {
    const request = record.providerRequestId
      ? requests.get(record.providerRequestId)?.data() ?? null
      : null;
    const event = record.mainEventId
      ? events.get(record.mainEventId)?.data() ?? null
      : null;
    const provider = record.providerId
      ? providers.get(record.providerId)?.data() ?? null
      : null;
    const customer = record.customerId
      ? customers.get(record.customerId)?.data() ?? null
      : null;
    const paymentSnapshot = record.providerRequestId
      ? payments.get(record.providerRequestId)
      : undefined;
    const payment = paymentSnapshot?.data() ?? null;
    const item = mapCancellation({
      id: record.document.id,
      cancellation: record.data,
      request,
      event,
      provider,
      customer,
      payment,
      operation: operations[index] ?? null,
      expected: record,
    });

    if (item) items.push(item);
    else skippedMalformedCount += 1;
  }

  return {items, skippedMalformedCount};
}

async function loadByIds(
  collection: string,
  values: readonly (string | null)[],
): Promise<Map<string, DocumentSnapshot<DocumentData>>> {
  const ids = [...new Set(values.filter((value): value is string => value !== null))];
  if (ids.length === 0) return new Map();
  const snapshots = await adminDb.getAll(
    ...ids.map((id) => adminDb.collection(collection).doc(id)),
  );
  return new Map(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot]));
}

async function loadPayments(
  providerRequestIds: readonly (string | null)[],
): Promise<Map<string, DocumentSnapshot<DocumentData>>> {
  const ids = [...new Set(providerRequestIds.filter((value): value is string => value !== null))];
  const result = new Map<string, DocumentSnapshot<DocumentData>>();
  const ambiguous = new Set<string>();

  for (let index = 0; index < ids.length; index += 30) {
    const chunk = ids.slice(index, index + 30);
    if (chunk.length === 0) continue;
    const snapshot = await adminDb.collection("payments")
      .where("providerRequestId", "in", chunk).get();
    for (const document of snapshot.docs) {
      const providerRequestId = safeId(document.data().providerRequestId);
      if (!providerRequestId || ambiguous.has(providerRequestId)) continue;
      if (result.has(providerRequestId)) {
        result.delete(providerRequestId);
        ambiguous.add(providerRequestId);
      } else {
        result.set(providerRequestId, document);
      }
    }
  }
  return result;
}

async function loadOperation(
  cancellationRequestId: string,
  providerRequestId: string | null,
  cancellation: DocumentData,
  payment: DocumentSnapshot<DocumentData> | undefined,
): Promise<DocumentData | null> {
  const operationId = safeId(cancellation.refundOperationId);
  if (!operationId || !payment) return null;
  const snapshot = await payment.ref.collection("refunds").doc(operationId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  return data.cancellationRequestId === cancellationRequestId &&
    data.providerRequestId === providerRequestId
    ? data
    : null;
}

function mapCancellation(input: {
  id: string;
  cancellation: DocumentData;
  request: DocumentData | null;
  event: DocumentData | null;
  provider: DocumentData | null;
  customer: DocumentData | null;
  payment: DocumentData | null;
  operation: DocumentData | null;
  expected: {
    providerRequestId: string | null;
    mainEventId: string | null;
    providerId: string | null;
    customerId: string | null;
  };
}): AdminCancellationQueueItem | null {
  const {cancellation, request, event, provider, customer, expected} = input;
  const status = cancellationStatus(cancellation.status);
  const evidence = cancellation.policyEvidenceStatus;
  if (!SAFE_ID.test(input.id) || !status || !request || !event || !provider || !customer ||
    !expected.providerRequestId || !expected.mainEventId || !expected.providerId || !expected.customerId ||
    request.providerId !== expected.providerId || request.customerId !== expected.customerId ||
    request.mainEventId !== expected.mainEventId || event.customerId !== expected.customerId ||
    (evidence !== "policy_backed" && evidence !== "legacy")) return null;

  const payment = input.payment &&
    input.payment.providerRequestId === expected.providerRequestId &&
    input.payment.providerId === expected.providerId &&
    input.payment.customerId === expected.customerId &&
    (input.payment.mainEventId ?? input.payment.bookingId) === expected.mainEventId
    ? input.payment
    : null;
  const operation = payment ? input.operation : null;
  const frozenStage = evidence === "policy_backed"
    ? stageValue(recordValue(cancellation.frozenEligibility)?.stage)
    : null;
  if (evidence === "policy_backed" && !frozenStage) return null;
  const calculation = recordValue(cancellation.refundCalculation);
  const calculationStatus = calculationPresentation(evidence, calculation);
  const amount = optionalCentavos(
    calculation?.eligibleRefundAmountInCentavos ?? operation?.amountInCentavos,
  );
  const originalPaid = optionalCentavos(payment?.amountInCentavos);
  const operationStatus = operationStatusValue(operation?.status);
  const reconciliationRequired = status === "refund_failed" && (
    operation?.gatewayFailureCertainty === "ambiguous" ||
    operation?.failureCode === "GATEWAY_MINIMUM_UNSUPPORTED" ||
    operation?.failureCode === "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED"
  );
  const refundProgress = refundProgressValue({
    status,
    amount,
    originalPaid,
    operationStatus,
    reconciliationRequired,
  });
  const decision = recordValue(cancellation.decision);
  const canDecide = ACTIVE_DECISION_STATUSES.has(status);

  return {
    cancellationRequestId: input.id,
    providerRequestId: expected.providerRequestId,
    bookingCode: boundedText(event.bookingCode ?? event.referenceCode, 80) ?? expected.mainEventId,
    providerName: boundedText(provider.businessName ?? request.providerName, 160) ?? "Unknown Provider",
    customerName: personName(customer),
    customerEmail: boundedText(customer.email, 254),
    providerRequestStatus: boundedText(request.status, 80) ?? "unknown",
    cancellationStatus: status,
    policyEvidenceStatus: evidence,
    frozenStage,
    customerReason: boundedText(cancellation.reason, 1_000) ?? "No reason supplied.",
    decisionReason: boundedText(decision?.reason, 500),
    calculationStatus,
    refundAmountInCentavos: amount,
    completedRefundAmountInCentavos: status === "refund_completed" ? amount : null,
    currency: amount === null ? null : "PHP",
    paymentStatus: boundedText(payment?.status, 80),
    operationStatus,
    refundProgress,
    reconciliationRequired,
    canApprove: canDecide && evidence === "policy_backed",
    canReject: canDecide,
    canProcessRefund: status === "approved" && operationStatus === "reserved",
    canRetryRefund: status === "refund_failed" && operationStatus === "failed" && !reconciliationRequired,
    submittedAt: timestampIso(cancellation.submittedAt) ?? timestampIso(cancellation.updatedAt) ?? "",
    updatedAt: timestampIso(cancellation.updatedAt) ?? "",
  };
}

function calculationPresentation(
  evidence: "policy_backed" | "legacy",
  calculation: Record<string, unknown> | null,
): AdminCancellationCalculationStatus {
  if (evidence === "legacy") return "manual_review_required";
  if (calculation?.calculationStatus === "calculated") return "calculated";
  if (calculation?.calculationStatus === "nothing_refundable") return "nothing_refundable";
  return "pending_backend_calculation";
}

function refundProgressValue(input: {
  status: ProviderRequestCancellationStatus;
  amount: number | null;
  originalPaid: number | null;
  operationStatus: AdminCancellationQueueItem["operationStatus"];
  reconciliationRequired: boolean;
}): ParticipantRefundProgressStatus {
  if (input.status === "refund_completed" && input.amount !== null) {
    return input.originalPaid !== null && input.amount === input.originalPaid
      ? "full_completed"
      : "partial_completed";
  }
  if (input.status === "refund_processing") return "processing";
  if (input.status === "refund_failed") {
    return input.reconciliationRequired
      ? "failed_reconciliation_required"
      : "failed_retry_pending";
  }
  if (input.status === "approved") return "approved";
  if (input.status === "under_review" || input.status === "awaiting_payment_resolution") {
    return "manual_review";
  }
  return "none";
}

function cancellationStatus(value: unknown): ProviderRequestCancellationStatus | null {
  return typeof value === "string" &&
    (PROVIDER_REQUEST_CANCELLATION_STATUSES as readonly string[]).includes(value)
    ? value as ProviderRequestCancellationStatus
    : null;
}

function stageValue(value: unknown): RefundEligibilityStage | null {
  return typeof value === "string" &&
    (REFUND_ELIGIBILITY_STAGES as readonly string[]).includes(value)
    ? value as RefundEligibilityStage
    : null;
}

function operationStatusValue(value: unknown): AdminCancellationQueueItem["operationStatus"] {
  return value === "reserved" || value === "processing" || value === "completed" ||
    value === "failed" || value === "released" ? value : null;
}

function optionalCentavos(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function timestampIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function safeId(value: unknown): string | null {
  return typeof value === "string" && SAFE_ID.test(value.trim()) ? value.trim() : null;
}

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized ? normalized.slice(0, maximum) : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function personName(data: DocumentData): string {
  const parts = [boundedText(data.firstName, 80), boundedText(data.lastName, 80)]
    .filter((value): value is string => value !== null)
    .join(" ");
  return boundedText(data.fullName, 160) ?? (parts || "Unknown Customer");
}
import "server-only";
