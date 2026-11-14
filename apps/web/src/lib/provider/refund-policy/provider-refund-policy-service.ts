import "server-only";

import {
  REFUND_BASIS_POINTS_MAX,
  REFUND_BASIS_POINTS_MIN,
  REFUND_ELIGIBILITY_STAGES,
  REFUND_POLICY_TERMS_MAX_LENGTH,
  REFUND_POLICY_SCHEMA_VERSION,
  type RefundEligibilityStage,
} from "@feasta/shared-types";
import {Timestamp} from "firebase-admin/firestore";

import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

import type {
  ProviderPackageRefundPolicyDto,
  ProviderRefundPolicyDto,
  ProviderRefundPolicyPageDto,
  ProviderRefundRuleDto,
} from "./provider-refund-policy-types";

const MAX_REFUND_POLICY_PACKAGES = 100;

export async function getProviderRefundPolicyPage():
Promise<ProviderRefundPolicyPageDto> {
  const account = await requireApprovedProvider();
  const providerId = requireDocumentId(account.providerId, "providerId");

  const [providerSnapshot, packagesSnapshot] = await Promise.all([
    adminDb.collection("providers").doc(providerId).get(),
    adminDb.collection("packages")
      .where("providerId", "==", providerId)
      .orderBy("createdAt", "desc")
      .limit(MAX_REFUND_POLICY_PACKAGES)
      .get(),
  ]);

  if (!providerSnapshot.exists) {
    throw new Error("The Provider account could not be loaded.");
  }

  return {
    providerPolicy: parsePolicy(
      providerSnapshot.data()?.refundPolicy,
      "provider_default",
    ),
    packages: packagesSnapshot.docs.map((document) =>
      parsePackage(document.id, document.data())),
  };
}

function parsePackage(
  packageId: string,
  value: Record<string, unknown>,
): ProviderPackageRefundPolicyDto {
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const status = value.status;
  if (!name || !isPackageStatus(status)) {
    throw new Error("A Provider package contains invalid refund policy data.");
  }

  const override = parsePolicy(value.refundPolicyOverride, "package_override");
  return {
    packageId: requireDocumentId(packageId, "packageId"),
    name: name.slice(0, 120),
    status,
    policySource: override ? "package_override" : "provider_default",
    override,
  };
}

function parsePolicy(
  value: unknown,
  source: ProviderRefundPolicyDto["source"],
): ProviderRefundPolicyDto | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || value.schemaVersion !== REFUND_POLICY_SCHEMA_VERSION) {
    throw new Error("A stored refund policy is invalid.");
  }

  if (!Number.isSafeInteger(value.policyVersion) || (value.policyVersion as number) < 1) {
    throw new Error("A stored refund policy version is invalid.");
  }

  const rules = parseRules(value.rules);
  const terms = value.terms;
  if (
    terms !== null &&
    (typeof terms !== "string" || terms.length > REFUND_POLICY_TERMS_MAX_LENGTH)
  ) {
    throw new Error("Stored refund policy terms are invalid.");
  }

  return {
    source,
    rules,
    terms,
    version: value.policyVersion as number,
    effectiveAt: timestampIso(value.effectiveAt),
  };
}

function parseRules(value: unknown): readonly ProviderRefundRuleDto[] {
  if (!Array.isArray(value) || value.length !== REFUND_ELIGIBILITY_STAGES.length) {
    throw new Error("A stored refund policy must contain all three stages.");
  }

  const byStage = new Map<RefundEligibilityStage, number>();
  for (const candidate of value) {
    if (!isRecord(candidate) || !isStage(candidate.stage)) {
      throw new Error("A stored refund policy rule is invalid.");
    }
    if (
      !Number.isSafeInteger(candidate.refundBasisPoints) ||
      (candidate.refundBasisPoints as number) < REFUND_BASIS_POINTS_MIN ||
      (candidate.refundBasisPoints as number) > REFUND_BASIS_POINTS_MAX ||
      byStage.has(candidate.stage)
    ) {
      throw new Error("A stored refund percentage is invalid.");
    }
    byStage.set(candidate.stage, candidate.refundBasisPoints as number);
  }

  return REFUND_ELIGIBILITY_STAGES.map((stage) => ({
    stage,
    refundBasisPoints: byStage.get(stage)!,
  }));
}

function timestampIso(value: unknown): string {
  if (!(value instanceof Timestamp)) {
    throw new Error("A stored refund policy date is invalid.");
  }
  return value.toDate().toISOString();
}

function isPackageStatus(value: unknown):
value is ProviderPackageRefundPolicyDto["status"] {
  return value === "draft" || value === "published" || value === "archived";
}

function isStage(value: unknown): value is RefundEligibilityStage {
  return typeof value === "string" &&
    REFUND_ELIGIBILITY_STAGES.includes(value as RefundEligibilityStage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireDocumentId(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`The ${field} is invalid.`);
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    normalized.includes("/") ||
    !/^[A-Za-z0-9_-]+$/u.test(normalized)
  ) {
    throw new Error(`The ${field} is invalid.`);
  }
  return normalized;
}
