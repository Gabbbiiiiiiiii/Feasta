import {
  createHash,
} from "node:crypto";

export const PROVIDER_SETTLEMENT_STATUSES = [
  "awaiting_availability",
  "ready",
  "reserved",
  "processing",
  "paid",
  "reconciliation_required",
  "cancelled",
] as const;

export type ProviderSettlementStatus =
  typeof PROVIDER_SETTLEMENT_STATUSES[number];

export const PROVIDER_PAYOUT_ATTEMPT_STATUSES = [
  "reserved",
  "dispatching",
  "submitted",
  "processing",
  "succeeded",
  "failed",
  "ambiguous",
] as const;

export type ProviderPayoutAttemptStatus =
  typeof PROVIDER_PAYOUT_ATTEMPT_STATUSES[number];

type UnknownRecord =
  Readonly<Record<string, unknown>>;

export type ProviderSettlementRecord = {
  schemaVersion: 1;
  settlementId: string;

  earningId: string;
  paymentId: string;
  providerRequestId: string;
  mainEventId: string;
  providerId: string;
  customerId: string;

  currency: "PHP";

  originalEarningAmountInCentavos: number;
  reversedAmountInCentavos: number;
  netSettlementAmountInCentavos: number;

  reservedAmountInCentavos: number;
  paidOutAmountInCentavos: number;

  status: ProviderSettlementStatus;

  activePayoutAttemptId: string | null;
  lastPayoutAttemptId: string | null;

  reconciliationRequired: boolean;
  reconciliationReason: string | null;

  createdAt: unknown;
  updatedAt: unknown;
  paidOutAt: unknown | null;
};

export type ProviderSettlementPlan = {
  settlementId: string;
  settlementRecord: ProviderSettlementRecord;
};

export type ProviderPayoutAttemptRecord = {
  schemaVersion: 1;
  payoutAttemptId: string;
  settlementId: string;

  earningId: string;
  providerId: string;

  currency: "PHP";
  amountInCentavos: number;

  status: ProviderPayoutAttemptStatus;

  gateway: "paymongo";
  gatewayResourceId: string | null;

  failureCode: string | null;
  failureMessage: string | null;

  createdAt: unknown;
  updatedAt: unknown;
  submittedAt: unknown | null;
  completedAt: unknown | null;
};

export function settlementIdForEarning(
  earningId: string,
): string {
  const normalized =
    requireId(
      earningId,
      "Provider earning",
    );

  return `settlement_${createHash("sha256")
    .update(
      [
        "provider-earning",
        normalized,
        "settlement",
        "v1",
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 32)}`;
}

export function payoutAttemptIdForSettlement(
  settlementId: string,
  attemptSequence: number,
): string {
  const normalizedSettlementId =
    requireId(
      settlementId,
      "Provider settlement",
    );

  const sequence =
    positiveInteger(
      attemptSequence,
      "Payout attempt sequence",
    );

  return `payout_attempt_${createHash("sha256")
    .update(
      [
        "provider-settlement",
        normalizedSettlementId,
        "attempt",
        String(sequence),
        "v1",
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 32)}`;
}

/*
 * Creates the settlement projection from one canonical P9 earning.
 *
 * This does NOT mean the Provider has been paid.
 * Customer payment truth and Provider payout truth remain separate.
 */
