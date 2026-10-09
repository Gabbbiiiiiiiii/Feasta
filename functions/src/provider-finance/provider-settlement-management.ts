import type {
  Transaction,
} from "firebase-admin/firestore";
import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  db,
} from "../shared/firestore.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";

import {
  assertProviderSettlementTransportReady,
} from "./provider-settlement-capability.js";

import {
  buildProviderSettlementPlan,
  payoutAttemptIdForSettlement,
  releaseProviderSettlementAvailability,
  reserveProviderSettlementPayout,
  settlementIdForEarning,
} from "./provider-settlement-domain.js";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

/*
 * Canonical P5 requests must be fully Customer-settled before
 * service fulfillment begins.
 *
 * Historical requests without canonical settlement evidence retain
 * their existing lifecycle behavior.
 */
export function assertProviderRequestFullySettledForServiceStart(
  providerRequest: UnknownRecord,
): void {
  const hasSettlement = ["settlementSchemaVersion", "settlementStatus",
    "grossSettledAmountInCentavos", "outstandingAmountInCentavos"]
    .some((field) => providerRequest[field] != null);
  if (!hasSettlement) return;
  if (providerRequest.settlementSchemaVersion !== 1) {
    throw settlementPrecondition("The booking must be fully settled before starting service.");
  }

  fullySettledPaymentIds(
    providerRequest,
  );
  if (providerRequest.settlementStatus !== "fully_settled") {
    throw settlementPrecondition("The booking must be fully settled before starting service.");
  }
}

/*
 * Completion releases all of this Provider request's canonical
 * earnings from pending -> available.
 *
 * This is still NOT a Provider payout.
 */
export async function releaseProviderRequestEarningsForSettlementInTransaction(
  input: {
    transaction: Transaction;

    providerRequestId: string;
    providerRequest: UnknownRecord;

    mainEventId: string;
    providerId: string;
    customerId: string;

    timestamp: unknown;
  },
): Promise<{
  releasedEarningCount: number;
}> {
  if (
    input.providerRequest
      .settlementSchemaVersion !==
        1
  ) {
    /*
     * Legacy request.
     *
     * Do not invent P10 settlement history for records that
     * predate the canonical P5 settlement projection.
     */
    return {
      releasedEarningCount: 0,
    };
  }

  const paymentIds =
    fullySettledPaymentIds(
      input.providerRequest,
    );

  const records: Array<{
    paymentId: string;

    earningReference:
      FirebaseFirestore.DocumentReference;

    earning:
      Record<string, unknown>;

    settlementReference:
      FirebaseFirestore.DocumentReference;

    settlement:
      Record<string, unknown> | null;
  }> = [];

  /*
   * All Firestore reads happen before any writes.
   */
  for (const paymentId of paymentIds) {
    const earningReference =
      db
        .collection("providerEarnings")
        .doc(paymentId);

    const settlementReference =
      db
        .collection("providerSettlements")
        .doc(
          settlementIdForEarning(
            paymentId,
          ),
        );

    const [
      earningSnapshot,
      settlementSnapshot,
    ] = await Promise.all([
      input.transaction.get(
        earningReference,
      ),

      input.transaction.get(
        settlementReference,
      ),
    ]);

    if (!earningSnapshot.exists) {
      throw settlementPrecondition(
        "Provider earning records are incomplete.",
      );
    }

    const earning =
      earningSnapshot.data() ?? {};

    if (
      earning.earningId !== paymentId ||
      earning.paymentId !== paymentId ||
      earning.providerRequestId !==
        input.providerRequestId ||
      earning.mainEventId !==
        input.mainEventId ||
      earning.providerId !==
        input.providerId ||
      earning.customerId !==
        input.customerId
    ) {
      throw settlementPrecondition(
        "Provider earning linkage is invalid.",
      );
    }

    records.push({
      paymentId,

      earningReference,

      earning,

      settlementReference,

      settlement:
        settlementSnapshot.exists
          ? settlementSnapshot.data() ?? {}
          : null,
    });
  }

  for (const record of records) {
    let settlement =
      record.settlement;

    let creatingSettlement = false;

    if (!settlement) {
      const backfill =
        buildProviderSettlementPlan({
          earningId:
            record.paymentId,

          earning:
            record.earning,

          timestamp:
            input.timestamp,
        });

      settlement =
        backfill.settlementRecord;

      creatingSettlement = true;
    }

    let release;

    try {
      release =
        releaseProviderSettlementAvailability({
          settlement,

          earning:
            record.earning,

          timestamp:
            input.timestamp,
        });
    } catch {
      throw settlementPrecondition(
        "Provider settlement cannot be released.",
      );
    }

    input.transaction.update(
      record.earningReference,
      release.earningUpdate,
    );

    if (creatingSettlement) {
      input.transaction.create(
        record.settlementReference,
        {
          ...settlement,
          ...release.settlementUpdate,
        },
      );
    } else {
      input.transaction.update(
        record.settlementReference,
        release.settlementUpdate,
      );
    }
  }

  return {
    releasedEarningCount:
      records.length,
  };
}

