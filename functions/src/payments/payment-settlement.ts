import {
  Timestamp,
} from "firebase-admin/firestore";

import {
  parseInitialPaymentChoice,
  paymentIdForProviderRequestChoice,
  providerPaymentObligationForChoice,
  type CustomerPaymentChoice,
  type InitialPaymentChoice,
} from "./payment-obligation.js";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

export type ProviderRequestSettlementStatus =
  | "unpaid"
  | "initial_payment_processing"
  | "deposit_settled"
  | "balance_payment_processing"
  | "fully_settled";

export type ProviderSettlementPayment = {
  id: string;
  data: UnknownRecord;
};

export type ProviderRequestSettlement = {
  schemaVersion: 1;

  status:
    ProviderRequestSettlementStatus;

  initialPaymentChoice:
    InitialPaymentChoice | null;

  initialPaymentId:
    string | null;

  remainingBalancePaymentId:
    string | null;

  grossAmountInCentavos:
    number;

  grossSettledAmountInCentavos:
    number;

  outstandingAmountInCentavos:
    number;

  fullySettled:
    boolean;

  settledPaymentIds:
    readonly string[];

  unresolvedPaymentIds:
    readonly string[];
};

/**
 * Historical gross settlement is intentionally independent
 * from refund accounting.
 *
 * A paid payment that is later partially/fully refunded still
 * represents money that was authoritatively settled at the
 * gateway. Refunds must not silently reopen a balance obligation.
 */
const SETTLED_PAYMENT_STATUSES =
  new Set([
    "paid",
    "partially_refunded",
    "refunded",
  ]);

const UNRESOLVED_PAYMENT_STATUSES =
  new Set([
    "pending",
    "processing",
  ]);

const NON_SETTLED_TERMINAL_STATUSES =
  new Set([
    "failed",
    "expired",
    "cancelled",
  ]);

