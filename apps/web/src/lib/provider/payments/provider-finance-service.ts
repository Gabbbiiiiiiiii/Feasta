import "server-only";

import {
  AggregateField,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  requireApprovedProvider,
} from "@/lib/auth/session";

import {
  adminDb,
} from "@/lib/firebase/admin";

import type {
  ProviderEarning,
  ProviderEarningStatus,
  ProviderFinanceOverview,
  ProviderLinkedAccountType,
  ProviderPayoutAccountView,
  ProviderPayoutSetupStatus,
  ProviderSettlementStatus,
  ProviderSettlementSummary,
  ProviderSettlementTransportMode,
  ProviderSettlementView,
} from "./provider-finance-types";

const PAYOUT_SETUP_STATUSES =
  new Set<ProviderPayoutSetupStatus>([
    "not_started",
    "onboarding",
    "action_required",
    "ready",
    "unavailable",
  ]);

const EARNING_STATUSES =
  new Set<ProviderEarningStatus>([
    "pending",
    "available",
    "paid",
    "reversed",
  ]);

const LINKED_ACCOUNT_TYPES =
  new Set<ProviderLinkedAccountType>([
    "consumer",
    "merchant",
  ]);

const SETTLEMENT_STATUSES =
  new Set<ProviderSettlementStatus>([
    "awaiting_availability",
    "ready",
    "reserved",
    "processing",
    "paid",
    "reconciliation_required",
    "cancelled",
  ]);

const SETTLEMENT_TRANSPORT_MODES =
  new Set<ProviderSettlementTransportMode>([
    "disabled",
    "wallet_transfer",
    "workflow",
  ]);

export async function getProviderFinanceOverview():
Promise<ProviderFinanceOverview> {
  const account =
    await requireApprovedProvider();

  const providerId =
    account.providerId;

  if (!providerId) {
    throw new Error(
      "The approved provider profile is unavailable.",
    );
  }

  const payoutReference =
    adminDb
      .collection(
        "providerPaymentAccounts",
      )
      .doc(providerId);

  const earningsQuery =
    adminDb
      .collection(
        "providerEarnings",
      )
      .where(
        "providerId",
        "==",
        providerId,
      );

  /*
   * P10-E deliberately uses only the Provider equality filter.
   *
   * Settlement ordering is performed after trusted server-side
   * normalization so no new composite Firestore index is required.
   */
  const settlementsQuery =
    adminDb
      .collection(
        "providerSettlements",
      )
      .where(
        "providerId",
        "==",
        providerId,
      );

  const [
    payoutSnapshot,
    earningsSnapshot,
    aggregateSnapshot,
    settlementsSnapshot,
  ] = await Promise.all([
    payoutReference.get(),

    earningsQuery
      .orderBy(
        "createdAt",
        "desc",
      )
      .limit(20)
      .get(),

    earningsQuery
      .aggregate({
        pendingAmountInCentavos:
          AggregateField.sum(
            "pendingAmountInCentavos",
          ),

        availableAmountInCentavos:
          AggregateField.sum(
            "availableAmountInCentavos",
          ),

        paidAmountInCentavos:
          AggregateField.sum(
            "paidAmountInCentavos",
          ),

        reversedAmountInCentavos:
          AggregateField.sum(
            "reversedAmountInCentavos",
          ),
      })
      .get(),

    settlementsQuery.get(),
  ]);

  const aggregate =
    aggregateSnapshot.data();

  const settlements =
    settlementsSnapshot.docs
      .flatMap(
        (document) => {
          const settlement =
            normalizeSettlement(
              document,
              providerId,
            );

          return settlement
            ? [settlement]
            : [];
        },
      )
      .sort(
        (left, right) =>
          new Date(
            right.createdAt,
          ).getTime() -
          new Date(
            left.createdAt,
          ).getTime(),
      );

  return {
    payoutAccount:
      normalizePayoutAccount(
        payoutSnapshot.exists
          ? payoutSnapshot.data() ??
            {}
          : null,
      ),

    earningSummary: {
      pendingAmountInCentavos:
        safeMoney(
          aggregate
            .pendingAmountInCentavos,
        ),

      availableAmountInCentavos:
        safeMoney(
          aggregate
            .availableAmountInCentavos,
        ),

      paidAmountInCentavos:
        safeMoney(
          aggregate
            .paidAmountInCentavos,
        ),

      reversedAmountInCentavos:
        safeMoney(
          aggregate
            .reversedAmountInCentavos,
        ),
    },

    earnings:
      earningsSnapshot.docs
        .flatMap(
          (document) => {
            const earning =
              normalizeEarning(
                document,
                providerId,
              );

            return earning
              ? [earning]
              : [];
          },
        ),

    settlements:
      settlements.slice(
        0,
        20,
      ),

    settlementSummary:
      summarizeSettlements(
        settlements,
      ),
  };
}

