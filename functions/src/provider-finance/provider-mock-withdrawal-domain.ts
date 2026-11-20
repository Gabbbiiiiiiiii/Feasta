import {createHash} from "node:crypto";

export const MOCK_WITHDRAWAL_DESTINATION_TYPES = [
  "gcash",
  "bank",
] as const;

export type MockWithdrawalDestinationType =
  (typeof MOCK_WITHDRAWAL_DESTINATION_TYPES)[number];

export type MockWithdrawalDestinationInput = {
  type: MockWithdrawalDestinationType;
  accountName: string;
  mobileNumber?: string;
  bankName?: string;
  accountNumber?: string;
};

export type MockWithdrawalMaskedDestination = {
  type: MockWithdrawalDestinationType;
  accountName: string;
  mobileMasked: string | null;
  bankName: string | null;
  accountNumberMasked: string | null;
};

export type MockWithdrawalSource = {
  settlement: Record<string, unknown>;
  earning: Record<string, unknown>;
};

export type MockWithdrawalAllocation = {
  settlementId: string;
  earningId: string;
  amountInCentavos: number;
  payoutAttemptId: string;
};

export type MockWithdrawalPlan = {
  withdrawalId: string;
  amountInCentavos: number;
  allocations: MockWithdrawalAllocation[];
  destination: MockWithdrawalMaskedDestination;
};

type ParsedSettlement = {
  settlementId: string;
  earningId: string;
  providerId: string;
  paymentId: string;
  status: string;
  netSettlementAmountInCentavos: number;
  reservedAmountInCentavos: number;
  paidOutAmountInCentavos: number;
  activePayoutAttemptId: string | null;
  reconciliationRequired: boolean;
  createdAtMillis: number;
};

type ParsedEarning = {
  earningId: string;
  providerId: string;
  paymentId: string;
  pendingAmountInCentavos: number;
  availableAmountInCentavos: number;
  paidAmountInCentavos: number;
  earningAmountInCentavos: number;
  reversedAmountInCentavos: number;
};

const FORBIDDEN_BROWSER_FIELDS = [
  "paymongoAccountId",
  "payMongoAccountId",
  "payoutReady",
  "accountId",
  "account_id",
  "orgId",
  "childAccountId",
  "child_account_id",
  "invitationId",
  "status",
  "settlementId",
  "earningId",
  "paidOutAmountInCentavos",
  "availableAmountInCentavos",
  "paidAmountInCentavos",
] as const;

export function mockWithdrawalIdForRequest(
  providerId: string,
  clientRequestId: string,
): string {
  const provider = requireToken(providerId, "Provider");
  const request = requireToken(clientRequestId, "Client request");

  return `mock_wd_${createHash("sha256")
    .update(["provider-mock-withdrawal", provider, request, "v1"].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
}

export function mockPayoutAttemptIdForAllocation(
  withdrawalId: string,
  settlementId: string,
  sequence: number,
): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw mockInvalid("Payout attempt sequence is invalid.");
  }

  return `mock_payout_${createHash("sha256")
    .update([
      "provider-mock-withdrawal",
      requireToken(withdrawalId, "Mock withdrawal"),
      requireToken(settlementId, "Provider settlement"),
      String(sequence),
      "v1",
    ].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
}

export function parseMockWithdrawalRequest(
  value: unknown,
): {
  clientRequestId: string;
  amountInCentavos: number;
  destination: MockWithdrawalDestinationInput;
} {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    throw mockInvalid("Withdrawal request must be an object.");
  }

  const input = value as Record<string, unknown>;
  const forbidden = FORBIDDEN_BROWSER_FIELDS.filter((field) => field in input);
  if (forbidden.length > 0) {
    throw mockInvalid("Withdrawal authority cannot be supplied by the browser.");
  }

  const allowed = new Set([
    "clientRequestId",
    "amountInCentavos",
    "destinationType",
    "accountName",
    "mobileNumber",
    "bankName",
    "accountNumber",
  ]);

  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw mockInvalid(`Unknown withdrawal field: ${key}.`);
    }
  }

  const clientRequestId = requireToken(
    input.clientRequestId,
    "Client request",
  );

  if (
    typeof clientRequestId !== "string" ||
    clientRequestId.length < 8 ||
    clientRequestId.length > 80
  ) {
    throw mockInvalid("Client request identity is invalid.");
  }

  const amountInCentavos = requirePositiveCentavos(
    input.amountInCentavos,
    "Withdrawal amount",
  );

  const destinationType = input.destinationType;
  if (
    destinationType !== "gcash" &&
    destinationType !== "bank"
  ) {
    throw mockInvalid("Choose GCash or bank transfer.");
  }

  const accountName = requireDisplayName(input.accountName, "Account name");

  if (destinationType === "gcash") {
    const mobileNumber = requireMobile(input.mobileNumber);
    return {
      clientRequestId,
      amountInCentavos,
      destination: {
        type: "gcash",
        accountName,
        mobileNumber,
      },
    };
  }

  const bankName = requireDisplayName(input.bankName, "Bank name");
  const accountNumber = requireAccountNumber(input.accountNumber);

  return {
    clientRequestId,
    amountInCentavos,
    destination: {
      type: "bank",
      accountName,
      bankName,
      accountNumber,
    },
  };
}

