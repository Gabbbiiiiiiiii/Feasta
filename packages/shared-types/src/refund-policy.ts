export const REFUND_POLICY_SCHEMA_VERSION = 1 as const;

export const REFUND_ELIGIBILITY_STAGES = [
  "preparation_not_started",
  "preparation_started",
  "service_started",
] as const;

export type RefundEligibilityStage =
  (typeof REFUND_ELIGIBILITY_STAGES)[number];

export const REFUND_BASIS_POINTS_MIN = 0;
export const REFUND_BASIS_POINTS_MAX = 10_000;
export const REFUND_POLICY_TERMS_MAX_LENGTH = 4_000;

export type RefundPolicyRule = {
  stage: RefundEligibilityStage;
  refundBasisPoints: number;
};

export type RefundPolicy<
  TTimestamp = unknown,
> = {
  schemaVersion: typeof REFUND_POLICY_SCHEMA_VERSION;
  policyVersion: number;
  rules: readonly RefundPolicyRule[];
  terms: string | null;
  effectiveAt: TTimestamp;
};

export type RefundPolicySource =
  | {
    kind: "provider_default";
    sourceId: string;
    policyVersion: number;
  }
  | {
    kind: "package_override";
    sourceId: string;
    policyVersion: number;
  };

export type EffectiveRefundPolicy<
  TTimestamp = unknown,
> = {
  effectivePolicyKey: string;
  source: RefundPolicySource;
  policy: RefundPolicy<TTimestamp>;
};