export function buildProviderSettlementPlan(
  input: {
    earningId: string;
    earning: UnknownRecord;
    timestamp: unknown;
  },
): ProviderSettlementPlan {
  const earningId =
    requireId(
      input.earningId,
      "Provider earning",
    );

  const earning =
    validateEarning(
      earningId,
      input.earning,
    );

  const settlementId =
    settlementIdForEarning(
      earningId,
    );

  const netSettlementAmountInCentavos =
    earning.earningAmountInCentavos -
    earning.reversedAmountInCentavos;

  const status:
    ProviderSettlementStatus =
      netSettlementAmountInCentavos === 0
        ? "cancelled"
        : earning.availableAmountInCentavos > 0
          ? "ready"
          : earning.paidAmountInCentavos > 0
            ? "reconciliation_required"
            : "awaiting_availability";

  return {
    settlementId,

    settlementRecord: {
      schemaVersion: 1,
      settlementId,

      earningId,
      paymentId: earning.paymentId,
      providerRequestId:
        earning.providerRequestId,
      mainEventId:
        earning.mainEventId,
      providerId:
        earning.providerId,
      customerId:
        earning.customerId,

      currency: "PHP",

      originalEarningAmountInCentavos:
        earning.earningAmountInCentavos,

      reversedAmountInCentavos:
        earning.reversedAmountInCentavos,

      netSettlementAmountInCentavos,

      reservedAmountInCentavos: 0,
      paidOutAmountInCentavos:
        earning.paidAmountInCentavos,

      status,

      activePayoutAttemptId: null,
      lastPayoutAttemptId: null,

      reconciliationRequired:
        earning.paidAmountInCentavos > 0,

      reconciliationReason:
        earning.paidAmountInCentavos > 0
          ? "earning_already_contains_paid_amount"
          : null,

      createdAt:
        input.timestamp,

      updatedAt:
        input.timestamp,

      paidOutAt: null,
    },
  };
}

/*
 * Reserves available Provider earnings before any external payout call.
 *
 * This is the key double-payout protection boundary.
 */
export function reserveProviderSettlementPayout(
  input: {
    settlement: UnknownRecord;
    earning: UnknownRecord;
    attemptSequence: number;
    timestamp: unknown;
  },
): {
  payoutAttemptId: string;
  settlementUpdate: Record<string, unknown>;
  earningUpdate: Record<string, unknown>;
  payoutAttemptRecord:
    ProviderPayoutAttemptRecord;
} {
  const settlement =
    validateSettlement(
      input.settlement,
    );

  const earning =
    validateEarning(
      settlement.earningId,
      input.earning,
    );

  if (
    earning.providerId !==
      settlement.providerId ||
    earning.paymentId !==
      settlement.paymentId
  ) {
    throw settlementInvalid(
      "Settlement earning linkage is invalid.",
    );
  }

  if (
    settlement.status !== "ready" ||
    settlement.reconciliationRequired
  ) {
    throw settlementInvalid(
      "Provider settlement is not ready for payout.",
    );
  }

  if (
    settlement.activePayoutAttemptId !==
      null ||
    settlement.reservedAmountInCentavos !==
      0
  ) {
    throw settlementInvalid(
      "Provider settlement already has a reserved payout.",
    );
  }

  const amount =
    settlement
      .netSettlementAmountInCentavos;

  if (amount <= 0) {
    throw settlementInvalid(
      "Provider settlement amount is not payable.",
    );
  }

  if (
    earning.availableAmountInCentavos <
      amount
  ) {
    throw settlementInvalid(
      "Available Provider earnings are insufficient for settlement.",
    );
  }

  /*
   * The entire canonical settlement is reserved.
   * P10 currently does not permit arbitrary partial Provider payouts.
   */
  const payoutAttemptId =
    payoutAttemptIdForSettlement(
      settlement.settlementId,
      input.attemptSequence,
    );

  return {
    payoutAttemptId,

    settlementUpdate: {
      status: "reserved",
      reservedAmountInCentavos:
        amount,
      activePayoutAttemptId:
        payoutAttemptId,
      lastPayoutAttemptId:
        payoutAttemptId,
      updatedAt:
        input.timestamp,
    },

    /*
     * Payout reservation belongs to settlement truth.
     *
     * The earning remains available until the gateway confirms
     * that the Provider actually received the payout.
     */
    earningUpdate: {
      updatedAt:
        input.timestamp,
    },

    payoutAttemptRecord: {
      schemaVersion: 1,
      payoutAttemptId,
      settlementId:
        settlement.settlementId,

      earningId:
        settlement.earningId,
      providerId:
        settlement.providerId,

      currency: "PHP",
      amountInCentavos:
        amount,

      status: "reserved",

      gateway: "paymongo",
      gatewayResourceId: null,

      failureCode: null,
      failureMessage: null,

      createdAt:
        input.timestamp,
      updatedAt:
        input.timestamp,

      submittedAt: null,
      completedAt: null,
    },
  };
}