export function maskMockWithdrawalDestination(
  destination: MockWithdrawalDestinationInput,
): MockWithdrawalMaskedDestination {
  if (destination.type === "gcash") {
    return {
      type: "gcash",
      accountName: destination.accountName,
      mobileMasked: maskTrailing(
        destination.mobileNumber ?? "",
        4,
      ),
      bankName: null,
      accountNumberMasked: null,
    };
  }

  return {
    type: "bank",
    accountName: destination.accountName,
    mobileMasked: null,
    bankName: destination.bankName ?? null,
    accountNumberMasked: maskTrailing(
      destination.accountNumber ?? "",
      4,
    ),
  };
}

export function planMockWithdrawal(input: {
  providerId: string;
  withdrawalId: string;
  amountInCentavos: number;
  sources: MockWithdrawalSource[];
  destination: MockWithdrawalDestinationInput;
}): MockWithdrawalPlan {
  const providerId = requireToken(input.providerId, "Provider");
  const amountInCentavos = requirePositiveCentavos(
    input.amountInCentavos,
    "Withdrawal amount",
  );

  const rows = input.sources
    .map((source) => {
      const settlement = parseSettlement(source.settlement);
      const earning = parseEarning(settlement.earningId, source.earning);

      if (
        settlement.providerId !== providerId ||
        earning.providerId !== providerId ||
        settlement.paymentId !== earning.paymentId
      ) {
        throw mockInvalid("Settlement earning linkage is invalid.");
      }

      return {settlement, earning};
    })
    .filter(({settlement}) => {
      return (
        settlement.status === "ready" &&
        !settlement.reconciliationRequired &&
        settlement.activePayoutAttemptId === null &&
        settlement.reservedAmountInCentavos === 0
      );
    })
    .sort((left, right) => {
      if (left.settlement.createdAtMillis !== right.settlement.createdAtMillis) {
        return left.settlement.createdAtMillis - right.settlement.createdAtMillis;
      }

      return left.settlement.settlementId.localeCompare(
        right.settlement.settlementId,
      );
    });

  const availableTotal = rows.reduce((sum, row) => {
    return checkedAdd(sum, payableRemaining(row.settlement, row.earning));
  }, 0);

  if (amountInCentavos > availableTotal) {
    throw mockInvalid("Withdrawal amount exceeds available earnings.");
  }

  let remaining = amountInCentavos;
  const allocations: MockWithdrawalAllocation[] = [];
  const earningRemaining = new Map<string, number>();

  for (const row of rows) {
    if (remaining <= 0) {
      break;
    }

    const priorEarningLeft =
      earningRemaining.get(row.earning.earningId) ??
      row.earning.availableAmountInCentavos;

    const settlementLeft = payableRemaining(
      row.settlement,
      {
        ...row.earning,
        availableAmountInCentavos: priorEarningLeft,
      },
    );

    if (settlementLeft <= 0) {
      continue;
    }

    const take = Math.min(remaining, settlementLeft);
    const sequence = allocations.length + 1;

    allocations.push({
      settlementId: row.settlement.settlementId,
      earningId: row.earning.earningId,
      amountInCentavos: take,
      payoutAttemptId: mockPayoutAttemptIdForAllocation(
        input.withdrawalId,
        row.settlement.settlementId,
        sequence,
      ),
    });

    earningRemaining.set(
      row.earning.earningId,
      priorEarningLeft - take,
    );
    remaining -= take;
  }

  if (remaining !== 0 || allocations.length === 0) {
    throw mockInvalid("No payable settlements are available for this withdrawal.");
  }

  const plannedTotal = allocations.reduce(
    (sum, allocation) => checkedAdd(sum, allocation.amountInCentavos),
    0,
  );

  if (plannedTotal !== amountInCentavos) {
    throw mockInvalid("Withdrawal plan amount mismatch.");
  }

  return {
    withdrawalId: requireToken(input.withdrawalId, "Mock withdrawal"),
    amountInCentavos,
    allocations,
    destination: maskMockWithdrawalDestination(input.destination),
  };
}

