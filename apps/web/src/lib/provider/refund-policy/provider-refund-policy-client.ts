"use client";

import {httpsCallable} from "firebase/functions";

import {
  REFUND_ELIGIBILITY_STAGES,
  type RefundEligibilityStage,
} from "@feasta/shared-types";

import {auth, functions} from "@/lib/firebase/client";

export type RefundPolicyDraftPayload = {
  rules: readonly {
    stage: RefundEligibilityStage;
    refundBasisPoints: number;
  }[];
  terms: string | null;
};

type MutationResponse = {
  success: boolean;
};

export async function publishProviderRefundPolicy(
  policy: RefundPolicyDraftPayload,
): Promise<MutationResponse> {
  await requireProviderAuth();
  return callRefundPolicyMutation("publishProviderRefundPolicy", {
    policy: normalizeDraft(policy),
    idempotencyKey: crypto.randomUUID(),
  });
}

export async function setPackageRefundPolicyOverride(
  packageId: string,
  override: RefundPolicyDraftPayload | null,
): Promise<MutationResponse> {
  await requireProviderAuth();
  return callRefundPolicyMutation("setPackageRefundPolicyOverride", {
    packageId: requireDocumentId(packageId),
    override: override ? normalizeDraft(override) : null,
    idempotencyKey: crypto.randomUUID(),
  });
}

function normalizeDraft(policy: RefundPolicyDraftPayload): RefundPolicyDraftPayload {
  const byStage = new Map(policy.rules.map((rule) => [rule.stage, rule.refundBasisPoints]));
  return {
    rules: REFUND_ELIGIBILITY_STAGES.map((stage) => ({
      stage,
      refundBasisPoints: byStage.get(stage) as number,
    })),
    terms: policy.terms?.trim() || null,
  };
}

async function callRefundPolicyMutation(
  name: "publishProviderRefundPolicy" | "setPackageRefundPolicyOverride",
  data: Record<string, unknown>,
): Promise<MutationResponse> {
  const callable = httpsCallable<Record<string, unknown>, MutationResponse>(
    functions,
    name,
  );
  return (await callable(data)).data;
}

async function requireProviderAuth(): Promise<void> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("session-expired");
}

function requireDocumentId(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    normalized.includes("/") ||
    !/^[A-Za-z0-9_-]+$/u.test(normalized)
  ) {
    throw new Error("invalid-package-id");
  }
  return normalized;
}
