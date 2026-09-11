"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {
  REFUND_BASIS_POINTS_MAX,
  REFUND_BASIS_POINTS_MIN,
  REFUND_ELIGIBILITY_STAGES,
  REFUND_POLICY_TERMS_MAX_LENGTH,
  type RefundEligibilityStage,
} from "@feasta/shared-types";

import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

export type CustomerRefundPolicyDisclosure = {
  /** Opaque relationship key used only to build the trusted acknowledgement. */
  providerId: string;
  providerName: string;
  effectivePolicyKey: string;
  sourceKind: "provider_default" | "package_override";
  rules: readonly {
    stage: RefundEligibilityStage;
    refundBasisPoints: number;
  }[];
  terms: string | null;
};

export type CustomerRefundPolicyDisclosureResult = {
  acknowledgementsRequired: boolean;
  policies: readonly CustomerRefundPolicyDisclosure[];
};

export type BookingRefundPolicyAcknowledgement = {
  providerId: string;
  effectivePolicyKey: string;
};

type DisclosureInput = {
  providerId: string;
  packageId: string;
  addonIds: readonly string[];
};

type DisclosureResponse = {
  rolloutMode?: unknown;
  acknowledgementsRequired?: unknown;
  policies?: unknown;
};

const MAX_POLICY_RELATIONSHIPS = 21;

export async function getCustomerBookingRefundPolicyDisclosures(
  input: DisclosureInput,
): Promise<CustomerRefundPolicyDisclosureResult> {
  try {
    await auth.authStateReady();
    if (!auth.currentUser) {
      throw new Error("Your session has expired. Sign in again to review refund policies.");
    }

    initializeBrowserAppCheck();
    const callable = httpsCallable<DisclosureInput, DisclosureResponse>(
      functions,
      "getBookingRefundPolicyDisclosures",
      {timeout: 30_000},
    );
    return parseDisclosureResponse((await callable({
      providerId: requireDocumentId(input.providerId),
      packageId: requireDocumentId(input.packageId),
      addonIds: input.addonIds.map(requireDocumentId),
    })).data);
  } catch (error) {
    throw normalizeDisclosureError(error);
  }
}

export function buildRefundPolicyAcknowledgements(
  policies: readonly CustomerRefundPolicyDisclosure[],
): readonly BookingRefundPolicyAcknowledgement[] {
  return policies.map((policy) => ({
    providerId: policy.providerId,
    effectivePolicyKey: policy.effectivePolicyKey,
  }));
}

function parseDisclosureResponse(
  value: DisclosureResponse,
): CustomerRefundPolicyDisclosureResult {
  if (
    (value.rolloutMode !== "off" && value.rolloutMode !== "required") ||
    typeof value.acknowledgementsRequired !== "boolean" ||
    value.acknowledgementsRequired !== (value.rolloutMode === "required") ||
    !Array.isArray(value.policies) ||
    value.policies.length < 1 ||
    value.policies.length > MAX_POLICY_RELATIONSHIPS
  ) {
    throw invalidDisclosureResponse();
  }

  const seenProviders = new Set<string>();
  const policies = value.policies.map((candidate) => {
    const record = requireRecord(candidate);
    const providerId = requireDocumentId(record.providerId);
    if (seenProviders.has(providerId)) throw invalidDisclosureResponse();
    seenProviders.add(providerId);

    const providerName = boundedString(record.providerName, 160);
    const effectivePolicyKey = policyKey(record.effectivePolicyKey);
    const sourceKind = record.sourceKind;
    if (sourceKind !== "provider_default" && sourceKind !== "package_override") {
      throw invalidDisclosureResponse();
    }
    if (!Number.isSafeInteger(record.policyVersion) || (record.policyVersion as number) < 1) {
      throw invalidDisclosureResponse();
    }

    const terms = record.terms;
    if (
      terms !== null &&
      (typeof terms !== "string" || terms.length > REFUND_POLICY_TERMS_MAX_LENGTH)
    ) {
      throw invalidDisclosureResponse();
    }

    return {
      providerId,
      providerName,
      effectivePolicyKey,
      sourceKind,
      rules: parseRules(record.rules),
      terms,
    } satisfies CustomerRefundPolicyDisclosure;
  });

  return {
    acknowledgementsRequired: value.acknowledgementsRequired,
    policies,
  };
}

function parseRules(value: unknown): CustomerRefundPolicyDisclosure["rules"] {
  if (!Array.isArray(value) || value.length !== REFUND_ELIGIBILITY_STAGES.length) {
    throw invalidDisclosureResponse();
  }
  const values = new Map<RefundEligibilityStage, number>();
  for (const candidate of value) {
    const record = requireRecord(candidate);
    const stage = record.stage;
    if (
      typeof stage !== "string" ||
      !REFUND_ELIGIBILITY_STAGES.includes(stage as RefundEligibilityStage) ||
      values.has(stage as RefundEligibilityStage) ||
      !Number.isSafeInteger(record.refundBasisPoints) ||
      (record.refundBasisPoints as number) < REFUND_BASIS_POINTS_MIN ||
      (record.refundBasisPoints as number) > REFUND_BASIS_POINTS_MAX
    ) {
      throw invalidDisclosureResponse();
    }
    values.set(stage as RefundEligibilityStage, record.refundBasisPoints as number);
  }
  return REFUND_ELIGIBILITY_STAGES.map((stage) => ({
    stage,
    refundBasisPoints: values.get(stage)!,
  }));
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidDisclosureResponse();
  }
  return value as Record<string, unknown>;
}

function requireDocumentId(value: unknown): string {
  if (typeof value !== "string") throw invalidDisclosureResponse();
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 160 ||
    normalized.includes("/") ||
    !/^[A-Za-z0-9_-]+$/u.test(normalized)
  ) {
    throw invalidDisclosureResponse();
  }
  return normalized;
}

function policyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 180 ||
    !/^[A-Za-z0-9_:-]+$/u.test(value)
  ) {
    throw invalidDisclosureResponse();
  }
  return value;
}

function boundedString(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw invalidDisclosureResponse();
  }
  return value.trim();
}

function invalidDisclosureResponse(): Error {
  return new Error("FEASTA received invalid refund policy details. Please refresh and try again.");
}

function normalizeDisclosureError(error: unknown): Error {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error
      ? error
      : new Error("Refund policy details could not be loaded. Please try again.");
  }
  const code = error.code.replace("functions/", "");
  if (code === "unauthenticated") {
    return new Error("Your session has expired. Sign in again to review refund policies.");
  }
  if (code === "failed-precondition") {
    return new Error("A selected Provider's refund policy is unavailable. Review your selected services or try again later.");
  }
  if (code === "resource-exhausted") {
    return new Error("Too many refund policy requests were made. Wait a moment and try again.");
  }
  return new Error("Refund policy details could not be loaded. Please try again.");
}