export function applyMockWithdrawalAllocation(input: {
  settlement: Record<string, unknown>;
  earning: Record<string, unknown>;
  allocation: MockWithdrawalAllocation;
  withdrawalId: string;
  destination: MockWithdrawalMaskedDestination;
  timestamp: unknown;
}): {
  settlementUpdate: Record<string, unknown>;
  earningUpdate: Record<string, unknown>;
  payoutAttemptRecord: Record<string, unknown>;
} {
  const settlement = parseSettlement(input.settlement);
  const earning = parseEarning(settlement.earningId, input.earning);
  const amount = requirePositiveCentavos(
    input.allocation.amountInCentavos,
    "Allocation amount",
  );

  if (
    settlement.settlementId !== input.allocation.settlementId ||
    earning.earningId !== input.allocation.earningId
  ) {
    throw mockInvalid("Allocation linkage is invalid.");
  }

  if (
    settlement.status !== "ready" ||
    settlement.reconciliationRequired ||
    settlement.activePayoutAttemptId !== null ||
    settlement.reservedAmountInCentavos !== 0
  ) {
    throw mockInvalid("Provider settlement is not ready for mock withdrawal.");
  }

  const remaining = payableRemaining(settlement, earning);
  if (amount > remaining) {
    throw mockInvalid("Allocation exceeds payable settlement remaining.");
  }

  const availableAfter = earning.availableAmountInCentavos - amount;
  const paidAfter = checkedAdd(earning.paidAmountInCentavos, amount);
  const paidOutAfter = checkedAdd(settlement.paidOutAmountInCentavos, amount);
  const fullyPaid = paidOutAfter >= settlement.netSettlementAmountInCentavos;

  if (availableAfter < 0 || paidOutAfter > settlement.netSettlementAmountInCentavos) {
    throw mockInvalid("Mock withdrawal amounts do not reconcile.");
  }

  const earningStatus =
    availableAfter > 0
      ? "available"
      : earning.pendingAmountInCentavos > 0
        ? "pending"
        : "paid";

  return {
    settlementUpdate: {
      status: fullyPaid ? "paid" : "ready",
      paidOutAmountInCentavos: paidOutAfter,
      reservedAmountInCentavos: 0,
      activePayoutAttemptId: null,
      lastPayoutAttemptId: input.allocation.payoutAttemptId,
      reconciliationRequired: false,
      reconciliationReason: null,
      paidOutAt: fullyPaid ? input.timestamp : settlementPaidOutAt(input.settlement),
      updatedAt: input.timestamp,
      mockWithdrawalId: input.withdrawalId,
    },
    earningUpdate: {
      status: earningStatus,
      availableAmountInCentavos: availableAfter,
      paidAmountInCentavos: paidAfter,
      updatedAt: input.timestamp,
    },
    payoutAttemptRecord: {
      schemaVersion: 1,
      payoutAttemptId: input.allocation.payoutAttemptId,
      settlementId: settlement.settlementId,
      earningId: earning.earningId,
      providerId: settlement.providerId,
      currency: "PHP",
      amountInCentavos: amount,
      status: "succeeded",
      gateway: "mock",
      gatewayResourceId: input.withdrawalId,
      failureCode: null,
      failureMessage: null,
      mockWithdrawalId: input.withdrawalId,
      destinationSnapshot: input.destination,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
      submittedAt: input.timestamp,
      completedAt: input.timestamp,
    },
  };
}