function normalizePayoutAccount(
  data: DocumentData | null,
): ProviderPayoutAccountView {
  if (!data) {
    return {
      setupStatus:
        "not_started",

      linkedAccountType:
        null,

      invitationStatus:
        null,

      activationStatus:
        null,

      payoutReady:
        false,

      relationshipStatus:
        null,

      settlementTransportMode:
        "disabled",

      settlementTransportReady:
        false,

      paymongoAccountId:
        null,

      childAccountPresent:
        false,

      activationProfileComplete:
        false,

      identityVerificationStatus:
        null,

      gatewayLastStatusCode:
        null,

      updatedAt:
        null,
    };
  }

  const setupStatus =
    typeof data.setupStatus ===
      "string" &&
    PAYOUT_SETUP_STATUSES.has(
      data.setupStatus as
        ProviderPayoutSetupStatus,
    )
      ? data.setupStatus as
        ProviderPayoutSetupStatus
      : "unavailable";

  const linkedAccountType =
    typeof data.linkedAccountType ===
      "string" &&
    LINKED_ACCOUNT_TYPES.has(
      data.linkedAccountType as
        ProviderLinkedAccountType,
    )
      ? data.linkedAccountType as
        ProviderLinkedAccountType
      : null;

  const settlementTransportMode =
    typeof data
      .settlementTransportMode ===
      "string" &&
    SETTLEMENT_TRANSPORT_MODES.has(
      data.settlementTransportMode as
        ProviderSettlementTransportMode,
    )
      ? data.settlementTransportMode as
        ProviderSettlementTransportMode
      : "disabled";

  return {
    setupStatus,
    linkedAccountType,

    invitationStatus:
      optionalText(
        data.invitationStatus,
      ),

    activationStatus:
      optionalText(
        data.activationStatus,
      ),

    /*
     * Historical/P9 readiness means the PayMongo child account
     * completed the account-setup gate.
     *
     * It is NOT the Provider settlement transport capability.
     */
    payoutReady:
      data.payoutReady ===
        true,

    relationshipStatus:
      optionalText(
        data.relationshipStatus,
      ),

    settlementTransportMode,

    settlementTransportReady:
      data
        .settlementTransportReady ===
      true,

    paymongoAccountId:
      optionalText(
        data.paymongoAccountId,
      ),

    childAccountPresent:
      typeof data.paymongoAccountId ===
        "string" &&
      /^org_[A-Za-z0-9_-]{3,200}$/u
        .test(
          data.paymongoAccountId,
        ),

    activationProfileComplete:
      activationProfileComplete(
        data.activationProfile,
        linkedAccountType,
      ),

    identityVerificationStatus:
      optionalIdentityStatus(
        data.identityVerificationStatus,
      ),

    gatewayLastStatusCode:
      gatewayStatusCode(
        data.gatewayLastStatusCode,
      ),

    updatedAt:
      dateString(
        data.updatedAt,
      ),
  };
}

