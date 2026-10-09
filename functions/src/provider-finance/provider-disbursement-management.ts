import {
  createHash,
} from "node:crypto";

import {
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";

import {
  db,
} from "../shared/firestore.js";

import {
  providerDisbursementEligibleAt,
  parseProviderPayoutBankingHolidays,
  PROVIDER_DISBURSEMENT_POLICY_VERSION,
} from "./provider-disbursement-policy.js";

import {
  fullySettledPaymentIds,
} from "./provider-settlement-management.js";

import {
  settlementIdForEarning,
} from "./provider-settlement-domain.js";

type UnknownRecord =
  Readonly<
    Record<string, unknown>
  >;

export const PROVIDER_DISBURSEMENT_SCHEMA_VERSION =
  1 as const;

export const PROVIDER_DISBURSEMENT_STATUSES = [
  "scheduled",
  "held",
  "ready",
  "reserved",
  "processing",
  "paid",
  "failed",
  "reconciliation_required",
  "cancelled",
] as const;

export type ProviderDisbursementStatus =
  typeof PROVIDER_DISBURSEMENT_STATUSES[number];

export function providerDisbursementIdForProviderRequest(
  providerRequestId: string,
): string {
  const normalized =
    requireId(
      providerRequestId,
      "Provider request",
    );

  return `provider_disbursement_${createHash("sha256")
    .update(
      [
        "provider-request",
        normalized,
        "provider-disbursement",
        "v1",
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 32)}`;
}

export function scheduleCompletedProviderRequestDisbursementInTransaction(
  input: {
    trigger?: "completed_booking" | "payment_default_compensation";
    sourcePaymentIds?: string[];
    transaction:
      Transaction;

    providerRequestId:
      string;

    providerRequest:
      UnknownRecord;

    mainEventId:
      string;

    providerId:
      string;

    customerId:
      string;

    completedAt:
      Date;

    platformSettings:
      UnknownRecord | null;

    timestamp:
      unknown;
  },
): string | null {
  const financialSnapshot =
    recordValue(
      input.providerRequest
        .financialSnapshot,
    );

  /*
   * Historical bookings remain on their frozen legacy contract.
   *
   * Only Provider requests created after the v1 rollout contain
   * providerDisbursementPolicyVersion = 1.
   */
  if (
    !financialSnapshot ||
    financialSnapshot
      .providerDisbursementPolicyVersion !==
        PROVIDER_DISBURSEMENT_POLICY_VERSION
  ) {
    return null;
  }

  const paymentIds = input.sourcePaymentIds ?? fullySettledPaymentIds(input.providerRequest);

  if (paymentIds.length === 0) {
    throw new Error(
      "Provider disbursement has no source payments.",
    );
  }

  const providerRequestId =
    requireId(
      input.providerRequestId,
      "Provider request",
    );

  const mainEventId =
    requireId(
      input.mainEventId,
      "Main event",
    );

  const providerId =
    requireId(
      input.providerId,
      "Provider",
    );

  const customerId =
    requireId(
      input.customerId,
      "Customer",
    );

  const settings =
    input.platformSettings ??
    {};

  const holidays =
    parseProviderPayoutBankingHolidays(
      settings
        .providerPayoutBankingHolidays,
    );

  const payoutEligibleAt =
    providerDisbursementEligibleAt({
      anchor:
        input.completedAt,

      trigger:
        input.trigger ?? "completed_booking",

      bankingHolidays:
        holidays,
    });

  const disbursementId =
    providerDisbursementIdForProviderRequest(
      providerRequestId,
    );

  const reference =
    db
      .collection(
        "providerDisbursements",
      )
      .doc(
        disbursementId,
      );

  const sourceSettlementIds =
    paymentIds.map(
      (paymentId) =>
        settlementIdForEarning(
          paymentId,
        ),
    );

  input.transaction.create(
    reference,
    {
      schemaVersion:
        PROVIDER_DISBURSEMENT_SCHEMA_VERSION,

      policyVersion:
        PROVIDER_DISBURSEMENT_POLICY_VERSION,

      disbursementId,

      trigger:
        input.trigger ?? "completed_booking",

      providerRequestId,
      mainEventId,
      providerId,
      customerId,

      currency:
        "PHP",

      sourcePaymentIds:
        paymentIds,

      sourceEarningIds:
        paymentIds,

      sourceSettlementIds,

      amountInCentavos:
        null,

      status:
        "scheduled",

      holdReason:
        null,

      payoutEligibleAt:
        Timestamp.fromDate(
          payoutEligibleAt,
        ),

      nextCheckAt:
        Timestamp.fromDate(
          payoutEligibleAt,
        ),

      bankingHolidaysSnapshot:
        holidays,

      transportMode:
        "disabled",

      transportReady:
        false,

      destinationSnapshot:
        null,

      attemptSequence:
        0,

      activePayoutAttemptId:
        null,

      gatewayResourceId:
        null,

      completedBookingAt: input.trigger === "payment_default_compensation" ? null : Timestamp.fromDate(input.completedAt),
      financialFinalizedAt: input.trigger === "payment_default_compensation" ? Timestamp.fromDate(input.completedAt) : null,

      readyAt:
        null,

      paidAt:
        null,

      createdAt:
        input.timestamp,

      updatedAt:
        input.timestamp,
    },
  );

  return disbursementId;
}

function recordValue(
  value: unknown,
): UnknownRecord | null {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as UnknownRecord
    : null;
}

function requireId(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9:_-]{1,220}$/u
      .test(value)
  ) {
    throw new Error(
      `${label} identity is invalid.`,
    );
  }

  return value;
}