export function resolveProviderRequestSettlement(
  input: {
    providerRequestId: string;

    providerRequest:
      UnknownRecord;

    payments:
      readonly ProviderSettlementPayment[];
  },
): ProviderRequestSettlement {
  const {
    providerRequestId,
    providerRequest,
  } = input;

  const financial =
    requireFinancialSnapshot(
      providerRequest,
    );

  const minimumId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      "minimum",
    );

  const fullId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      "full",
    );

  const balanceId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      "remaining_balance",
    );

  const expectedIds =
    new Set([
      minimumId,
      fullId,
      balanceId,
    ]);

  const paymentById =
    new Map<
      string,
      ProviderSettlementPayment
    >();

  for (const payment of input.payments) {
    if (
      !expectedIds.has(payment.id) ||
      paymentById.has(payment.id)
    ) {
      throw settlementInvalid();
    }

    paymentById.set(
      payment.id,
      payment,
    );
  }

  const minimumPayment =
    paymentById.get(minimumId);

  const fullPayment =
    paymentById.get(fullId);

  const balancePayment =
    paymentById.get(balanceId);

  /*
   * Minimum and full are alternative initial obligations.
   * P5-B2 prevents both from being created. Seeing both here
   * therefore means stored payment history needs reconciliation.
   */
  if (
    minimumPayment &&
    fullPayment
  ) {
    throw settlementInvalid();
  }

  const storedChoiceValue =
    providerRequest
      .initialPaymentChoice;

  const storedInitialPaymentId =
    providerRequest
      .initialPaymentId;

  const initialSelectionAbsent =
    (
      storedChoiceValue ===
        undefined ||
      storedChoiceValue === null
    ) &&
    (
      storedInitialPaymentId ===
        undefined ||
      storedInitialPaymentId === null
    );

  if (initialSelectionAbsent) {
    if (
      minimumPayment ||
      fullPayment ||
      balancePayment ||
      providerRequest.paymentId != null ||
      providerRequest
        .remainingBalancePaymentId != null
    ) {
      throw settlementInvalid();
    }

    return {
      schemaVersion: 1,
      status: "unpaid",

      initialPaymentChoice:
        null,

      initialPaymentId:
        null,

      remainingBalancePaymentId:
        null,

      grossAmountInCentavos:
        financial.grossAmountInCentavos,

      grossSettledAmountInCentavos:
        0,

      outstandingAmountInCentavos:
        financial.grossAmountInCentavos,

      fullySettled:
        false,

      settledPaymentIds: [],
      unresolvedPaymentIds: [],
    };
  }

  const initialChoice =
    parseInitialPaymentChoice(
      storedChoiceValue,
    );

  if (!initialChoice) {
    throw settlementInvalid();
  }

  const expectedInitialId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      initialChoice,
    );

  if (
    storedInitialPaymentId !==
      expectedInitialId
  ) {
    throw settlementInvalid();
  }

  const currentPaymentId =
    optionalStoredId(
      providerRequest.paymentId,
    );

  const storedBalancePaymentId =
    optionalStoredId(
      providerRequest
        .remainingBalancePaymentId,
    );

  if (
    currentPaymentId &&
    currentPaymentId !==
      expectedInitialId &&
    currentPaymentId !==
      balanceId
  ) {
    throw settlementInvalid();
  }

  if (
    storedBalancePaymentId &&
    storedBalancePaymentId !==
      balanceId
  ) {
    throw settlementInvalid();
  }

  if (
    initialChoice === "full" &&
    (
      balancePayment ||
      storedBalancePaymentId
    )
  ) {
    throw settlementInvalid();
  }

  const initialPayment =
    initialChoice === "minimum"
      ? minimumPayment
      : fullPayment;

  if (!initialPayment) {
    /*
     * Once the initial choice is reserved, the corresponding
     * payment document is required. Missing it is not "unpaid";
     * it is inconsistent server state.
     */
    throw settlementInvalid();
  }

  const initialState =
    validatePayment({
      providerRequestId,
      providerRequest,
      payment:
        initialPayment,
      paymentChoice:
        initialChoice,
    });

  if (balancePayment) {
    if (
      initialChoice !== "minimum" ||
      storedBalancePaymentId !==
        balanceId
    ) {
      throw settlementInvalid();
    }
  }
  else if (storedBalancePaymentId) {
    /*
     * A reserved balance pointer must have its corresponding
     * payment document.
     */
    throw settlementInvalid();
  }

  const balanceState =
    balancePayment
      ? validatePayment({
          providerRequestId,
          providerRequest,
          payment:
            balancePayment,
          paymentChoice:
            "remaining_balance",
        })
      : null;

  /*
   * The balance cannot become an active/settled obligation
   * until the minimum initial obligation has settled.
   */
  if (
    balanceState &&
    (
      balanceState === "settled" ||
      balanceState === "unresolved"
    ) &&
    initialState !== "settled"
  ) {
    throw settlementInvalid();
  }

  const initialObligation =
    providerPaymentObligationForChoice({
      financialSnapshot:
        providerRequest
          .financialSnapshot,

      paymentChoice:
        initialChoice,
    });

  if (!initialObligation) {
    throw settlementInvalid();
  }

  const balanceObligation =
    providerPaymentObligationForChoice({
      financialSnapshot:
        providerRequest
          .financialSnapshot,

      paymentChoice:
        "remaining_balance",
    });

  let grossSettledAmountInCentavos =
    initialState === "settled"
      ? initialObligation
          .amountInCentavos
      : 0;

  const settledPaymentIds:
    string[] = [];

  const unresolvedPaymentIds:
    string[] = [];

  if (initialState === "settled") {
    settledPaymentIds.push(
      initialPayment.id,
    );
  }

  if (initialState === "unresolved") {
    unresolvedPaymentIds.push(
      initialPayment.id,
    );
  }

  if (balancePayment) {
    if (!balanceObligation) {
      throw settlementInvalid();
    }

    if (balanceState === "settled") {
      grossSettledAmountInCentavos +=
        balanceObligation
          .amountInCentavos;

      settledPaymentIds.push(
        balancePayment.id,
      );
    }

    if (balanceState === "unresolved") {
      unresolvedPaymentIds.push(
        balancePayment.id,
      );
    }
  }

  if (
    grossSettledAmountInCentavos >
    financial.grossAmountInCentavos
  ) {
    throw settlementInvalid();
  }

  const outstandingAmountInCentavos =
    financial.grossAmountInCentavos -
    grossSettledAmountInCentavos;

  const fullySettled =
    outstandingAmountInCentavos === 0;

  let status:
    ProviderRequestSettlementStatus;

  if (fullySettled) {
    status =
      "fully_settled";
  }
  else if (
    initialState ===
      "unresolved"
  ) {
    status =
      "initial_payment_processing";
  }
  else if (
    initialState ===
      "settled" &&
    balanceState ===
      "unresolved"
  ) {
    status =
      "balance_payment_processing";
  }
  else if (
    initialChoice ===
      "minimum" &&
    initialState ===
      "settled"
  ) {
    status =
      "deposit_settled";
  }
  else {
    status =
      "unpaid";
  }

  return {
    schemaVersion: 1,

    status,

    initialPaymentChoice:
      initialChoice,

    initialPaymentId:
      expectedInitialId,

    remainingBalancePaymentId:
      storedBalancePaymentId,

    grossAmountInCentavos:
      financial.grossAmountInCentavos,

    grossSettledAmountInCentavos,

    outstandingAmountInCentavos,

    fullySettled,

    settledPaymentIds,
    unresolvedPaymentIds,
  };
}