/*
 * Marks a payout as successfully settled.
 *
 * Only here does Provider paid-out accounting increase.
 */
export function completeProviderSettlementPayout(
  input: {
    settlement: UnknownRecord;
    earning: UnknownRecord;
    payoutAttempt: UnknownRecord;
    timestamp: unknown;
  },
): {
  settlementUpdate: Record<string, unknown>;
  earningUpdate: Record<string, unknown>;
  payoutAttemptUpdate:
    Record<string, unknown>;
} {
  const settlement =
    validateSettlement(
      input.settlement,
    );

  const earning =
    validateEarning(
      settlement.earningId,
      input.earning,
    );

  const attempt =
    validatePayoutAttempt(
      input.payoutAttempt,
    );

  if (
    settlement.activePayoutAttemptId !==
      attempt.payoutAttemptId ||
    attempt.settlementId !==
      settlement.settlementId ||
    attempt.earningId !==
      settlement.earningId ||
    attempt.providerId !==
      settlement.providerId
  ) {
    throw settlementInvalid(
      "Payout attempt linkage is invalid.",
    );
  }

  if (
    settlement.status !== "reserved" &&
    settlement.status !== "processing"
  ) {
    throw settlementInvalid(
      "Provider settlement is not awaiting payout completion.",
    );
  }

  if (
    attempt.status !== "submitted" &&
    attempt.status !== "processing"
  ) {
    throw settlementInvalid(
      "Payout attempt is not awaiting completion.",
    );
  }

  const amount =
    attempt.amountInCentavos;

  if (
    amount !==
      settlement.reservedAmountInCentavos ||
    amount <= 0
  ) {
    throw settlementInvalid(
      "Reserved payout amount is invalid.",
    );
  }

  if (
    earning.pendingAmountInCentavos !==
      0 ||
    earning.availableAmountInCentavos <
      amount
  ) {
    throw settlementInvalid(
      "Available Provider earning amount is unavailable.",
    );
  }

  const availableAfter =
    earning.availableAmountInCentavos -
    amount;

  const paidAfter =
    checkedAdd(
      earning.paidAmountInCentavos,
      amount,
    );

  return {
    settlementUpdate: {
      status: "paid",
      reservedAmountInCentavos: 0,
      paidOutAmountInCentavos:
        amount,
      activePayoutAttemptId: null,
      lastPayoutAttemptId:
        attempt.payoutAttemptId,
      reconciliationRequired: false,
      reconciliationReason: null,
      paidOutAt:
        input.timestamp,
      updatedAt:
        input.timestamp,
    },

    earningUpdate: {
      status:
        availableAfter > 0
          ? "available"
          : "paid",

      availableAmountInCentavos:
        availableAfter,

      paidAmountInCentavos:
        paidAfter,

      updatedAt:
        input.timestamp,
    },

    payoutAttemptUpdate: {
      status: "succeeded",
      completedAt:
        input.timestamp,
      updatedAt:
        input.timestamp,
    },
  };
}

/*
 * A known safe failure releases the reservation back to "available".
 *
 * Ambiguous outcomes must NOT release funds because the Provider may
 * already have received the payout.
 */
