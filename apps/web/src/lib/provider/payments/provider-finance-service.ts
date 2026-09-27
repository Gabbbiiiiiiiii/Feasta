import "server-only";

import {
  AggregateField,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

import type {
  ProviderEarning,
  ProviderEarningStatus,
  ProviderFinanceOverview,
  ProviderLinkedAccountType,
  ProviderPayoutAccountView,
  ProviderPayoutSetupStatus,
} from "./provider-finance-types";

const PAYOUT_SETUP_STATUSES = new Set<ProviderPayoutSetupStatus>([
  "not_started",
  "onboarding",
  "action_required",
  "ready",
  "unavailable",
]);

const EARNING_STATUSES = new Set<ProviderEarningStatus>([
  "pending",
  "available",
  "paid",
  "reversed",
]);

const LINKED_ACCOUNT_TYPES = new Set<ProviderLinkedAccountType>([
  "consumer",
  "merchant",
]);

export async function getProviderFinanceOverview():
Promise<ProviderFinanceOverview> {
  const account = await requireApprovedProvider();
  const providerId = account.providerId;

  if (!providerId) {
    throw new Error(
      "The approved provider profile is unavailable.",
    );
  }

  const payoutReference = adminDb
    .collection("providerPaymentAccounts")
    .doc(providerId);

  const earningsQuery = adminDb
    .collection("providerEarnings")
    .where("providerId", "==", providerId);

  const [
    payoutSnapshot,
    earningsSnapshot,
    aggregateSnapshot,
  ] = await Promise.all([
    payoutReference.get(),

    earningsQuery
      .orderBy("createdAt", "desc")
      .limit(20)
      .get(),

    earningsQuery.aggregate({
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
    }).get(),
  ]);

  const aggregate =
    aggregateSnapshot.data();

  return {
    payoutAccount:
      normalizePayoutAccount(
        payoutSnapshot.exists
          ? payoutSnapshot.data() ?? {}
          : null,
      ),

    earningSummary: {
      pendingAmountInCentavos:
        safeMoney(
          aggregate.pendingAmountInCentavos,
        ),

      availableAmountInCentavos:
        safeMoney(
          aggregate.availableAmountInCentavos,
        ),

      paidAmountInCentavos:
        safeMoney(
          aggregate.paidAmountInCentavos,
        ),

      reversedAmountInCentavos:
        safeMoney(
          aggregate.reversedAmountInCentavos,
        ),
    },

    earnings:
      earningsSnapshot.docs.flatMap(
        (document) => {
          const earning =
            normalizeEarning(document);

          return earning
            ? [earning]
            : [];
        },
      ),
  };
}

function normalizePayoutAccount(
  data: DocumentData | null,
): ProviderPayoutAccountView {
  if (!data) {
    return {
      setupStatus: "not_started",
      linkedAccountType: null,
      invitationStatus: null,
      activationStatus: null,
      payoutReady: false,
      paymongoAccountId: null,
      updatedAt: null,
    };
  }

  const setupStatus =
    typeof data.setupStatus === "string" &&
    PAYOUT_SETUP_STATUSES.has(
      data.setupStatus as ProviderPayoutSetupStatus,
    )
      ? data.setupStatus as ProviderPayoutSetupStatus
      : "unavailable";

  const linkedAccountType =
    typeof data.linkedAccountType === "string" &&
    LINKED_ACCOUNT_TYPES.has(
      data.linkedAccountType as ProviderLinkedAccountType,
    )
      ? data.linkedAccountType as ProviderLinkedAccountType
      : null;

  return {
    setupStatus,
    linkedAccountType,
    invitationStatus:
      optionalText(data.invitationStatus),
    activationStatus:
      optionalText(data.activationStatus),
    payoutReady:
      data.payoutReady === true,
    paymongoAccountId:
      optionalText(data.paymongoAccountId),
    updatedAt:
      dateString(data.updatedAt),
  };
}

function normalizeEarning(
  document: QueryDocumentSnapshot<DocumentData>,
): ProviderEarning | null {
  const data = document.data();

  if (
    data.schemaVersion !== 1 ||
    data.providerId !==
      document.ref.parent.parent?.id &&
    typeof data.providerId !== "string"
  ) {
    if (typeof data.providerId !== "string") {
      return null;
    }
  }

  if (
    typeof data.status !== "string" ||
    !EARNING_STATUSES.has(
      data.status as ProviderEarningStatus,
    )
  ) {
    return null;
  }

  const paymentId =
    optionalText(data.paymentId);

  const providerRequestId =
    optionalText(data.providerRequestId);

  const mainEventId =
    optionalText(data.mainEventId);

  const createdAt =
    dateString(data.createdAt);

  if (
    !paymentId ||
    !providerRequestId ||
    !mainEventId ||
    !createdAt
  ) {
    return null;
  }

  return {
    earningId: document.id,
    paymentId,
    providerRequestId,
    mainEventId,
    status:
      data.status as ProviderEarningStatus,

    earningAmountInCentavos:
      safeMoney(
        data.earningAmountInCentavos,
      ),

    pendingAmountInCentavos:
      safeMoney(
        data.pendingAmountInCentavos,
      ),

    availableAmountInCentavos:
      safeMoney(
        data.availableAmountInCentavos,
      ),

    paidAmountInCentavos:
      safeMoney(
        data.paidAmountInCentavos,
      ),

    reversedAmountInCentavos:
      safeMoney(
        data.reversedAmountInCentavos,
      ),

    commissionDeductedInCentavos:
      safeMoney(
        data.commissionDeductedInCentavos,
      ),

    withholdingDeductedInCentavos:
      safeMoney(
        data.withholdingDeductedInCentavos,
      ),

    createdAt,

    updatedAt:
      dateString(data.updatedAt),
  };
}

function safeMoney(
  value: unknown,
): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : 0;
}

function optionalText(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim();

  return normalized || null;
}

function dateString(
  value: unknown,
): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (
    value instanceof Date &&
    Number.isFinite(value.getTime())
  ) {
    return value.toISOString();
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const result =
      value.toDate();

    if (
      result instanceof Date &&
      Number.isFinite(result.getTime())
    ) {
      return result.toISOString();
    }
  }

  return null;
}