export function initialPaymentReservationSettlementUpdate(
  input: {
    financialSnapshot:
      unknown;

    timestamp:
      unknown;
  },
): Record<string, unknown> {
  const financial =
    requireFinancialSnapshot({
      financialSnapshot:
        input.financialSnapshot,
    });

  return {
    settlementSchemaVersion: 1,

    settlementStatus:
      "initial_payment_processing",

    /*
     * No gateway settlement exists yet.
     * The obligation has only been reserved.
     */
    grossSettledAmountInCentavos:
      0,

    outstandingAmountInCentavos:
      financial.grossAmountInCentavos,

    /*
     * The balance obligation does not receive an identity until
     * the later balance-payment lifecycle explicitly reserves it.
     */
    remainingBalancePaymentId:
      null,

    settlementUpdatedAt:
      input.timestamp,
  };
}

export function providerRequestSettlementUpdateForPaymentOutcome(
  input: {
    providerRequestId:
      string;

    providerRequest:
      UnknownRecord;

    paymentId:
      string;

    paymentStatus:
      unknown;

    timestamp:
      unknown;
  },
): Record<string, unknown> {
  const {
    providerRequestId,
    providerRequest,
    paymentId,
    paymentStatus,
    timestamp,
  } = input;

  const financial =
    requireFinancialSnapshot(
      providerRequest,
    );

  const initialChoice =
    parseInitialPaymentChoice(
      providerRequest
        .initialPaymentChoice,
    );

  if (!initialChoice) {
    throw settlementInvalid();
  }

  const expectedInitialPaymentId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      initialChoice,
    );

  if (
    providerRequest
      .initialPaymentId !==
      expectedInitialPaymentId
  ) {
    throw settlementInvalid();
  }

  const expectedBalancePaymentId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      "remaining_balance",
    );

  const storedBalancePaymentId =
    providerRequest
      .remainingBalancePaymentId;

  let paymentRole:
    "initial" | "balance";

  if (
    paymentId ===
      expectedInitialPaymentId
  ) {
    paymentRole =
      "initial";
  }
  else if (
    storedBalancePaymentId ===
      expectedBalancePaymentId &&
    paymentId ===
      expectedBalancePaymentId
  ) {
    paymentRole =
      "balance";
  }
  else {
    throw settlementInvalid();
  }

  if (
    paymentRole === "balance" &&
    initialChoice !== "minimum"
  ) {
    throw settlementInvalid();
  }

  const initialObligation =
    providerPaymentObligationForChoice({
      financialSnapshot:
        providerRequest
          .financialSnapshot,

      paymentChoice:
        initialChoice,
    });

  if (!initialObligation) {
    throw settlementInvalid();
  }

  const settled =
    SETTLED_PAYMENT_STATUSES.has(
      paymentStatus as string,
    );

  const unresolved =
    UNRESOLVED_PAYMENT_STATUSES.has(
      paymentStatus as string,
    );

  const terminalUnsettled =
    NON_SETTLED_TERMINAL_STATUSES.has(
      paymentStatus as string,
    );

  if (
    !settled &&
    !unresolved &&
    !terminalUnsettled
  ) {
    throw settlementInvalid();
  }

  let settlementStatus:
    ProviderRequestSettlementStatus;

  let grossSettledAmountInCentavos:
    number;

  let outstandingAmountInCentavos:
    number;

  if (paymentRole === "initial") {
    if (settled) {
      grossSettledAmountInCentavos =
        initialObligation
          .amountInCentavos;

      outstandingAmountInCentavos =
        financial
          .grossAmountInCentavos -
        grossSettledAmountInCentavos;

      settlementStatus =
        outstandingAmountInCentavos === 0
          ? "fully_settled"
          : "deposit_settled";
    }
    else if (unresolved) {
      settlementStatus =
        "initial_payment_processing";

      grossSettledAmountInCentavos =
        0;

      outstandingAmountInCentavos =
        financial
          .grossAmountInCentavos;
    }
    else {
      settlementStatus =
        "unpaid";

      grossSettledAmountInCentavos =
        0;

      outstandingAmountInCentavos =
        financial
          .grossAmountInCentavos;
    }
  }
  else {
    /*
     * A remaining-balance attempt can only exist after
     * the minimum obligation has already settled.
     *
     * Failure/expiration therefore leaves the deposit
     * settlement intact rather than reopening the
     * original down-payment lifecycle.
     */
    const balanceObligation =
      providerPaymentObligationForChoice({
        financialSnapshot:
          providerRequest
            .financialSnapshot,

        paymentChoice:
          "remaining_balance",
      });

    if (!balanceObligation) {
      throw settlementInvalid();
    }

    if (settled) {
      settlementStatus =
        "fully_settled";

      grossSettledAmountInCentavos =
        financial
          .grossAmountInCentavos;

      outstandingAmountInCentavos =
        0;
    }
    else if (unresolved) {
      settlementStatus =
        "balance_payment_processing";

      grossSettledAmountInCentavos =
        initialObligation
          .amountInCentavos;

      outstandingAmountInCentavos =
        balanceObligation
          .amountInCentavos;
    }
    else {
      settlementStatus =
        "deposit_settled";

      grossSettledAmountInCentavos =
        initialObligation
          .amountInCentavos;

      outstandingAmountInCentavos =
        balanceObligation
          .amountInCentavos;
    }
  }

  if (
    grossSettledAmountInCentavos < 0 ||
    outstandingAmountInCentavos < 0 ||
    (
      grossSettledAmountInCentavos +
      outstandingAmountInCentavos
    ) !==
      financial
        .grossAmountInCentavos
  ) {
    throw settlementInvalid();
  }

  return {
    settlementSchemaVersion:
      1,

    settlementStatus,

    grossSettledAmountInCentavos,

    outstandingAmountInCentavos,

    settlementUpdatedAt:
      timestamp,
  };
}