export function buildMockWithdrawalRecord(input: {
  plan: MockWithdrawalPlan;
  providerId: string;
  clientRequestId: string;
  timestamp: unknown;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    withdrawalId: input.plan.withdrawalId,
    providerId: requireToken(input.providerId, "Provider"),
    clientRequestId: requireToken(input.clientRequestId, "Client request"),
    mode: "mock",
    currency: "PHP",
    amountInCentavos: input.plan.amountInCentavos,
    status: "succeeded",
    destination: input.plan.destination,
    allocations: input.plan.allocations.map((allocation) => ({
      settlementId: allocation.settlementId,
      earningId: allocation.earningId,
      amountInCentavos: allocation.amountInCentavos,
      payoutAttemptId: allocation.payoutAttemptId,
    })),
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    completedAt: input.timestamp,
  };
}

function payableRemaining(
  settlement: ParsedSettlement,
  earning: ParsedEarning,
): number {
  const settlementLeft =
    settlement.netSettlementAmountInCentavos -
    settlement.paidOutAmountInCentavos;

  if (settlementLeft <= 0 || earning.availableAmountInCentavos <= 0) {
    return 0;
  }

  return Math.min(settlementLeft, earning.availableAmountInCentavos);
}

function parseSettlement(
  value: Record<string, unknown>,
): ParsedSettlement {
  if (value.schemaVersion !== 1 || value.currency !== "PHP") {
    throw mockInvalid("Provider settlement is invalid.");
  }

  const net = nonNegativeInteger(
    value.netSettlementAmountInCentavos,
    "Net settlement amount",
  );
  const paidOut = nonNegativeInteger(
    value.paidOutAmountInCentavos,
    "Paid out amount",
  );

  if (paidOut > net) {
    throw mockInvalid("Provider settlement paid-out amount is invalid.");
  }

  return {
    settlementId: requireToken(value.settlementId, "Provider settlement"),
    earningId: requireToken(value.earningId, "Provider earning"),
    providerId: requireToken(value.providerId, "Provider"),
    paymentId: requireToken(value.paymentId, "Payment"),
    status: typeof value.status === "string" ? value.status : "",
    netSettlementAmountInCentavos: net,
    reservedAmountInCentavos: nonNegativeInteger(
      value.reservedAmountInCentavos,
      "Reserved amount",
    ),
    paidOutAmountInCentavos: paidOut,
    activePayoutAttemptId:
      value.activePayoutAttemptId == null
        ? null
        : requireToken(value.activePayoutAttemptId, "Active payout attempt"),
    reconciliationRequired: value.reconciliationRequired === true,
    createdAtMillis: createdAtMillis(value.createdAt),
  };
}

