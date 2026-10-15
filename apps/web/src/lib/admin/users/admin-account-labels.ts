import type {AdminAccountAccessDecision, AdminAccountStatus} from "./admin-user-types";

export const restrictionReasons = [
  "Policy violation", "Fraud or suspicious activity", "Abuse or harassment",
  "Account security concern", "Repeated booking misuse", "Temporary investigation", "Other",
] as const;
export type RestrictionReason = (typeof restrictionReasons)[number];

export const restrictionReasonDescriptions: Record<RestrictionReason, string> = {
  "Policy violation": "Serious or repeated violations of FEASTA rules.",
  "Fraud or suspicious activity": "Suspicious payments, identity, business information, or misleading activity.",
  "Abuse or harassment": "Abusive behavior toward customers, providers, or administrators.",
  "Account security concern": "Suspected unauthorized access or a compromised account.",
  "Repeated booking misuse": "Repeated intentional booking, cancellation, or no-show misuse.",
  "Temporary investigation": "Restrict access while a reported issue is reviewed.",
  "Other": "Another valid reason. Explain the restriction clearly.",
};

export function meaningfulRestrictionExplanation(value: string): boolean {
  const trimmed = value.trim().replace(/\s+/gu, " ");
  // Reject repeated placeholders as well as short test-only values.
  return trimmed.length >= 10 && !/^(?:(?:test|testing|12345|asdf|other|none|n\/?a)[\s.,!_-]*)+$/iu.test(trimmed);
}

export function accountAccessLabel(status: AdminAccountStatus) {
  return status === "active" ? "Active" : "Restricted";
}

// Preserve the existing operational vs policy/security audit distinction.
export function restrictionDecision(reason: RestrictionReason): AdminAccountAccessDecision {
  return reason === "Temporary investigation" || reason === "Other" ? "disable" : "block";
}