export function failProviderSettlementPayout(
  input: {
    settlement: UnknownRecord;
    earning: UnknownRecord;
    payoutAttempt: UnknownRecord;
    certainty:
      | "failed"
      | "ambiguous";
    failureCode: string | null;
    failureMessage: string | null;
    timestamp: unknown;
  },
): {
  settlementUpdate: Record<string, unknown>;
  earningUpdate: Record<string, unknown>;
  payoutAttemptUpdate:
    Record<string, unknown>;
} {
  const settlement =
    validateSettlement(
      input.settlement,
    );

  const earning =
    validateEarning(
      settlement.earningId,
      input.earning,
    );

  const attempt =
    validatePayoutAttempt(
      input.payoutAttempt,
    );

  if (
    settlement.activePayoutAttemptId !==
      attempt.payoutAttemptId ||
    attempt.settlementId !==
      settlement.settlementId
  ) {
    throw settlementInvalid(
      "Payout failure linkage is invalid.",
    );
  }

  const amount =
    attempt.amountInCentavos;

  if (
    amount !==
      settlement.reservedAmountInCentavos
  ) {
    throw settlementInvalid(
      "Payout reservation amount is invalid.",
    );
  }

  if (input.certainty === "ambiguous") {
    return {
      settlementUpdate: {
        status:
          "reconciliation_required",
        reconciliationRequired: true,
        reconciliationReason:
          "payout_outcome_ambiguous",
        updatedAt:
          input.timestamp,
      },

      earningUpdate: {
        updatedAt:
          input.timestamp,
      },

      payoutAttemptUpdate: {
        status: "ambiguous",
        failureCode:
          input.failureCode,
        failureMessage:
          input.failureMessage,
        updatedAt:
          input.timestamp,
      },
    };
  }

  if (
    earning.pendingAmountInCentavos !==
      0 ||
    earning.availableAmountInCentavos <
      amount
  ) {
    throw settlementInvalid(
      "Available Provider earning amount is unavailable.",
    );
  }

  return {
    settlementUpdate: {
      status: "ready",
      reservedAmountInCentavos: 0,
      activePayoutAttemptId: null,
      reconciliationRequired: false,
      reconciliationReason: null,
      updatedAt:
        input.timestamp,
    },

    /*
     * The earning never left the available bucket.
     * A known-safe payout failure therefore changes no money bucket.
     */
    earningUpdate: {
      updatedAt:
        input.timestamp,
    },

    payoutAttemptUpdate: {
      status: "failed",
      failureCode:
        input.failureCode,
      failureMessage:
        input.failureMessage,
      completedAt:
        input.timestamp,
      updatedAt:
        input.timestamp,
    },
  };
}

/*
 * Customer refund and Provider payout are competing money movements.
 *
 * A refund may reach its gateway only while no Provider payout is
 * reserved, processing, paid or awaiting reconciliation.
 */
export function assertProviderSettlementRefundDispatchAllowed(
  input: {
    settlement: UnknownRecord;
    earningId: string;
    paymentId: string;
  },
): void {
  const settlement =
    validateSettlement(
      input.settlement,
    );

  if (
    settlement.earningId !==
      input.earningId ||
    settlement.paymentId !==
      input.paymentId
  ) {
    throw settlementInvalid(
      "Refund settlement linkage is invalid.",
    );
  }

  if (
    settlement.status ===
      "reserved" ||
    settlement.status ===
      "processing" ||
    settlement.status ===
      "reconciliation_required" ||
    settlement.status ===
      "paid" ||
    settlement.reservedAmountInCentavos >
      0 ||
    settlement.paidOutAmountInCentavos >
      0 ||
    settlement.activePayoutAttemptId !==
      null ||
    settlement.reconciliationRequired
  ) {
    throw settlementInvalid(
      "Provider payout activity requires reconciliation before refund dispatch.",
    );
  }
}

/*
 * Synchronizes settlement truth after a successful Customer refund
 * changes the canonical Provider earning.
 *
 * This helper never rewrites settlement history once payout activity
 * has started.
 */