function validatePayment(
  input: {
    providerRequestId: string;

    providerRequest:
      UnknownRecord;

    payment:
      ProviderSettlementPayment;

    paymentChoice:
      CustomerPaymentChoice;
  },
): "settled" | "unresolved" | "not_settled" {
  const obligation =
    providerPaymentObligationForChoice({
      financialSnapshot:
        input.providerRequest
          .financialSnapshot,

      paymentChoice:
        input.paymentChoice,
    });

  if (!obligation) {
    throw settlementInvalid();
  }

  const expectedId =
    paymentIdForProviderRequestChoice(
      input.providerRequestId,
      input.paymentChoice,
    );

  const payment =
    input.payment.data;

  if (
    input.payment.id !== expectedId ||
    payment.paymentId !== expectedId ||
    payment.providerRequestId !==
      input.providerRequestId ||
    payment.obligationSchemaVersion !==
      obligation.schemaVersion ||
    payment.paymentChoice !==
      obligation.paymentChoice ||
    payment.obligationKey !==
      obligation.obligationKey ||
    payment.obligationKind !==
      obligation.obligationKind ||
    payment.paymentType !==
      obligation.paymentType ||
    payment.amountInCentavos !==
      obligation.amountInCentavos ||
    payment.currency !== "PHP"
  ) {
    throw settlementInvalid();
  }

  const status =
    payment.status;

  if (
    SETTLED_PAYMENT_STATUSES.has(
      status as string,
    )
  ) {
    if (
      !(payment.paidAt instanceof Timestamp)
    ) {
      throw settlementInvalid();
    }

    return "settled";
  }

  if (
    UNRESOLVED_PAYMENT_STATUSES.has(
      status as string,
    )
  ) {
    return "unresolved";
  }

  if (
    NON_SETTLED_TERMINAL_STATUSES.has(
      status as string,
    )
  ) {
    return "not_settled";
  }

  throw settlementInvalid();
}

function requireFinancialSnapshot(
  providerRequest:
    UnknownRecord,
): {
  grossAmountInCentavos: number;
} {
  const value =
    providerRequest
      .financialSnapshot;

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw settlementInvalid();
  }

  const snapshot =
    value as UnknownRecord;

  const gross =
    snapshot
      .grossAmountInCentavos;

  const upfront =
    snapshot
      .requiredUpfrontAmountInCentavos;

  const remaining =
    snapshot
      .remainingBalanceInCentavos;

  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.currency !== "PHP" ||
    !Number.isSafeInteger(gross) ||
    !Number.isSafeInteger(upfront) ||
    !Number.isSafeInteger(remaining) ||
    (gross as number) <= 0 ||
    (upfront as number) < 0 ||
    (remaining as number) < 0 ||
    (
      upfront as number
    ) +
      (
        remaining as number
      ) !==
      (
        gross as number
      )
  ) {
    throw settlementInvalid();
  }

  return {
    grossAmountInCentavos:
      gross as number,
  };
}

function optionalStoredId(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/u
      .test(value)
  ) {
    throw settlementInvalid();
  }

  return value;
}

function settlementInvalid(): Error {
  return new Error(
    "Provider-request payment settlement is invalid.",
  );
}
