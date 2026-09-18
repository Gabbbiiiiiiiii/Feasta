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
      throw new RefundPolicyDisclosureError("Sign in to review refund policies",
        "Your session has expired. Sign in again to review refund policies.", false);
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

export class RefundPolicyDisclosureError extends Error {
  constructor(
    readonly title: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function invalidDisclosureResponse(): Error {
  return new RefundPolicyDisclosureError(
    "Refund policy details could not be verified",
    "FEASTA could not verify the policy details. Contact FEASTA support before booking.",
    false,
  );
}

export function normalizeDisclosureError(error: unknown): RefundPolicyDisclosureError {
  if (error instanceof RefundPolicyDisclosureError) return error;
  const code = error instanceof FirebaseError ? error.code.replace("functions/", "") : "unknown";
  const details = error instanceof FirebaseError && "details" in error
    ? error.details : null;
  const record = details && typeof details === "object"
    ? details as Record<string, unknown> : {};
  const provider = typeof record.providerName === "string" && record.providerName.trim()
    ? record.providerName.trim().slice(0, 160) : "A selected provider";
  if (code === "failed-precondition") {
    if (record.reason === "REFUND_POLICY_REQUIRED") {
      return new RefundPolicyDisclosureError("Provider refund policy not configured",
        `${provider} has not published a refund policy. Ask the provider to configure it before booking, or choose another service.`, false);
    }
    if (record.reason === "REFUND_POLICY_INVALID") {
      if (typeof record.providerName !== "string" || !record.providerName.trim()) {
        return new RefundPolicyDisclosureError("Refund policy configuration needs correction",
          "FEASTA could not verify the refund policy configuration for this booking. Contact FEASTA support before continuing.", false);
      }
      return new RefundPolicyDisclosureError("Provider refund policy needs correction",
        `${provider}'s refund policy could not be verified. Ask the provider or FEASTA support to correct it before booking.`, false);
    }
    if (record.reason === "BOOKING_SELECTION_UNAVAILABLE") {
      return new RefundPolicyDisclosureError("Selected booking services unavailable",
        "A selected service or provider is no longer available for booking. Review your package and selected services before continuing.", false);
    }
    if (record.reason === "REFUND_POLICY_CHANGED" || record.reason === "REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED") {
      return new RefundPolicyDisclosureError("Review the current refund policies",
        "Load the current policies and acknowledge each provider's terms before submitting.", true);
    }
    return new RefundPolicyDisclosureError("Selected booking services need review",
      "A selected service or provider is unavailable, or a booking requirement is not met. Review your selection or contact FEASTA support.", false);
  }
  if (code === "unauthenticated") {
    return new RefundPolicyDisclosureError("Sign in to review refund policies",
      "Your session has expired. Sign in again to review refund policies.", false);
  }
  if (code === "permission-denied") {
    return new RefundPolicyDisclosureError("Refund policy access unavailable",
      "Your account cannot access these booking details. Check your account or contact FEASTA support.", false);
  }
  if (code === "invalid-argument" || code === "not-found") {
    return new RefundPolicyDisclosureError("Selected booking services need review",
      "Review your selected package and services before continuing. Contact FEASTA support if the problem persists.", false);
  }
  if (code === "resource-exhausted") {
    return new RefundPolicyDisclosureError("Refund policies are temporarily unavailable.",
      "Too many refund policy requests were made. Wait a moment and try again.", true);
  }
  return new RefundPolicyDisclosureError("Refund policies are temporarily unavailable.",
    "Refund policy details could not be loaded. Please try again.", true);
}