export function buildProviderSettlementRefundUpdate(
  input: {
    settlement: UnknownRecord;
    earningId: string;
    paymentId: string;
    earningUpdate: UnknownRecord;
    timestamp: unknown;
  },
): Record<string, unknown> {
  assertProviderSettlementRefundDispatchAllowed({
    settlement:
      input.settlement,

    earningId:
      input.earningId,

    paymentId:
      input.paymentId,
  });

  const settlement =
    validateSettlement(
      input.settlement,
    );

  const reversed =
    input.earningUpdate
      .reversedAmountInCentavos;

  const net =
    input.earningUpdate
      .netEarningAmountInCentavos;

  const pending =
    input.earningUpdate
      .pendingAmountInCentavos;

  const available =
    input.earningUpdate
      .availableAmountInCentavos;

  const paid =
    input.earningUpdate
      .paidAmountInCentavos;

  for (
    const [label, value] of [
      ["reversed", reversed],
      ["net", net],
      ["pending", pending],
      ["available", available],
      ["paid", paid],
    ] as const
  ) {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw settlementInvalid(
        `Refund Provider earning ${label} amount is invalid.`,
      );
    }
  }

  const totalAfter =
    (reversed as number) +
    (net as number);

  const unpaidAfter =
    (pending as number) +
    (available as number);

  if (
    !Number.isSafeInteger(totalAfter) ||
    !Number.isSafeInteger(unpaidAfter) ||
    totalAfter !==
      settlement
        .originalEarningAmountInCentavos ||
    unpaidAfter !==
      net ||
    paid !== 0
  ) {
    throw settlementInvalid(
      "Refund Provider earning does not reconcile with settlement truth.",
    );
  }

  if (
    (pending as number) > 0 &&
    (available as number) > 0
  ) {
    throw settlementInvalid(
      "Refund Provider earning availability is ambiguous.",
    );
  }

  if (
    settlement.status ===
      "cancelled" &&
    net !== 0
  ) {
    throw settlementInvalid(
      "Cancelled Provider settlement cannot become payable again.",
    );
  }

  return {
    reversedAmountInCentavos:
      reversed,

    netSettlementAmountInCentavos:
      net,

    status:
      net === 0
        ? "cancelled"
        : (available as number) > 0
          ? "ready"
          : "awaiting_availability",

    updatedAt:
      input.timestamp,
  };
}

/*
 * Releases one canonical Provider earning for settlement only after
 * service-completion eligibility has been verified by the trusted
 * lifecycle transaction.
 *
 * Customer payment success alone never performs this transition.
 */
export function releaseProviderSettlementAvailability(
  input: {
    settlement: UnknownRecord;
    earning: UnknownRecord;
    timestamp: unknown;
  },
): {
  settlementUpdate:
    Record<string, unknown>;
  earningUpdate:
    Record<string, unknown>;
} {
  const settlement =
    validateSettlement(
      input.settlement,
    );

  const earning =
    validateEarning(
      settlement.earningId,
      input.earning,
    );

  if (
    earning.providerId !==
      settlement.providerId ||
    earning.paymentId !==
      settlement.paymentId ||
    earning.providerRequestId !==
      settlement.providerRequestId ||
    earning.mainEventId !==
      settlement.mainEventId ||
    earning.customerId !==
      settlement.customerId
  ) {
    throw settlementInvalid(
      "Settlement earning linkage is invalid.",
    );
  }

  if (
    settlement.status !==
      "awaiting_availability"
  ) {
    throw settlementInvalid(
      "Provider settlement is not awaiting availability.",
    );
  }

  if (
    settlement.reservedAmountInCentavos !==
      0 ||
    settlement.paidOutAmountInCentavos !==
      0 ||
    settlement.activePayoutAttemptId !==
      null ||
    settlement.reconciliationRequired
  ) {
    throw settlementInvalid(
      "Provider settlement already contains payout activity.",
    );
  }

  if (
    earning.paidAmountInCentavos !==
      0 ||
    earning.availableAmountInCentavos !==
      0
  ) {
    throw settlementInvalid(
      "Provider earning already contains released or paid money.",
    );
  }

  const netEarning =
    earning.earningAmountInCentavos -
    earning.reversedAmountInCentavos;

  if (
    !Number.isSafeInteger(netEarning) ||
    netEarning < 0 ||
    earning.pendingAmountInCentavos !==
      netEarning
  ) {
    throw settlementInvalid(
      "Provider earning is not fully represented by its pending balance.",
    );
  }

  if (netEarning === 0) {
    return {
      settlementUpdate: {
        status: "cancelled",

        reversedAmountInCentavos:
          earning.reversedAmountInCentavos,

        netSettlementAmountInCentavos:
          0,

        reconciliationRequired:
          false,

        reconciliationReason:
          null,

        updatedAt:
          input.timestamp,
      },

      earningUpdate: {
        status: "reversed",

        pendingAmountInCentavos: 0,

        availableAmountInCentavos: 0,

        updatedAt:
          input.timestamp,
      },
    };
  }

  return {
    settlementUpdate: {
      status: "ready",

      reversedAmountInCentavos:
        earning.reversedAmountInCentavos,

      netSettlementAmountInCentavos:
        netEarning,

      reconciliationRequired:
        false,

      reconciliationReason:
        null,

      availableAt:
        input.timestamp,

      updatedAt:
        input.timestamp,
    },

    earningUpdate: {
      status: "available",

      pendingAmountInCentavos: 0,

      availableAmountInCentavos:
        netEarning,

      availableAt:
        input.timestamp,

      updatedAt:
        input.timestamp,
    },
  };
}