/*
 * P10-C will call this trusted internal boundary after checking
 * the actual PayMongo capability/configuration available to FEASTA.
 *
 * This transaction ONLY reserves money and creates an attempt.
 * It does not claim that PayMongo has received or paid anything.
 */
export async function reserveProviderSettlementForPayout(
  input: {
    settlementId: string;
    attemptSequence: number;
  },
): Promise<{
  settlementId: string;
  payoutAttemptId: string;
  amountInCentavos: number;
}> {
  const settlementId =
    requireId(
      input.settlementId,
      "Provider settlement",
    );

  if (
    !Number.isSafeInteger(
      input.attemptSequence,
    ) ||
    input.attemptSequence < 1
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Payout attempt sequence is invalid.",
    );
  }

  const settlementReference =
    db
      .collection("providerSettlements")
      .doc(settlementId);

  return db.runTransaction(
    async (transaction) => {
      const settlementSnapshot =
        await transaction.get(
          settlementReference,
        );

      if (!settlementSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The Provider settlement was not found.",
        );
      }

      const settlement =
        settlementSnapshot.data() ?? {};

      const earningId =
        requireId(
          settlement.earningId,
          "Provider earning",
        );

      const providerId =
        requireId(
          settlement.providerId,
          "Provider",
        );

      const paymentAccountReference =
        db
          .collection(
            "providerPaymentAccounts",
          )
          .doc(providerId);

      const paymentAccountSnapshot =
        await transaction.get(
          paymentAccountReference,
        );

      let capability;

      try {
        capability =
          assertProviderSettlementTransportReady(
            paymentAccountSnapshot.exists
              ? paymentAccountSnapshot.data() ?? {}
              : null,
          );
      } catch {
        throw new HttpsError(
          "failed-precondition",
          "Provider settlement transport is not available.",
          {
            reason:
              "provider_settlement_transport_unavailable",
          },
        );
      }

      const earningReference =
        db
          .collection("providerEarnings")
          .doc(earningId);

      const paymentReference =
        db
          .collection("payments")
          .doc(
            requireId(
              settlement.paymentId,
              "Payment",
            ),
          );

      const payoutAttemptId =
        payoutAttemptIdForSettlement(
          settlementId,
          input.attemptSequence,
        );

      const payoutAttemptReference =
        db
          .collection(
            "providerPayoutAttempts",
          )
          .doc(payoutAttemptId);

      const [
        earningSnapshot,
        paymentSnapshot,
        payoutAttemptSnapshot,
      ] = await Promise.all([
        transaction.get(
          earningReference,
        ),

        transaction.get(
          paymentReference,
        ),

        transaction.get(
          payoutAttemptReference,
        ),
      ]);

      if (!earningSnapshot.exists) {
        throw settlementPrecondition(
          "The Provider earning was not found.",
        );
      }

      if (!paymentSnapshot.exists) {
        throw settlementPrecondition(
          "The settlement payment was not found.",
        );
      }

      const payment =
        paymentSnapshot.data() ?? {};

      if (
        payment.providerEarningSchemaVersion !==
          1 ||
        payment.providerEarningId !==
          earningId
      ) {
        throw settlementPrecondition(
          "The settlement payment earning linkage is invalid.",
        );
      }

      const rawRefundReserved =
        payment
          .refundReservedAmountInCentavos;

      let refundReserved =
        0;

      if (
        rawRefundReserved !==
          undefined &&
        rawRefundReserved !==
          null
      ) {
        if (
          typeof rawRefundReserved !==
            "number" ||
          !Number.isSafeInteger(
            rawRefundReserved,
          ) ||
          rawRefundReserved < 0
        ) {
          throw settlementPrecondition(
            "The settlement payment refund accounting is invalid.",
          );
        }

        refundReserved =
          rawRefundReserved;
      }

      if (
        refundReserved > 0 ||
        (
          payment.refundExecutionLock !==
            undefined &&
          payment.refundExecutionLock !==
            null
        )
      ) {
        throw settlementPrecondition(
          "A Customer refund is already reserved for this payment.",
        );
      }

      if (payoutAttemptSnapshot.exists) {
        throw new HttpsError(
          "already-exists",
          "This payout attempt already exists.",
        );
      }

      let reservation;

      try {
        reservation =
          reserveProviderSettlementPayout({
            settlement,

            earning:
              earningSnapshot.data() ?? {},

            attemptSequence:
              input.attemptSequence,

            timestamp:
              serverTimestamp(),
          });
      } catch {
        throw settlementPrecondition(
          "The Provider settlement is not ready for payout.",
        );
      }

      if (
        reservation.payoutAttemptId !==
          payoutAttemptId
      ) {
        throw settlementPrecondition(
          "Payout attempt identity is inconsistent.",
        );
      }

      transaction.update(
        settlementReference,
        reservation
          .settlementUpdate,
      );

      transaction.update(
        earningReference,
        reservation
          .earningUpdate,
      );

      transaction.create(
        payoutAttemptReference,
        {
          ...reservation
            .payoutAttemptRecord,

          settlementTransportMode:
            capability
              .transportMode,

          settlementTransportSchemaVersion:
            1,
        },
      );

      return {
        settlementId,

        payoutAttemptId,

        amountInCentavos:
          reservation
            .payoutAttemptRecord
            .amountInCentavos,
      };
    },
  );
}