function parseEarning(
  earningId: string,
  value: Record<string, unknown>,
): ParsedEarning {
  if (
    value.schemaVersion !== 1 ||
    value.currency !== "PHP" ||
    value.earningId !== earningId
  ) {
    throw mockInvalid("Provider earning linkage is invalid.");
  }

  const result = {
    earningId: requireToken(value.earningId, "Provider earning"),
    providerId: requireToken(value.providerId, "Provider"),
    paymentId: requireToken(value.paymentId, "Payment"),
    pendingAmountInCentavos: nonNegativeInteger(
      value.pendingAmountInCentavos,
      "Pending earning amount",
    ),
    availableAmountInCentavos: nonNegativeInteger(
      value.availableAmountInCentavos,
      "Available earning amount",
    ),
    paidAmountInCentavos: nonNegativeInteger(
      value.paidAmountInCentavos,
      "Paid earning amount",
    ),
    earningAmountInCentavos: nonNegativeInteger(
      value.earningAmountInCentavos,
      "Provider earning amount",
    ),
    reversedAmountInCentavos: nonNegativeInteger(
      value.reversedAmountInCentavos,
      "Reversed earning amount",
    ),
  };

  const bucketTotal =
    result.pendingAmountInCentavos +
    result.availableAmountInCentavos +
    result.paidAmountInCentavos +
    result.reversedAmountInCentavos;

  if (bucketTotal !== result.earningAmountInCentavos) {
    throw mockInvalid("Provider earning buckets do not reconcile.");
  }

  return result;
}

function settlementPaidOutAt(
  settlement: Record<string, unknown>,
): unknown {
  return settlement.paidOutAt ?? null;
}

function createdAtMillis(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as {toMillis?: unknown}).toMillis === "function"
  ) {
    const millis = (value as {toMillis: () => number}).toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }

  if (typeof value === "string" || typeof value === "number") {
    const millis = new Date(value).getTime();
    return Number.isFinite(millis) ? millis : 0;
  }

  return 0;
}

function maskTrailing(value: string, visible: number): string {
  const normalized = value.replace(/\s+/gu, "");
  if (normalized.length <= visible) {
    return normalized;
  }

  return `${"•".repeat(Math.min(normalized.length - visible, 8))}${normalized.slice(-visible)}`;
}

function requireToken(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9:_-]{1,220}$/u.test(value)
  ) {
    throw mockInvalid(`${label} identity is invalid.`);
  }

  return value;
}

function requireDisplayName(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw mockInvalid(`${label} is required.`);
  }

  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length < 2 || normalized.length > 80) {
    throw mockInvalid(`${label} must be between 2 and 80 characters.`);
  }

  if (!/^[A-Za-z0-9 .,'()-]+$/u.test(normalized)) {
    throw mockInvalid(`${label} contains invalid characters.`);
  }

  return normalized;
}

function requireMobile(value: unknown): string {
  if (typeof value !== "string") {
    throw mockInvalid("GCash mobile number is required.");
  }

  const digits = value.replace(/\D/gu, "");
  let normalized = digits;

  if (normalized.startsWith("63") && normalized.length === 12) {
    normalized = `0${normalized.slice(2)}`;
  }

  if (!/^09\d{9}$/u.test(normalized)) {
    throw mockInvalid("Enter a valid Philippine mobile number.");
  }

  return normalized;
}

function requireAccountNumber(value: unknown): string {
  if (typeof value !== "string") {
    throw mockInvalid("Bank account number is required.");
  }

  const normalized = value.replace(/[\s-]/gu, "");
  if (!/^\d{8,20}$/u.test(normalized)) {
    throw mockInvalid("Enter a valid bank account number.");
  }

  return normalized;
}

function requirePositiveCentavos(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw mockInvalid(`${label} must be greater than zero.`);
  }

  return value as number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw mockInvalid(`${label} is invalid.`);
  }

  return value as number;
}

function checkedAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw mockInvalid("Withdrawal amount exceeds the safe integer range.");
  }

  return result;
}

function mockInvalid(message: string): Error {
  return new Error(`Provider mock withdrawal invalid: ${message}`);
}
