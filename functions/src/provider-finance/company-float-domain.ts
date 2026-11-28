import {createHash} from "node:crypto";

export const COMPANY_FLOAT_SCHEMA_VERSION = 1 as const;
export const COMPANY_COMMISSION_SCHEMA_VERSION = 1 as const;
export const COMPANY_PROVIDER_ADVANCE_SCHEMA_VERSION = 1 as const;
export const COMPANY_ADVANCE_REQUEST_SCHEMA_VERSION = 1 as const;
export const COMPANY_FLOAT_LEDGER_SCHEMA_VERSION = 1 as const;
export const COMPANY_ADVANCE_MAX_ATTEMPTS = 3 as const;

export const COMPANY_FLOAT_DOC_PATH = {
  collection: "companyFinance",
  document: "float",
} as const;

export const COMPANY_COMMISSION_DOC_PATH = {
  collection: "companyFinance",
  document: "commission",
} as const;

export const COMPANY_ADVANCE_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type CompanyAdvanceRequestStatus =
  (typeof COMPANY_ADVANCE_REQUEST_STATUSES)[number];

export const COMPANY_PROVIDER_ADVANCE_STATUSES = [
  "outstanding",
  "repaid",
  "cancelled",
] as const;

export type CompanyProviderAdvanceStatus =
  (typeof COMPANY_PROVIDER_ADVANCE_STATUSES)[number];

export type CompanyFloatSnapshot = {
  schemaVersion: typeof COMPANY_FLOAT_SCHEMA_VERSION;
  currency: "PHP";
  availableBalanceInCentavos: number;
  outstandingAdvanceInCentavos: number;
};

export type CompanyCommissionSnapshot = {
  schemaVersion: typeof COMPANY_COMMISSION_SCHEMA_VERSION;
  currency: "PHP";
  availableBalanceInCentavos: number;
  transferredToFloatInCentavos: number;
  withdrawnInCentavos: number;
};

export type CompanyAdvanceRequestRecord = {
  schemaVersion: typeof COMPANY_ADVANCE_REQUEST_SCHEMA_VERSION;
  advanceRequestId: string;
  providerRequestId: string;
  providerId: string;
  mainEventId: string;
  customerId: string;
  status: CompanyAdvanceRequestStatus;
  requestedByUid: string;
  providerNote: string | null;
};

export type CompanyProviderAdvanceRecord = {
  schemaVersion: typeof COMPANY_PROVIDER_ADVANCE_SCHEMA_VERSION;
  advanceId: string;
  advanceRequestId: string;
  providerRequestId: string;
  providerId: string;
  mainEventId: string | null;
  amountInCentavos: number;
  repaidAmountInCentavos: number;
  outstandingAmountInCentavos: number;
  currency: "PHP";
  status: CompanyProviderAdvanceStatus;
  mode: "mock";
  fundedFrom: "company_float";
  repaymentDestination: "company_float";
  issuedByAdminUid: string;
};