function fullySettledPaymentIds(
  providerRequest: UnknownRecord,
): string[] {
  const financialSnapshot =
    recordValue(
      providerRequest
        .financialSnapshot,
    );

  if (
    !financialSnapshot ||
    financialSnapshot.schemaVersion !== 1 ||
    financialSnapshot.currency !==
      "PHP"
  ) {
    throw settlementPrecondition(
      "The booking financial snapshot is invalid.",
    );
  }

  const gross =
    nonNegativeMoney(
      financialSnapshot
        .grossAmountInCentavos,
    );

  if (gross <= 0) {
    throw settlementPrecondition(
      "The booking gross amount is invalid.",
    );
  }

  if (
    providerRequest
      .outstandingAmountInCentavos !==
        0 ||
    providerRequest
      .grossSettledAmountInCentavos !==
        gross
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Complete the Customer's remaining payment before starting this service.",
      {
        reason:
          "customer_balance_outstanding",
      },
    );
  }

  const choice =
    providerRequest
      .initialPaymentChoice;

  if (
    choice !== "minimum" &&
    choice !== "full"
  ) {
    throw settlementPrecondition(
      "The initial payment choice is invalid.",
    );
  }

  const initialPaymentId =
    requireId(
      providerRequest.initialPaymentId,
      "Initial payment",
    );

  const ids =
    [initialPaymentId];

  const remainingBalance =
    nonNegativeMoney(
      financialSnapshot
        .remainingBalanceInCentavos,
    );

  const storedBalanceId =
    providerRequest
      .remainingBalancePaymentId;

  if (choice === "full") {
    if (
      storedBalanceId !== undefined &&
      storedBalanceId !== null
    ) {
      throw settlementPrecondition(
        "Full-payment booking has an unexpected balance payment.",
      );
    }

    return ids;
  }

  if (remainingBalance > 0) {
    ids.push(
      requireId(
        storedBalanceId,
        "Remaining-balance payment",
      ),
    );
  } else if (
    storedBalanceId !== undefined &&
    storedBalanceId !== null
  ) {
    throw settlementPrecondition(
      "Booking has an unexpected remaining-balance payment.",
    );
  }

  if (
    new Set(ids).size !==
      ids.length
  ) {
    throw settlementPrecondition(
      "Provider payment identities are duplicated.",
    );
  }

  return ids;
}

function recordValue(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonNegativeMoney(
  value: unknown,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0
  ) {
    throw settlementPrecondition(
      "Provider settlement money is invalid.",
    );
  }

  return value as number;
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
    throw settlementPrecondition(
      `${label} identity is invalid.`,
    );
  }

  return value;
}

function settlementPrecondition(
  message: string,
): HttpsError {
  return new HttpsError(
    "failed-precondition",
    message,
    {
      reason:
        "provider_settlement_invalid",
    },
  );
}