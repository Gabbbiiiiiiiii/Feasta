import {randomUUID} from "node:crypto";

import type {CallableRequest} from "firebase-functions/v2/https";

import {logInfo, logWarning} from "./logger.js";

export type SecurityEventAction =
  | "account_access_denied"
  | "account_security_state_changed"
  | "app_check_rejected"
  | "booking_submission"
  | "configuration_failure"
  | "idempotency_replay"
  | "payment_webhook"
  | "phone_verification_synchronized"
  | "provider_verification_decision"
  | "provider_verification_submission"
  | "rate_limit_rejected"
  | "role_access_denied";

export interface SecurityEventInput {
  action: SecurityEventAction;
  outcome: "allowed" | "denied" | "failed" | "replayed" | "succeeded";
  actorUid?: string;
  targetId?: string;
  correlationId?: string;
  reasonCode?: string;
  metadata?: Record<string, unknown>;
}

export function logSecurityEvent(input: SecurityEventInput): void {
  const context = {
    eventType: "security_event",
    action: input.action,
    outcome: input.outcome,
    actorUid: input.actorUid ?? "anonymous",
    targetId: input.targetId ?? null,
    correlationId: input.correlationId ?? randomUUID(),
    reasonCode: input.reasonCode ?? null,
    metadata: input.metadata ?? {},
  };
  if (input.outcome === "allowed" || input.outcome === "succeeded") {
    logInfo("Security event", context);
  } else {
    logWarning("Security event", context);
  }
}

export function correlationIdFromCallable(request: CallableRequest): string {
  return correlationIdFromHeaders(request.rawRequest.headers);
}

export function correlationIdFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string {
  for (const name of ["x-request-id", "x-correlation-id", "x-cloud-trace-context"]) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const candidate = value?.split("/")[0]?.trim();
    if (candidate && /^[A-Za-z0-9._:-]{8,128}$/u.test(candidate)) {
      return candidate;
    }
  }
  return randomUUID();
}

export function maskEmail(value: string): string {
  const [local, domain] = value.trim().toLowerCase().split("@");
  if (!local || !domain) return "[invalid-email]";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/gu, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "[masked-phone]";
}

export function accountSecurityAction(
  beforeBlocked: boolean,
  afterBlocked: boolean,
): "account_blocked" | "account_unblocked" | "account_status_changed" {
  if (!beforeBlocked && afterBlocked) return "account_blocked";
  if (beforeBlocked && !afterBlocked) return "account_unblocked";
  return "account_status_changed";
}
