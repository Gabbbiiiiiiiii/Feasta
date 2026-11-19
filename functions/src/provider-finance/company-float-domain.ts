import {createHash} from "node:crypto";

export const COMPANY_FLOAT_SCHEMA_VERSION = 1 as const;
export const COMPANY_PROVIDER_ADVANCE_SCHEMA_VERSION = 1 as const;
export const COMPANY_ADVANCE_REQUEST_SCHEMA_VERSION = 1 as const;
export const COMPANY_FLOAT_LEDGER_SCHEMA_VERSION = 1 as const;

export const COMPANY_FLOAT_DOC_PATH = {
  collection: "companyFinance",
  document: "float",
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

export function emptyCompanyFloat(): CompanyFloatSnapshot {
  return {
    schemaVersion: COMPANY_FLOAT_SCHEMA_VERSION,
    currency: "PHP",
    availableBalanceInCentavos: 0,
    outstandingAdvanceInCentavos: 0,
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

export function planCompanyFloatCommissionCredit(input: {
  float: CompanyFloatSnapshot;
  commissionInCentavos: number;
  alreadyCredited: boolean;
}): {
  float: CompanyFloatSnapshot;
  credited: boolean;
  amountInCentavos: number;
} {
  if (input.alreadyCredited) {
    return {
      float: input.float,
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
      float: input.float,
      credited: false,
      amountInCentavos: 0,
    };
  }

  return {
    float: {
      ...input.float,
      availableBalanceInCentavos: checkedAdd(
        input.float.availableBalanceInCentavos,
        input.commissionInCentavos,
      ),
    },
    credited: true,
    amountInCentavos: input.commissionInCentavos,
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
}): CompanyAdvanceRequestRecord {
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
}): {
  float: CompanyFloatSnapshot;
  advance: CompanyProviderAdvanceRecord;
  advancePayoutId: string;
} {
  if (input.requestStatus !== "pending") {
    throw companyFloatInvalid("Only pending advance requests can be approved.");
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

  return {
    float: {
      ...input.float,
      availableBalanceInCentavos:
        input.float.availableBalanceInCentavos - amountInCentavos,
      outstandingAdvanceInCentavos: checkedAdd(
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
      repaidAmountInCentavos: 0,
      outstandingAmountInCentavos: amountInCentavos,
      currency: "PHP",
      status: "outstanding",
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