function activationProfileComplete(
  value: unknown,
  linkedAccountType:
    ProviderLinkedAccountType |
    null,
): boolean {
  if (
    !linkedAccountType ||
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const profile =
    value as Record<string, unknown>;

  const personReady =
    [
      "nationality",
      "placeOfBirthCity",
      "placeOfBirthCountry",
      "natureOfWork",
      "sourceOfFunds",
      "personTin",
    ].every((key) =>
      typeof profile[key] === "string" &&
      profile[key].length > 0,
    ) &&
    profile.currentAddress !==
      null &&
    typeof profile.currentAddress ===
      "object";

  if (!personReady) return false;

  if (linkedAccountType === "consumer") {
    return profile.business == null;
  }

  if (
    !profile.business ||
    typeof profile.business !== "object"
  ) {
    return false;
  }

  const business =
    profile.business as Record<string, unknown>;

  return [
    "legalType",
    "industry",
    "age",
    "size",
    "estimatedMonthlyVolume",
    "tin",
  ].every((key) =>
    typeof business[key] === "string" &&
    business[key].length > 0,
  ) &&
  business.address !== null &&
  typeof business.address === "object";
}

function optionalIdentityStatus(
  value: unknown,
): string | null {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "for_review" ||
    value === "passed" ||
    value === "passed_attestation_form" ||
    value === "passed_kyc_reliance" ||
    value === "failed"
  ) {
    return value;
  }

  return null;
}

function gatewayStatusCode(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 100 ||
    value > 599
  ) {
    return null;
  }

  return value;
}

function normalizeEarning(
  document:
    QueryDocumentSnapshot<
      DocumentData
    >,

  expectedProviderId:
    string,
): ProviderEarning | null {
  const data =
    document.data();

  if (
    data.schemaVersion !== 1 ||
    data.providerId !==
      expectedProviderId
  ) {
    return null;
  }

  if (
    typeof data.status !==
      "string" ||
    !EARNING_STATUSES.has(
      data.status as
        ProviderEarningStatus,
    )
  ) {
    return null;
  }

  const paymentId =
    optionalText(
      data.paymentId,
    );

  const providerRequestId =
    optionalText(
      data.providerRequestId,
    );

  const mainEventId =
    optionalText(
      data.mainEventId,
    );

  const createdAt =
    dateString(
      data.createdAt,
    );

  if (
    !paymentId ||
    !providerRequestId ||
    !mainEventId ||
    !createdAt
  ) {
    return null;
  }

  return {
    earningId:
      document.id,
    economicSource: data.economicSource === "payment_default_reservation_compensation" ? "payment_default_reservation_compensation" : "service_earnings",

    paymentId,
    providerRequestId,
    mainEventId,

    status:
      data.status as
        ProviderEarningStatus,

    earningAmountInCentavos:
      safeMoney(
        data
          .earningAmountInCentavos,
      ),

    pendingAmountInCentavos:
      safeMoney(
        data
          .pendingAmountInCentavos,
      ),

    availableAmountInCentavos:
      safeMoney(
        data
          .availableAmountInCentavos,
      ),

    paidAmountInCentavos:
      safeMoney(
        data
          .paidAmountInCentavos,
      ),

    reversedAmountInCentavos:
      safeMoney(
        data
          .reversedAmountInCentavos,
      ),

    commissionDeductedInCentavos:
      safeMoney(
        data
          .commissionDeductedInCentavos,
      ),

    withholdingDeductedInCentavos:
      safeMoney(
        data
          .withholdingDeductedInCentavos,
      ),

    createdAt,

    updatedAt:
      dateString(
        data.updatedAt,
      ),
  };
}