function validateEarning(
  earningId: string,
  value: UnknownRecord,
): {
  earningId: string;
  paymentId: string;
  providerRequestId: string;
  mainEventId: string;
  providerId: string;
  customerId: string;

  earningAmountInCentavos: number;
  pendingAmountInCentavos: number;
  availableAmountInCentavos: number;
  paidAmountInCentavos: number;
  reversedAmountInCentavos: number;
} {
  if (
    value.schemaVersion !== 1 ||
    value.earningId !== earningId ||
    value.currency !== "PHP"
  ) {
    throw settlementInvalid(
      "Provider earning linkage is invalid.",
    );
  }

  const result = {
    earningId,
    paymentId:
      requireId(
        value.paymentId,
        "Payment",
      ),

    providerRequestId:
      requireId(
        value.providerRequestId,
        "Provider request",
      ),

    mainEventId:
      requireId(
        value.mainEventId,
        "Main event",
      ),

    providerId:
      requireId(
        value.providerId,
        "Provider",
      ),

    customerId:
      requireId(
        value.customerId,
        "Customer",
      ),

    earningAmountInCentavos:
      nonNegativeInteger(
        value.earningAmountInCentavos,
        "Provider earning amount",
      ),

    pendingAmountInCentavos:
      nonNegativeInteger(
        value.pendingAmountInCentavos,
        "Pending earning amount",
      ),

    availableAmountInCentavos:
      nonNegativeInteger(
        value.availableAmountInCentavos,
        "Available earning amount",
      ),

    paidAmountInCentavos:
      nonNegativeInteger(
        value.paidAmountInCentavos,
        "Paid earning amount",
      ),

    reversedAmountInCentavos:
      nonNegativeInteger(
        value.reversedAmountInCentavos,
        "Reversed earning amount",
      ),
  };

  const bucketTotal =
    checkedAdd(
      checkedAdd(
        result.pendingAmountInCentavos,
        result.availableAmountInCentavos,
      ),
      checkedAdd(
        result.paidAmountInCentavos,
        result.reversedAmountInCentavos,
      ),
    );

  if (
    bucketTotal !==
      result.earningAmountInCentavos
  ) {
    throw settlementInvalid(
      "Provider earning buckets do not reconcile.",
    );
  }

  return result;
}

function validateSettlement(
  value: UnknownRecord,
): ProviderSettlementRecord {
  if (
    value.schemaVersion !== 1 ||
    value.currency !== "PHP"
  ) {
    throw settlementInvalid(
      "Provider settlement is invalid.",
    );
  }

  const status =
    value.status;

  if (
    typeof status !== "string" ||
    !(
      PROVIDER_SETTLEMENT_STATUSES as
      readonly string[]
    ).includes(status)
  ) {
    throw settlementInvalid(
      "Provider settlement status is invalid.",
    );
  }

  const original =
    nonNegativeInteger(
      value.originalEarningAmountInCentavos,
      "Original earning amount",
    );

  const reversed =
    nonNegativeInteger(
      value.reversedAmountInCentavos,
      "Reversed earning amount",
    );

  const net =
    nonNegativeInteger(
      value.netSettlementAmountInCentavos,
      "Net settlement amount",
    );

  if (
    reversed > original ||
    original - reversed !== net
  ) {
    throw settlementInvalid(
      "Provider settlement amounts do not reconcile.",
    );
  }

  return {
    schemaVersion: 1,

    settlementId:
      requireId(
        value.settlementId,
        "Provider settlement",
      ),

    earningId:
      requireId(
        value.earningId,
        "Provider earning",
      ),

    paymentId:
      requireId(
        value.paymentId,
        "Payment",
      ),

    providerRequestId:
      requireId(
        value.providerRequestId,
        "Provider request",
      ),

    mainEventId:
      requireId(
        value.mainEventId,
        "Main event",
      ),

    providerId:
      requireId(
        value.providerId,
        "Provider",
      ),

    customerId:
      requireId(
        value.customerId,
        "Customer",
      ),

    currency: "PHP",

    originalEarningAmountInCentavos:
      original,

    reversedAmountInCentavos:
      reversed,

    netSettlementAmountInCentavos:
      net,

    reservedAmountInCentavos:
      nonNegativeInteger(
        value.reservedAmountInCentavos,
        "Reserved settlement amount",
      ),

    paidOutAmountInCentavos:
      nonNegativeInteger(
        value.paidOutAmountInCentavos,
        "Paid-out settlement amount",
      ),

    status:
      status as
        ProviderSettlementStatus,

    activePayoutAttemptId:
      optionalId(
        value.activePayoutAttemptId,
      ),

    lastPayoutAttemptId:
      optionalId(
        value.lastPayoutAttemptId,
      ),

    reconciliationRequired:
      value.reconciliationRequired === true,

    reconciliationReason:
      optionalText(
        value.reconciliationReason,
      ),

    createdAt:
      value.createdAt,

    updatedAt:
      value.updatedAt,

    paidOutAt:
      value.paidOutAt ?? null,
  };
}

