import {createHash} from "node:crypto";

// PayMongo retains creation idempotency keys for 24h. Reserve a one-hour
// margin, matching the existing refund execution policy. Never renew this
// window on retry. https://docs.paymongo.com/reference/idempotent-requests
export const PAYMONGO_IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
export const PAYMONGO_SAFE_RETRY_WINDOW_MS =
  PAYMONGO_IDEMPOTENCY_RETENTION_MS - 60 * 60 * 1000;

export type AttemptResolution =
  "success" | "failed" | "expired" | "outstanding" | "unresolved";
export type LogicalPaymentResolution = "success" | "definitely_unpaid" | "unresolved";

export function checkoutAttemptKey(paymentId: string, attemptId: string): string {
  return "checkout_" + createHash("sha256")
    .update(JSON.stringify([paymentId, attemptId])).digest("hex");
}

export function canRetryCheckout(firstDispatchMs: number, nowMs: number): boolean {
  return Number.isFinite(firstDispatchMs) && Number.isFinite(nowMs) &&
    nowMs >= firstDispatchMs && nowMs - firstDispatchMs < PAYMONGO_SAFE_RETRY_WINDOW_MS;
}

/** Validates a durable, server-owned settlement attestation, not a gateway status.
 * No current PayMongo adapter can issue this proof. A future trusted issuer must
 * verify irreversible unsuccessful settlement and exhaustive resource coverage
 * before storing it, retaining its authoritative source at evidenceReference.
 * Neither webhook observations nor elapsed time may create this attestation.
 */
export function isAuthoritativelyTerminalUnsuccessful(
  attempt: Readonly<Record<string, unknown>>,
): boolean {
  if (attempt.resolution !== "failed" && attempt.resolution !== "expired") return false;
  const value = attempt.terminalEvidence;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proof = value as Record<string, unknown>;
  return proof.schemaVersion === 1 && proof.authority === "paymongo" &&
    proof.outcome === "terminal_unsuccessful" && proof.irreversible === true &&
    proof.exhaustive === true && nonEmptyEvidenceId(proof.evidenceReference) &&
    nonEmptyEvidenceId(attempt.paymentId) && proof.paymentId === attempt.paymentId &&
    nonEmptyEvidenceId(attempt.attemptId) && proof.attemptId === attempt.attemptId &&
    typeof attempt.paymongoCheckoutId === "string" &&
    /^cs_[A-Za-z0-9_]+$/u.test(attempt.paymongoCheckoutId) &&
    proof.checkoutId === attempt.paymongoCheckoutId &&
    sameResourceSet(proof.paymentIntentIds, attempt.paymongoPaymentIntentIds, "pi_") &&
    sameResourceSet(proof.paymentIds, attempt.paymongoPaymentIds, "pay_");
}

function nonEmptyEvidenceId(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value &&
    value.length > 0 && value.length <= 256;
}

function sameResourceSet(left: unknown, right: unknown, prefix: string): boolean {
  const valid = (value: unknown): value is string[] => Array.isArray(value) &&
    value.every((id) => nonEmptyEvidenceId(id) && id.startsWith(prefix) &&
      /^[A-Za-z0-9_]+$/u.test(id)) && new Set(value).size === value.length;
  return valid(left) && valid(right) && left.length === right.length &&
    left.every((id) => right.includes(id));
}

/** A success proves money moved, not that capacity can be released or restored. */
export function resolveLogicalPayment(
  attempts: readonly AttemptResolution[],
  historyComplete: boolean,
): LogicalPaymentResolution {
  if (attempts.includes("success")) return "success";
  if (!historyComplete || attempts.length === 0 ||
    attempts.some((value) => value !== "failed" && value !== "expired")) return "unresolved";
  return "definitely_unpaid";
}

export function aggregateRequiredPayments(
  payments: readonly {required: boolean; resolution: LogicalPaymentResolution}[],
): "fully_paid" | "partially_paid" | "unpaid" | "unresolved" {
  const required = payments.filter((payment) => payment.required);
  if (required.some((payment) => payment.resolution === "unresolved")) return "unresolved";
  const paid = required.filter((payment) => payment.resolution === "success").length;
  if (paid === required.length) return "fully_paid";
  return paid > 0 ? "partially_paid" : "unpaid";
}

/** Only payment.paid_at, never creation/update/metadata/receipt time. */
export function gatewayPaidAtMillis(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 &&
    value <= 253402300799 ? value * 1000 : null;
}