function normalizeSettlement(
  document:
    QueryDocumentSnapshot<
      DocumentData
    >,

  expectedProviderId:
    string,
): ProviderSettlementView | null {
  const data =
    document.data();

  if (
    data.schemaVersion !== 1 ||
    data.providerId !==
      expectedProviderId ||
    data.currency !==
      "PHP"
  ) {
    return null;
  }

  if (
    typeof data.status !==
      "string" ||
    !SETTLEMENT_STATUSES.has(
      data.status as
        ProviderSettlementStatus,
    )
  ) {
    return null;
  }

  const settlementId =
    optionalText(
      data.settlementId,
    );

  const earningId =
    optionalText(
      data.earningId,
    );

  const paymentId =
    optionalText(
      data.paymentId,
    );

  const providerRequestId =
    optionalText(
      data.providerRequestId,
    );

  const mainEventId =
    optionalText(
      data.mainEventId,
    );

  const createdAt =
    dateString(
      data.createdAt,
    );

  if (
    !settlementId ||
    settlementId !==
      document.id ||
    !earningId ||
    !paymentId ||
    !providerRequestId ||
    !mainEventId ||
    !createdAt
  ) {
    return null;
  }

  const netSettlementAmountInCentavos =
    safeMoney(
      data
        .netSettlementAmountInCentavos,
    );

  const reservedAmountInCentavos =
    safeMoney(
      data
        .reservedAmountInCentavos,
    );

  const paidOutAmountInCentavos =
    safeMoney(
      data
        .paidOutAmountInCentavos,
    );

  if (
    reservedAmountInCentavos >
      netSettlementAmountInCentavos ||
    paidOutAmountInCentavos >
      netSettlementAmountInCentavos
  ) {
    return null;
  }

  return {
    settlementId,
    earningId,
    paymentId,
    providerRequestId,
    mainEventId,

    status:
      data.status as
        ProviderSettlementStatus,

    netSettlementAmountInCentavos,
    reservedAmountInCentavos,
    paidOutAmountInCentavos,

    reconciliationRequired:
      data.reconciliationRequired ===
        true,

    reconciliationReason:
      optionalText(
        data.reconciliationReason,
      ),

    activePayoutAttemptId:
      optionalText(
        data.activePayoutAttemptId,
      ),

    lastPayoutAttemptId:
      optionalText(
        data.lastPayoutAttemptId,
      ),

    createdAt,

    updatedAt:
      dateString(
        data.updatedAt,
      ),

    paidOutAt:
      dateString(
        data.paidOutAt,
      ),
  };
}

function summarizeSettlements(
  settlements:
    readonly ProviderSettlementView[],
): ProviderSettlementSummary {
  let awaitingAvailabilityAmountInCentavos =
    0;

  let readyAmountInCentavos =
    0;

  let reservedAmountInCentavos =
    0;

  let paidOutAmountInCentavos =
    0;

  let reconciliationRequiredCount =
    0;

  for (
    const settlement of
      settlements
  ) {
    if (
      settlement.status ===
        "awaiting_availability"
    ) {
      awaitingAvailabilityAmountInCentavos =
        checkedMoneyAdd(
          awaitingAvailabilityAmountInCentavos,
          settlement
            .netSettlementAmountInCentavos,
        );
    }

    if (
      settlement.status ===
        "ready"
    ) {
      readyAmountInCentavos =
        checkedMoneyAdd(
          readyAmountInCentavos,
          settlement
            .netSettlementAmountInCentavos,
        );
    }

    reservedAmountInCentavos =
      checkedMoneyAdd(
        reservedAmountInCentavos,
        settlement
          .reservedAmountInCentavos,
      );

    paidOutAmountInCentavos =
      checkedMoneyAdd(
        paidOutAmountInCentavos,
        settlement
          .paidOutAmountInCentavos,
      );

    if (
      settlement
        .reconciliationRequired
    ) {
      reconciliationRequiredCount +=
        1;
    }
  }

  return {
    awaitingAvailabilityAmountInCentavos,
    readyAmountInCentavos,
    reservedAmountInCentavos,
    paidOutAmountInCentavos,
    reconciliationRequiredCount,
  };
}

function checkedMoneyAdd(
  left: number,
  right: number,
): number {
  const result =
    left + right;

  if (
    !Number.isSafeInteger(
      result,
    ) ||
    result < 0
  ) {
    throw new Error(
      "Provider finance totals are invalid.",
    );
  }

  return result;
}

function safeMoney(
  value: unknown,
): number {
  return typeof value ===
      "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : 0;
}

function optionalText(
  value: unknown,
): string | null {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized ||
    null;
}

function dateString(
  value: unknown,
): string | null {
  if (
    value instanceof
      Timestamp
  ) {
    return value
      .toDate()
      .toISOString();
  }

  if (
    value instanceof Date &&
    Number.isFinite(
      value.getTime(),
    )
  ) {
    return value
      .toISOString();
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "toDate" in value &&
    typeof value.toDate ===
      "function"
  ) {
    const result =
      value.toDate();

    if (
      result instanceof Date &&
      Number.isFinite(
        result.getTime(),
      )
    ) {
      return result
        .toISOString();
    }
  }

  return null;
}
