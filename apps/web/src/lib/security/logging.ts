import "server-only";

import {randomUUID} from "node:crypto";

export interface WebSecurityEvent {
  action: string;
  outcome: "denied" | "failed" | "succeeded";
  actorUid?: string;
  targetId?: string;
  reasonCode: string;
  correlationId?: string;
}

export function logWebSecurityEvent(event: WebSecurityEvent): void {
  console.warn("Security event", {
    eventType: "security_event",
    action: event.action,
    outcome: event.outcome,
    actorUid: event.actorUid ?? "anonymous",
    targetId: event.targetId ?? null,
    reasonCode: event.reasonCode,
    correlationId: event.correlationId ?? randomUUID(),
  });
}

export function requestCorrelationId(request: Request): string {
  for (const name of ["x-request-id", "x-correlation-id", "x-vercel-id"]) {
    const value = request.headers.get(name)?.split(":")[0]?.trim();
    if (value && /^[A-Za-z0-9._:-]{8,128}$/u.test(value)) return value;
  }
  return randomUUID();
}
