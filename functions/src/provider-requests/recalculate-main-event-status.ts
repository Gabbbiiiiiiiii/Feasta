import type {
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type {
  MainEventStatus,
  ProviderRequestStatus,
} from "../shared/constants.js";
import {
  parseProviderRequestStatus,
} from "../shared/constants.js";

type ProviderRequestStatusOverride = {
  providerRequestId: string;
  status: ProviderRequestStatus;
};

export type MainEventRequestSummary = {
  status: MainEventStatus;

  providerRequestCount: number;
  pendingProviderRequestCount: number;
  acceptedProviderRequestCount: number;
  waitingPaymentProviderRequestCount: number;
  paymentProcessingProviderRequestCount: number;
  confirmedProviderRequestCount: number;
  inProgressProviderRequestCount: number;
  completedProviderRequestCount: number;
  rejectedProviderRequestCount: number;
  cancelledProviderRequestCount: number;
  expiredProviderRequestCount: number;
};

const TERMINAL_MAIN_EVENT_STATUSES =
  new Set<MainEventStatus>([
    "completed",
    "cancelled",
    "expired",
  ]);

export function calculateMainEventRequestSummary(
  requestDocuments:
    readonly QueryDocumentSnapshot<
      DocumentData
    >[],
  currentMainEventStatus: MainEventStatus,
  overrides:
    readonly ProviderRequestStatusOverride[] = [],
): MainEventRequestSummary {
  if (requestDocuments.length === 0) {
    return emptySummary(
      currentMainEventStatus,
    );
  }

  const overrideByRequestId = new Map(
    overrides.map((override) => [
      override.providerRequestId,
      override.status,
    ]),
  );

  const statuses =
    requestDocuments.map((document) => {
      const override =
        overrideByRequestId.get(document.id);

      if (override) {
        return override;
      }

      return (
        parseProviderRequestStatus(
          document.data().status,
        ) ?? "pending"
      );
    });

  const counts = {
    pending: countStatus(
      statuses,
      "pending",
    ),

    accepted: countStatus(
      statuses,
      "accepted",
    ),

    waitingForPayment: countStatus(
      statuses,
      "waiting_for_down_payment",
    ),

    paymentProcessing: countStatus(
      statuses,
      "payment_processing",
    ),

    confirmed: countStatus(
      statuses,
      "confirmed",
    ),

    inProgress: countStatus(
      statuses,
      "in_progress",
    ),

    completed: countStatus(
      statuses,
      "completed",
    ),

    rejected: countStatus(
      statuses,
      "rejected",
    ),

    cancelled: countStatus(
      statuses,
      "cancelled",
    ),

    expired: countStatus(
      statuses,
      "expired",
    ),
  };

  const status = deriveMainEventStatus(
    currentMainEventStatus,
    statuses.length,
    counts,
  );

  return {
    status,

    providerRequestCount:
      statuses.length,

    pendingProviderRequestCount:
      counts.pending,

    acceptedProviderRequestCount:
      counts.accepted,

    waitingPaymentProviderRequestCount:
      counts.waitingForPayment,

    paymentProcessingProviderRequestCount:
      counts.paymentProcessing,

    confirmedProviderRequestCount:
      counts.confirmed,

    inProgressProviderRequestCount:
      counts.inProgress,

    completedProviderRequestCount:
      counts.completed,

    rejectedProviderRequestCount:
      counts.rejected,

    cancelledProviderRequestCount:
      counts.cancelled,

    expiredProviderRequestCount:
      counts.expired,
  };
}

function deriveMainEventStatus(
  currentStatus: MainEventStatus,
  total: number,
  counts: {
    pending: number;
    accepted: number;
    waitingForPayment: number;
    paymentProcessing: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    rejected: number;
    cancelled: number;
    expired: number;
  },
): MainEventStatus {
  if (
    TERMINAL_MAIN_EVENT_STATUSES.has(
      currentStatus,
    )
  ) {
    return currentStatus;
  }

  const inactiveCount =
    counts.rejected +
    counts.cancelled +
    counts.expired;

  if (counts.completed === total) {
    return "completed";
  }

  if (counts.cancelled === total) {
    return "cancelled";
  }

  if (counts.expired === total) {
    return "expired";
  }

  if (
    counts.rejected > 0 ||
    inactiveCount > 0
  ) {
    return "needs_provider_replacement";
  }

  if (counts.inProgress > 0) {
    return "in_progress";
  }

  if (
    counts.pending > 0 ||
    counts.accepted > 0
  ) {
    return "pending_provider_approval";
  }

  if (
    counts.waitingForPayment > 0 ||
    counts.paymentProcessing > 0
  ) {
    return "waiting_for_down_payment";
  }

  if (
    counts.confirmed +
      counts.completed ===
    total
  ) {
    return "confirmed";
  }

  return currentStatus;
}

function countStatus(
  statuses:
    readonly ProviderRequestStatus[],
  expected: ProviderRequestStatus,
): number {
  let count = 0;

  for (const status of statuses) {
    if (status === expected) {
      count += 1;
    }
  }

  return count;
}

function emptySummary(
  status: MainEventStatus,
): MainEventRequestSummary {
  return {
    status,

    providerRequestCount: 0,
    pendingProviderRequestCount: 0,
    acceptedProviderRequestCount: 0,
    waitingPaymentProviderRequestCount: 0,
    paymentProcessingProviderRequestCount: 0,
    confirmedProviderRequestCount: 0,
    inProgressProviderRequestCount: 0,
    completedProviderRequestCount: 0,
    rejectedProviderRequestCount: 0,
    cancelledProviderRequestCount: 0,
    expiredProviderRequestCount: 0,
  };
}