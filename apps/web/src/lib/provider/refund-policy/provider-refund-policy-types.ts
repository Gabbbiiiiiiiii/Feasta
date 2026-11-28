import type {
  AdminDefaultCancellationPolicyDto,
  ProviderCancellationPolicyDto,
  RefundEligibilityStage,
} from "@feasta/shared-types";

export type ProviderRefundRuleDto = {
  stage: RefundEligibilityStage;
  refundBasisPoints: number;
};

export type ProviderRefundPolicyDto = {
  source: "provider_default" | "package_override";
  rules: readonly ProviderRefundRuleDto[];
  terms: string | null;
  version: number;
  effectiveAt: string;
};

export type ProviderPackageRefundPolicyDto = {
  packageId: string;
  name: string;
  status: "draft" | "published" | "archived";
  policySource: "provider_default" | "package_override";
  override: ProviderRefundPolicyDto | null;
};

export type ProviderRefundPolicyPageDto = {
  providerPolicy: ProviderRefundPolicyDto | null;
  packages?: readonly ProviderPackageRefundPolicyDto[];
  adminDefaultCancellationPolicy?: AdminDefaultCancellationPolicyDto;
  providerCancellationPolicy?: ProviderCancellationPolicyDto | null;
};

export type SaveProviderCancellationPolicyResponse = {
  success: boolean;
  providerId: string;
  mode: "admin_default" | "provider_custom";
  cutoffHoursBeforeEvent: number | null;
  effectiveCutoffHoursBeforeEvent: number;
  policyVersion: number;
};
