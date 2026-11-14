import {
  REFUND_ELIGIBILITY_STAGES,
  REFUND_POLICY_TERMS_MAX_LENGTH,
  type RefundEligibilityStage,
} from "@feasta/shared-types";

import type {RefundPolicyDraftPayload} from "./provider-refund-policy-client";

export type RefundPercentValues = Record<RefundEligibilityStage, string>;

export type RefundPolicyValidation = {
  draft: RefundPolicyDraftPayload | null;
  errors: Partial<Record<RefundEligibilityStage | "terms", string>>;
};

export function parsePercentToBasisPoints(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/u.test(normalized)) {
    return null;
  }
  const [wholeText, decimalText = ""] = normalized.split(".");
  const whole = Number.parseInt(wholeText, 10);
  const decimal = Number.parseInt(decimalText.padEnd(2, "0") || "0", 10);
  const basisPoints = whole * 100 + decimal;
  return basisPoints <= 10_000 ? basisPoints : null;
}

export function formatBasisPoints(value: number): string {
  const whole = Math.floor(value / 100);
  const decimal = String(value % 100).padStart(2, "0").replace(/0+$/u, "");
  return decimal ? `${whole}.${decimal}` : String(whole);
}

export function validateRefundPolicy(
  values: RefundPercentValues,
  terms: string,
): RefundPolicyValidation {
  const errors: RefundPolicyValidation["errors"] = {};
  const parsed = new Map<RefundEligibilityStage, number>();
  for (const stage of REFUND_ELIGIBILITY_STAGES) {
    const basisPoints = parsePercentToBasisPoints(values[stage]);
    if (basisPoints === null) {
      errors[stage] = "Enter a percentage from 0 to 100 with up to two decimal places.";
    } else {
      parsed.set(stage, basisPoints);
    }
  }
  if (terms.length > REFUND_POLICY_TERMS_MAX_LENGTH) {
    errors.terms = "Additional policy terms must not exceed 4,000 characters.";
  }
  if (Object.keys(errors).length > 0) return {draft: null, errors};
  return {
    errors,
    draft: {
      rules: REFUND_ELIGIBILITY_STAGES.map((stage) => ({
        stage,
        refundBasisPoints: parsed.get(stage)!,
      })),
      terms: terms.trim() || null,
    },
  };
}
