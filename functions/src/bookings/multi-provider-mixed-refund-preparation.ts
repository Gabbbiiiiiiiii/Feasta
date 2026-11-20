import {HttpsError} from "firebase-functions/v2/https";

import {
  parseBookingRefundPolicyRollout,
  resolveBookingRefundPolicies,
  refundPolicyDisclosures,
  type BookingRefundPolicyRelationship,
} from "./booking-refund-policy.js";

import {
  confirmMultiProviderRefundAcknowledgements,
  type MultiProviderRefundRolloutSnapshot,
  type PreparedMultiProviderRefundPolicies,
} from "./multi-provider-refund-preparation.js";

import type {
  TrustedMixedProviderRow,
} from "./multi-provider-mixed-transaction-reader.js";

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

/**
 * Resolve the CURRENT provider-specific refund policies for
 * a mixed Catering + marketplace event.
 *
 * Catering uses its authoritative package record.
 * Marketplace services use the provider's default policy.
 *
 * Does not read Firestore, acknowledge a policy or write
 * booking records. The caller must supply a trusted rollout
 * snapshot from its transaction.
 */
export function prepareMixedProviderRefundPolicies(input: {
  rows: readonly TrustedMixedProviderRow[];
  rollout: MultiProviderRefundRolloutSnapshot;
}): PreparedMultiProviderRefundPolicies {
  const {rows, rollout} = input;

  if (!Array.isArray(rows) ||
      rows.length < 1 ||
      rows.length > 4) {
    return reject("Mixed refund relationships are invalid.");
  }

  const seen = new Set<string>();
  let cateringCount = 0;
  let marketplaceCount = 0;

  const relationships: BookingRefundPolicyRelationship[] =
    rows.map((row) => {
      const providerId = row?.providerId;
      const providerName = row?.providerData?.businessName;

      if (
        typeof providerId !== "string" ||
        !/^[A-Za-z0-9_-]{8,160}$/.test(providerId) ||
        seen.has(providerId) ||
        typeof providerName !== "string" ||
        !providerName.trim() ||
        providerName.length > 200 ||
        typeof row.providerOwnerId !== "string" ||
        row.providerData.ownerId !== row.providerOwnerId
      ) {
        return reject("Mixed refund provider identity is invalid.");
      }

      seen.add(providerId);

      if (row.kind === "catering_package") {
        if (
          row.resolved.providerId !== providerId ||
          typeof row.resolved.packageId !== "string" ||
          !row.resolved.packageId.trim() ||
          row.packageData.providerId !== providerId
        ) {
          return reject("Catering refund linkage is invalid.");
        }

        cateringCount++;

        return {
          providerId,
          providerName,
          providerData: row.providerData,
          packageRecord: {
            packageId: row.resolved.packageId,
            data: row.packageData,
          },
        };
      }

      if (row.kind !== "marketplace_service") {
        return reject("Mixed refund selection kind is invalid.");
      }

      if (
        row.service.providerId !== providerId ||
        row.service.ownerId !== row.providerOwnerId ||
        typeof row.service.serviceId !== "string" ||
        !row.service.serviceId.trim()
      ) {
        return reject("Marketplace refund linkage is invalid.");
      }

      marketplaceCount++;

      return {
        providerId,
        providerName,
        providerData: row.providerData,
        packageRecord: null,
      };
    });

  if (!(marketplaceCount === 1 && cateringCount === 0) &&
      (cateringCount === 0 || marketplaceCount === 0)) {
    return reject(
      "Mixed booking requires Catering and an event service.",
    );
  }

  const mode = parseBookingRefundPolicyRollout(rollout);

  if (mode === "off") {
    return {
      mode,
      policies: new Map(),
      disclosures: [],
    };
  }

  const policies = resolveBookingRefundPolicies(relationships);

  if (policies.size !== rows.length ||
      rows.some((row) => !policies.has(row.providerId))) {
    return reject("Mixed refund policy resolution is incomplete.");
  }

  return {
    mode,
    policies,
    disclosures: refundPolicyDisclosures(policies),
  };
}

/**
 * Reuses FEASTA's existing exact acknowledgement validation.
 * The timestamp must come from the trusted submission caller.
 */
export function confirmMixedProviderRefundAcknowledgements<TTimestamp>(
  prepared: PreparedMultiProviderRefundPolicies,
  acknowledgementValue: unknown,
  timestamp: TTimestamp,
) {
  return confirmMultiProviderRefundAcknowledgements(
    prepared,
    acknowledgementValue,
    timestamp,
  );
}