function validatePayoutAttempt(
  value: UnknownRecord,
): ProviderPayoutAttemptRecord {
  if (
    value.schemaVersion !== 1 ||
    value.currency !== "PHP" ||
    value.gateway !== "paymongo"
  ) {
    throw settlementInvalid(
      "Provider payout attempt is invalid.",
    );
  }

  const status =
    value.status;

  if (
    typeof status !== "string" ||
    !(
      PROVIDER_PAYOUT_ATTEMPT_STATUSES as
      readonly string[]
    ).includes(status)
  ) {
    throw settlementInvalid(
      "Provider payout attempt status is invalid.",
    );
  }

  return {
    schemaVersion: 1,

    payoutAttemptId:
      requireId(
        value.payoutAttemptId,
        "Payout attempt",
      ),

    settlementId:
      requireId(
        value.settlementId,
        "Provider settlement",
      ),

    earningId:
      requireId(
        value.earningId,
        "Provider earning",
      ),

    providerId:
      requireId(
        value.providerId,
        "Provider",
      ),

    currency: "PHP",

    amountInCentavos:
      positiveInteger(
        value.amountInCentavos,
        "Payout amount",
      ),

    status:
      status as
        ProviderPayoutAttemptStatus,

    gateway: "paymongo",

    gatewayResourceId:
      optionalText(
        value.gatewayResourceId,
      ),

    failureCode:
      optionalText(
        value.failureCode,
      ),

    failureMessage:
      optionalText(
        value.failureMessage,
      ),

    createdAt:
      value.createdAt,

    updatedAt:
      value.updatedAt,

    submittedAt:
      value.submittedAt ?? null,

    completedAt:
      value.completedAt ?? null,
  };
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
    throw settlementInvalid(
      `${label} identity is invalid.`,
    );
  }

  return value;
}

function optionalId(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return requireId(
    value,
    "Optional",
  );
}

function optionalText(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    throw settlementInvalid(
      "Optional text value is invalid.",
    );
  }

  const normalized =
    value.trim();

  return normalized.length > 0
    ? normalized
    : null;
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  const parsed =
    nonNegativeInteger(
      value,
      label,
    );

  if (parsed === 0) {
    throw settlementInvalid(
      `${label} must be greater than zero.`,
    );
  }

  return parsed;
}

function nonNegativeInteger(
  value: unknown,
  label: string,
): number {
  if (
    Number.isSafeInteger(value) &&
    (value as number) >= 0
  ) {
    return value as number;
  }

  throw settlementInvalid(
    `${label} is invalid.`,
  );
}

function checkedAdd(
  left: number,
  right: number,
): number {
  const result =
    left + right;

  if (!Number.isSafeInteger(result)) {
    throw settlementInvalid(
      "Provider settlement amount exceeds the safe integer range.",
    );
  }

  return result;
}

function settlementInvalid(
  message: string,
): Error {
  return new Error(
    `Provider settlement invalid: ${message}`,
  );
}