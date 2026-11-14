import {HttpsError} from "firebase-functions/v2/https";

import {
  parseBookingRefundPolicyRollout,
  resolveBookingRefundPolicies,
  refundPolicyDisclosures,
  parseRefundPolicyAcknowledgements,
  assertRefundPolicyAcknowledgements,
  buildProviderRequestRefundPolicyEvidence,
  type ResolvedBookingRefundPolicy,
} from "./booking-refund-policy.js";

import type {
  TrustedMultiProviderPackage,
} from "./multi-provider-transaction-reader.js";

type UnknownRecord = Record<string, unknown>;

export type MultiProviderRefundRolloutSnapshot = {
  exists: boolean;
  data: Readonly<UnknownRecord> | undefined;
};

export type PreparedMultiProviderRefundPolicies = {
  mode: "off" | "required";
  policies: ReadonlyMap<string, ResolvedBookingRefundPolicy>;
  disclosures: ReturnType<typeof refundPolicyDisclosures>;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

/**
 * Pure/read-only refund-policy resolution.
 *
 * Caller must first load trusted provider and package records
 * inside its authoritative booking transaction.
 *
 * This module performs no Firestore reads, writes or acknowledgements.
 */
export function prepareMultiProviderRefundPolicies(input: {
  rows: readonly TrustedMultiProviderPackage[];
  rollout: MultiProviderRefundRolloutSnapshot;
}): PreparedMultiProviderRefundPolicies {
  const {rows, rollout} = input;

  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 4) {
    return reject("Multi-provider refund relationships are invalid.");
  }

  const seen = new Set<string>();

  const relationships = rows.map((row) => {
    const providerId = row?.providerId;
    const packageId = row?.resolved?.packageId;
    const providerName = row?.providerData?.businessName;

    if (
      typeof providerId !== "string" ||
      !providerId.trim() ||
      seen.has(providerId) ||
      typeof packageId !== "string" ||
      !packageId.trim() ||
      row.resolved.providerId !== providerId ||
      row.packageData?.providerId !== providerId ||
      typeof providerName !== "string" ||
      !providerName.trim()
    ) {
      return reject("Multi-provider refund identity is invalid.");
    }

    seen.add(providerId);

    return {
      providerId,
      providerName,
      providerData: row.providerData,
      packageRecord: {
        packageId,
        data: row.packageData,
      },
    };
  });

  // The rollout is authoritative only when supplied from a
  // trusted Firestore snapshot by the surrounding transaction.
  const mode = parseBookingRefundPolicyRollout(rollout);

  if (mode === "off") {
    return {
      mode,
      policies: new Map<string, ResolvedBookingRefundPolicy>(),
      disclosures: [],
    };
  }

  const policies = resolveBookingRefundPolicies(relationships);

  if (policies.size !== rows.length) {
    return reject("Multi-provider refund resolution is incomplete.");
  }

  return {
    mode,
    policies,
    disclosures: refundPolicyDisclosures(policies),
  };
}

/**
 * Validate the complete current acknowledgement set before creating
 * evidence. Only the outer submission transaction may decide whether
 * an acknowledgement failure becomes a terminal outcome record.
 *
 * timestamp must be supplied by the trusted caller, not the client.
 */
export function confirmMultiProviderRefundAcknowledgements<TTimestamp>(
  prepared: PreparedMultiProviderRefundPolicies,
  value: unknown,
  timestamp: TTimestamp,
) {
  if (prepared.mode === "off") {
    if (prepared.policies.size !== 0 ||
        prepared.disclosures.length !== 0) {
      return reject("Refund rollout evidence is inconsistent.");
    }

    return new Map<
      string,
      ReturnType<typeof buildProviderRequestRefundPolicyEvidence<TTimestamp>>
    >();
  }

  if (
    prepared.mode !== "required" ||
    prepared.policies.size < 2 ||
    prepared.policies.size > 4 ||
    prepared.disclosures.length !== prepared.policies.size
  ) {
    return reject("Refund policy preparation is invalid.");
  }

  const acknowledgements = parseRefundPolicyAcknowledgements(value);

  // This must succeed for ALL providers before any evidence is built.
  assertRefundPolicyAcknowledgements(
    prepared.policies,
    acknowledgements,
  );

  const evidence = new Map<
    string,
    ReturnType<typeof buildProviderRequestRefundPolicyEvidence<TTimestamp>>
  >();

  for (const policy of prepared.policies.values()) {
    evidence.set(
      policy.providerId,
      buildProviderRequestRefundPolicyEvidence(policy, timestamp),
    );
  }

  return evidence;
}