export function companyAdvanceRequestIdForProviderRequest(
  providerRequestId: string,
): string {
  const id = requireToken(providerRequestId, "Provider request");
  return `company_adv_req_${createHash("sha256")
    .update(["company-advance-request", id, "v1"].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
}

export function companyProviderAdvanceIdForRequest(
  advanceRequestId: string,
): string {
  const id = requireToken(advanceRequestId, "Advance request");
  return `company_adv_${createHash("sha256")
    .update(["company-provider-advance", id, "v1"].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
}

export function companyAdvancePayoutIdForAdvance(advanceId: string): string {
  const id = requireToken(advanceId, "Company advance");
  return `company_adv_pay_${createHash("sha256")
    .update(["company-advance-payout", id, "v1"].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
}

export function companyFloatCommissionLedgerId(paymentId: string): string {
  const id = requireToken(paymentId, "Payment");
  return `company_float_commission_${createHash("sha256")
    .update(["company-float-commission", id, "v1"].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
}

export function companyCommissionRefundLedgerId(
  refundOperationId: string,
): string {
  const id = requireToken(refundOperationId, "Refund operation");
  return `company_commission_refund_${createHash("sha256")
    .update(["company-commission-refund", id, "v1"].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
}

export function companyCommissionTransferLedgerId(
  clientRequestId: string,
): string {
  const id = requireToken(clientRequestId, "Client request");
  return `company_commission_to_float_${createHash("sha256")
    .update(["company-commission-to-float", id, "v1"].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
}

export function companyCommissionWithdrawalId(
  clientRequestId: string,
): string {
  const id = requireToken(clientRequestId, "Client request");
  return `company_commission_wd_${createHash("sha256")
    .update(["company-commission-withdrawal", id, "v1"].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
}

export function emptyCompanyFloat(): CompanyFloatSnapshot {
  return {
    schemaVersion: COMPANY_FLOAT_SCHEMA_VERSION,
    currency: "PHP",
    availableBalanceInCentavos: 0,
    outstandingAdvanceInCentavos: 0,
  };
}

export function emptyCompanyCommission(): CompanyCommissionSnapshot {
  return {
    schemaVersion: COMPANY_COMMISSION_SCHEMA_VERSION,
    currency: "PHP",
    availableBalanceInCentavos: 0,
    transferredToFloatInCentavos: 0,
    withdrawnInCentavos: 0,
  };
}

export function parseCompanyFloat(
  value: Readonly<Record<string, unknown>> | null | undefined,
): CompanyFloatSnapshot {
  if (!value) {
    return emptyCompanyFloat();
  }

  if (value.schemaVersion !== COMPANY_FLOAT_SCHEMA_VERSION) {
    throw companyFloatInvalid("Company float schema is invalid.");
  }

  if (value.currency !== "PHP") {
    throw companyFloatInvalid("Company float currency must be PHP.");
  }

  return {
    schemaVersion: COMPANY_FLOAT_SCHEMA_VERSION,
    currency: "PHP",
    availableBalanceInCentavos: nonNegativeCentavos(
      value.availableBalanceInCentavos,
      "Company float available balance",
    ),
    outstandingAdvanceInCentavos: nonNegativeCentavos(
      value.outstandingAdvanceInCentavos,
      "Company float outstanding advances",
    ),
  };
}

export function parseCompanyCommission(
  value: Readonly<Record<string, unknown>> | null | undefined,
): CompanyCommissionSnapshot {
  if (!value) {
    return emptyCompanyCommission();
  }

  if (value.schemaVersion !== COMPANY_COMMISSION_SCHEMA_VERSION) {
    throw companyFloatInvalid("Company commission schema is invalid.");
  }

  if (value.currency !== "PHP") {
    throw companyFloatInvalid("Company commission currency must be PHP.");
  }

  return {
    schemaVersion: COMPANY_COMMISSION_SCHEMA_VERSION,
    currency: "PHP",
    availableBalanceInCentavos: nonNegativeCentavos(
      value.availableBalanceInCentavos,
      "Company commission available balance",
    ),
    transferredToFloatInCentavos: nonNegativeCentavos(
      value.transferredToFloatInCentavos,
      "Company commission transferred to float",
    ),
    withdrawnInCentavos: nonNegativeCentavos(
      value.withdrawnInCentavos,
      "Company commission withdrawn",
    ),
  };
}

export function planCompanyFloatFunding(input: {
  float: CompanyFloatSnapshot;
  amountInCentavos: number;
}): CompanyFloatSnapshot {
  const amountInCentavos = positiveCentavos(
    input.amountInCentavos,
    "Company float funding amount",
  );

  return {
    ...input.float,
    availableBalanceInCentavos: checkedAdd(
      input.float.availableBalanceInCentavos,
      amountInCentavos,
    ),
  };
}

/**
 * Accrues FEASTA commission into the separate company commission wallet.
 * Commission is not auto-credited to company float; admin may later withdraw
 * or transfer available commission into float.
 */
export function planCompanyCommissionCredit(input: {
  commission: CompanyCommissionSnapshot;
  commissionInCentavos: number;
  alreadyCredited: boolean;
}): {
  commission: CompanyCommissionSnapshot;
  credited: boolean;
  amountInCentavos: number;
} {
  if (input.alreadyCredited) {
    return {
      commission: input.commission,
      credited: false,
      amountInCentavos: 0,
    };
  }

  if (
    !Number.isSafeInteger(input.commissionInCentavos) ||
    input.commissionInCentavos < 0
  ) {
    throw companyFloatInvalid("Commission amount is invalid.");
  }

  if (input.commissionInCentavos === 0) {
    return {
      commission: input.commission,
      credited: false,
      amountInCentavos: 0,
    };
  }

  return {
    commission: {
      ...input.commission,
      availableBalanceInCentavos: checkedAdd(
        input.commission.availableBalanceInCentavos,
        input.commissionInCentavos,
      ),
    },
    credited: true,
    amountInCentavos: input.commissionInCentavos,
  };
}

export function planCompanyCommissionTransferToFloat(input: {
  commission: CompanyCommissionSnapshot;
  float: CompanyFloatSnapshot;
  amountInCentavos: number;
}): {
  commission: CompanyCommissionSnapshot;
  float: CompanyFloatSnapshot;
  amountInCentavos: number;
} {
  const amountInCentavos = positiveCentavos(
    input.amountInCentavos,
    "Commission transfer amount",
  );

  if (amountInCentavos > input.commission.availableBalanceInCentavos) {
    throw companyFloatInvalid(
      "Transfer amount exceeds available commission.",
    );
  }

  return {
    amountInCentavos,
    commission: {
      ...input.commission,
      availableBalanceInCentavos:
        input.commission.availableBalanceInCentavos - amountInCentavos,
      transferredToFloatInCentavos: checkedAdd(
        input.commission.transferredToFloatInCentavos,
        amountInCentavos,
      ),
    },
    float: {
      ...input.float,
      availableBalanceInCentavos: checkedAdd(
        input.float.availableBalanceInCentavos,
        amountInCentavos,
      ),
    },
  };
}

export function planCompanyCommissionWithdrawal(input: {
  commission: CompanyCommissionSnapshot;
  amountInCentavos: number;
}): {
  commission: CompanyCommissionSnapshot;
  amountInCentavos: number;
} {
  const amountInCentavos = positiveCentavos(
    input.amountInCentavos,
    "Commission withdrawal amount",
  );

  if (amountInCentavos > input.commission.availableBalanceInCentavos) {
    throw companyFloatInvalid(
      "Withdrawal amount exceeds available commission.",
    );
  }

  return {
    amountInCentavos,
    commission: {
      ...input.commission,
      availableBalanceInCentavos:
        input.commission.availableBalanceInCentavos - amountInCentavos,
      withdrawnInCentavos: checkedAdd(
        input.commission.withdrawnInCentavos,
        amountInCentavos,
      ),
    },
  };
}

/**
 * Adjusts FEASTA's withdrawable commission wallet when a customer refund
 * reverses previously accrued service fees (or recognizes a default
 * cancellation fee). Clamped at zero so a refund after earlier admin
 * withdrawals never blocks refund completion.
 */
export function planCompanyCommissionRefundAdjustment(input: {
  commission: CompanyCommissionSnapshot;
  commissionReversedInCentavos: number;
  cancellationFeeEarnedInCentavos?: number;
  alreadyRecorded: boolean;
}): {
  commission: CompanyCommissionSnapshot;
  applied: boolean;
  netDeltaInCentavos: number;
} {
  if (input.alreadyRecorded) {
    return {
      commission: input.commission,
      applied: false,
      netDeltaInCentavos: 0,
    };
  }

  const reversed = input.commissionReversedInCentavos;
  const cancellationFee = input.cancellationFeeEarnedInCentavos ?? 0;

  if (
    !Number.isSafeInteger(reversed) ||
    reversed < 0 ||
    !Number.isSafeInteger(cancellationFee) ||
    cancellationFee < 0
  ) {
    throw companyFloatInvalid("Commission refund adjustment amount is invalid.");
  }

  const netDeltaInCentavos = cancellationFee - reversed;
  if (netDeltaInCentavos === 0) {
    return {
      commission: input.commission,
      applied: false,
      netDeltaInCentavos: 0,
    };
  }

  const nextAvailable =
    netDeltaInCentavos >= 0
      ? checkedAdd(input.commission.availableBalanceInCentavos, netDeltaInCentavos)
      : Math.max(0, input.commission.availableBalanceInCentavos + netDeltaInCentavos);

  return {
    commission: {
      ...input.commission,
      availableBalanceInCentavos: nextAvailable,
    },
    applied: true,
    netDeltaInCentavos,
  };
}

export function parseCompanyAdvanceAttemptCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    return 0;
  }
  return value as number;
}

export function remainingCompanyAdvanceAttempts(attemptCount: number): number {
  const used = Math.max(0, attemptCount);
  return Math.max(0, COMPANY_ADVANCE_MAX_ATTEMPTS - used);
}

/**
 * Next attempt number for a create/re-open. Rejected/cancelled requests may
 * retry until COMPANY_ADVANCE_MAX_ATTEMPTS is exhausted.
 */
export function planCompanyAdvanceAttemptCount(input: {
  existingAttemptCount: unknown;
  existingRequestStatus: string | null;
  requestExists: boolean;
}): {
  attemptCount: number;
  remainingAfterRequest: number;
} {
  if (!input.requestExists) {
    return {
      attemptCount: 1,
      remainingAfterRequest: COMPANY_ADVANCE_MAX_ATTEMPTS - 1,
    };
  }

  const used = parseCompanyAdvanceAttemptCount(input.existingAttemptCount);
  const priorAttempts = used > 0 ? used : 1;

  if (
    input.existingRequestStatus !== "rejected" &&
    input.existingRequestStatus !== "cancelled"
  ) {
    throw companyFloatInvalid(
      "An immediate funding request already exists for this booking.",
    );
  }

  if (priorAttempts >= COMPANY_ADVANCE_MAX_ATTEMPTS) {
    throw companyFloatInvalid(
      `You have used all ${COMPANY_ADVANCE_MAX_ATTEMPTS} immediate funding requests for this booking.`,
    );
  }

  const attemptCount = priorAttempts + 1;
  return {
    attemptCount,
    remainingAfterRequest: COMPANY_ADVANCE_MAX_ATTEMPTS - attemptCount,
  };
}

export function planCompanyAdvanceRequest(input: {
  providerRequestId: string;
  providerId: string;
  mainEventId: string;
  customerId: string;
  requestedByUid: string;
  providerNote: string | null;
  settlementStatus: string | null;
  existingRequestStatus: string | null;
  existingAdvanceStatus: string | null;
  existingAttemptCount?: unknown;
  requestExists?: boolean;
}): CompanyAdvanceRequestRecord & {
  attemptCount: number;
  remainingAfterRequest: number;
} {
  if (
    input.settlementStatus !== "deposit_settled" &&
    input.settlementStatus !== "fully_settled"
  ) {
    throw companyFloatInvalid(
      "Immediate funding can be requested only after the customer has paid.",
    );
  }

  if (input.existingRequestStatus === "pending") {
    throw companyFloatInvalid(
      "An immediate funding request is already pending for this booking.",
    );
  }

  if (
    input.existingRequestStatus === "approved" &&
    input.existingAdvanceStatus === "outstanding"
  ) {
    throw companyFloatInvalid(
      "This booking already has an outstanding company advance.",
    );
  }

  if (input.existingAdvanceStatus === "outstanding") {
    throw companyFloatInvalid(
      "This booking already has an outstanding company advance.",
    );
  }

  const attemptPlan = planCompanyAdvanceAttemptCount({
    existingAttemptCount: input.existingAttemptCount,
    existingRequestStatus: input.existingRequestStatus,
    requestExists: input.requestExists === true,
  });

  const advanceRequestId = companyAdvanceRequestIdForProviderRequest(
    input.providerRequestId,
  );

  return {
    schemaVersion: COMPANY_ADVANCE_REQUEST_SCHEMA_VERSION,
    advanceRequestId,
    providerRequestId: requireToken(input.providerRequestId, "Provider request"),
    providerId: requireToken(input.providerId, "Provider"),
    mainEventId: requireToken(input.mainEventId, "Main event"),
    customerId: requireToken(input.customerId, "Customer"),
    status: "pending",
    requestedByUid: requireToken(input.requestedByUid, "Requester"),
    providerNote: normalizeNote(input.providerNote),
    attemptCount: attemptPlan.attemptCount,
    remainingAfterRequest: attemptPlan.remainingAfterRequest,
  };
}

export function planCompanyAdvanceApproval(input: {
  float: CompanyFloatSnapshot;
  amountInCentavos: number;
  maxAmountInCentavos: number;
  advanceRequestId: string;
  providerRequestId: string;
  providerId: string;
  mainEventId: string | null;
  issuedByAdminUid: string;
  requestStatus: string;
  settlementStatus: unknown;
}): {
  float: CompanyFloatSnapshot;
  advance: CompanyProviderAdvanceRecord;
  advancePayoutId: string;
} {
  if (input.requestStatus !== "pending") {
    throw companyFloatInvalid("Only pending advance requests can be approved.");
  }

  if (
    input.settlementStatus !== "deposit_settled" &&
    input.settlementStatus !== "fully_settled"
  ) {
    throw companyFloatInvalid(
      "Customer payment must be deposit-settled or fully settled before advance approval.",
    );
  }

  const amountInCentavos = positiveCentavos(
    input.amountInCentavos,
    "Company advance amount",
  );

  if (amountInCentavos > input.maxAmountInCentavos) {
    throw companyFloatInvalid(
      "Advance amount exceeds the remaining provider entitlement for this booking.",
    );
  }

  if (input.float.availableBalanceInCentavos < amountInCentavos) {
    throw companyFloatInvalid(
      "Company float balance is insufficient for this advance.",
    );
  }

  const advanceId = companyProviderAdvanceIdForRequest(input.advanceRequestId);
  /*
   * Full payment: customer already settled the booking, so the provider does
   * not owe company float. Deposit path stays outstanding until remaining /
   * ordinary proceeds repay float.
   */
  const fullPaymentSettled = input.settlementStatus === "fully_settled";

  return {
    float: {
      ...input.float,
      availableBalanceInCentavos:
        input.float.availableBalanceInCentavos - amountInCentavos,
      outstandingAdvanceInCentavos: fullPaymentSettled
        ? input.float.outstandingAdvanceInCentavos
        : checkedAdd(
            input.float.outstandingAdvanceInCentavos,
            amountInCentavos,
          ),
    },
    advance: {
      schemaVersion: COMPANY_PROVIDER_ADVANCE_SCHEMA_VERSION,
      advanceId,
      advanceRequestId: requireToken(input.advanceRequestId, "Advance request"),
      providerRequestId: requireToken(
        input.providerRequestId,
        "Provider request",
      ),
      providerId: requireToken(input.providerId, "Provider"),
      mainEventId:
        input.mainEventId === null
          ? null
          : requireToken(input.mainEventId, "Main event"),
      amountInCentavos,
      repaidAmountInCentavos: fullPaymentSettled ? amountInCentavos : 0,
      outstandingAmountInCentavos: fullPaymentSettled ? 0 : amountInCentavos,
      currency: "PHP",
      status: fullPaymentSettled ? "repaid" : "outstanding",
      mode: "mock",
      fundedFrom: "company_float",
      repaymentDestination: "company_float",
      issuedByAdminUid: requireToken(input.issuedByAdminUid, "Admin"),
    },
    advancePayoutId: companyAdvancePayoutIdForAdvance(advanceId),
  };
}

export function planCompanyAdvanceRepayment(input: {
  float: CompanyFloatSnapshot;
  advance: Readonly<Record<string, unknown>>;
  repayAmountInCentavos: number;
}): {
  float: CompanyFloatSnapshot;
  advanceUpdate: {
    status: CompanyProviderAdvanceStatus;
    repaidAmountInCentavos: number;
    outstandingAmountInCentavos: number;
  };
  repaidAmountInCentavos: number;
} {
  if (input.advance.schemaVersion !== COMPANY_PROVIDER_ADVANCE_SCHEMA_VERSION) {
    throw companyFloatInvalid("Company advance schema is invalid.");
  }

  if (input.advance.status !== "outstanding") {
    throw companyFloatInvalid("Company advance is not outstanding.");
  }

  if (input.advance.repaymentDestination !== "company_float") {
    throw companyFloatInvalid("Company advance repayment destination is invalid.");
  }

  const outstanding = nonNegativeCentavos(
    input.advance.outstandingAmountInCentavos ?? input.advance.amountInCentavos,
    "Outstanding advance",
  );
  const alreadyRepaid = nonNegativeCentavos(
    input.advance.repaidAmountInCentavos ?? 0,
    "Repaid advance",
  );
  const repayAmount = positiveCentavos(
    input.repayAmountInCentavos,
    "Repayment amount",
  );

  if (repayAmount > outstanding) {
    throw companyFloatInvalid("Repayment exceeds outstanding company advance.");
  }

  if (input.float.outstandingAdvanceInCentavos < repayAmount) {
    throw companyFloatInvalid(
      "Company float outstanding advance balance is inconsistent.",
    );
  }

  const outstandingAfter = outstanding - repayAmount;
  const repaidAfter = checkedAdd(alreadyRepaid, repayAmount);

  return {
    float: {
      ...input.float,
      availableBalanceInCentavos: checkedAdd(
        input.float.availableBalanceInCentavos,
        repayAmount,
      ),
      outstandingAdvanceInCentavos:
        input.float.outstandingAdvanceInCentavos - repayAmount,
    },
    advanceUpdate: {
      status: outstandingAfter === 0 ? "repaid" : "outstanding",
      repaidAmountInCentavos: repaidAfter,
      outstandingAmountInCentavos: outstandingAfter,
    },
    repaidAmountInCentavos: repayAmount,
  };
}

export function providerRequestHasCustomerPayment(
  settlementStatus: unknown,
): boolean {
  return (
    settlementStatus === "deposit_settled" ||
    settlementStatus === "fully_settled"
  );
}

/**
 * Early-release helper for approved company advances.
 * Moves pending provider earnings into available so the provider
 * can use immediate funding without waiting for ordinary hold.
 */
export function planProviderEarningAdvanceAvailability(
  earning: Readonly<Record<string, unknown>>,
): {
  pendingAmountInCentavos: number;
  availableAmountInCentavos: number;
  status: "available" | "paid";
  releasedAmountInCentavos: number;
} | null {
  const pendingAmountInCentavos = nonNegativeCentavos(
    earning.pendingAmountInCentavos ?? 0,
    "Pending earning amount",
  );
  if (pendingAmountInCentavos <= 0) {
    return null;
  }

  const availableAmountInCentavos = nonNegativeCentavos(
    earning.availableAmountInCentavos ?? 0,
    "Available earning amount",
  );
  const paidAmountInCentavos = nonNegativeCentavos(
    earning.paidAmountInCentavos ?? 0,
    "Paid earning amount",
  );

  return {
    pendingAmountInCentavos: 0,
    availableAmountInCentavos: checkedAdd(
      availableAmountInCentavos,
      pendingAmountInCentavos,
    ),
    status: paidAmountInCentavos > 0 ? "paid" : "available",
    releasedAmountInCentavos: pendingAmountInCentavos,
  };
}

export function bookingPaymentIdsForEarnings(
  booking: Readonly<Record<string, unknown>>,
): string[] {
  const ids = new Set<string>();
  for (const key of [
    "initialPaymentId",
    "remainingBalancePaymentId",
  ] as const) {
    const value = booking[key];
    if (
      typeof value === "string" &&
      /^[A-Za-z0-9_-]{1,220}$/u.test(value)
    ) {
      ids.add(value);
    }
  }
  return [...ids];
}

/**
 * Provider advance/payout share is customer-collected gross minus trusted FEASTA commission.
 * Commission remains company float; provider receives the net only.
 */
export function computeProviderAdvanceAmounts(
  booking: Readonly<Record<string, unknown>>,
): {
  grossAmountInCentavos: number;
  commissionAmountInCentavos: number;
  providerNetAmountInCentavos: number;
} {
  const snapshot =
    booking.financialSnapshot &&
    typeof booking.financialSnapshot === "object" &&
    !Array.isArray(booking.financialSnapshot)
      ? (booking.financialSnapshot as Record<string, unknown>)
      : null;

  const grossCandidates = [
    booking.grossSettledAmountInCentavos,
    snapshot?.grossAmountInCentavos,
    booking.acceptedAmountInCentavos,
    typeof booking.amount === "number" && Number.isFinite(booking.amount)
      ? Math.round((booking.amount as number) * 100)
      : null,
  ];

  let grossAmountInCentavos: number | null = null;
  for (const value of grossCandidates) {
    if (Number.isSafeInteger(value) && (value as number) > 0) {
      grossAmountInCentavos = value as number;
      break;
    }
  }

  if (grossAmountInCentavos === null) {
    throw companyFloatInvalid(
      "Booking gross amount is unavailable for provider advance.",
    );
  }

  const commissionCandidates = [
    booking.commissionAccruedInCentavos,
    snapshot?.platformCommissionTotalInCentavos,
  ];

  let commissionAmountInCentavos = 0;
  for (const value of commissionCandidates) {
    if (Number.isSafeInteger(value) && (value as number) >= 0) {
      commissionAmountInCentavos = value as number;
      break;
    }
  }

  if (commissionAmountInCentavos > grossAmountInCentavos) {
    throw companyFloatInvalid(
      "Commission exceeds booking gross amount.",
    );
  }

  const providerNetAmountInCentavos =
    grossAmountInCentavos - commissionAmountInCentavos;

  if (providerNetAmountInCentavos <= 0) {
    throw companyFloatInvalid(
      "No provider net amount remains after commission.",
    );
  }

  return {
    grossAmountInCentavos,
    commissionAmountInCentavos,
    providerNetAmountInCentavos,
  };
}

function normalizeNote(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > 500) {
    throw companyFloatInvalid("Provider note is too long.");
  }
  return trimmed;
}

function requireToken(value: string, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,220}$/u.test(value)) {
    throw companyFloatInvalid(`${label} reference is invalid.`);
  }
  return value;
}

function nonNegativeCentavos(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw companyFloatInvalid(`${label} is invalid.`);
  }
  return value as number;
}

function positiveCentavos(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw companyFloatInvalid(`${label} is invalid.`);
  }
  return value as number;
}

function checkedAdd(left: number, right: number): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum < 0) {
    throw companyFloatInvalid("Monetary total overflowed.");
  }
  return sum;
}

function companyFloatInvalid(message: string): Error {
  return new Error(`company_float: ${message}`);
}
