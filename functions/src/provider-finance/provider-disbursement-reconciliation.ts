import {providerDisbursementTransport} from "./provider-disbursement-transport.js";
import {reconcileProviderDisbursementAttempt, processReadyProviderDisbursement} from "./provider-disbursement-execution.js";
import {
  Timestamp,
} from "firebase-admin/firestore";

import * as logger from "firebase-functions/logger";

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  db,
} from "../shared/firestore.js";

import {
  serverTimestamp,
} from "../shared/timestamps.js";

import {providerSettlementCapability} from "./provider-settlement-capability.js";
import {readTrustedProviderRequestPaymentSetInTransaction} from "../payments/provider-request-payment-reader.js";
import {reserveProviderSettlementPayout} from "./provider-settlement-domain.js";

import {
  PROVIDER_DISBURSEMENT_POLICY_VERSION,
} from "./provider-disbursement-policy.js";

const SWEEP_LIMIT =
  100;

const HELD_RETRY_MS =
  60 * 60 * 1000;

const TERMINAL = new Set([
  "paid",
  "cancelled",
  "failed",
]);

export const reconcileProviderDisbursements =
  onSchedule(
    {
      schedule:
        "every 15 minutes",

      timeZone:
        "Asia/Manila",

      region:
        "asia-southeast1",

      retryCount:
        2,
    },

    async () => {
      const now =
        new Date(
          Date.now(),
        );

      const candidates =
        await db
          .collection(
            "providerDisbursements",
          )
          .where(
            "nextCheckAt",
            "<=",
            Timestamp.fromDate(
              now,
            ),
          )
          .orderBy(
            "nextCheckAt",
          )
          .limit(
            SWEEP_LIMIT,
          )
          .get();

      for (
        const candidate of
          candidates.docs
      ) {
        try {
          if (["reserved", "processing", "reconciliation_required"].includes(String(candidate.data().status))) {
            await reconcileProviderDisbursementAttempt(candidate.id);
            continue;
          }
          await reconcileOne(
            candidate.id,
            now,
          );
          await processReadyProviderDisbursement(candidate.id);
        } catch (error) {
          logger.error(
            "Provider disbursement reconciliation failed.",
            {
              disbursementId:
                candidate.id,

              error:
                String(error),
            },
          );

          // Readiness failures are handled inside reconcileOne. Execution errors
          // must never rewrite financial readiness or payout execution state.
        }
      }
    },
  );

export async function reconcileOne(
  disbursementId: string,
  now: Date,
): Promise<void> {
  const reference =
    db
      .collection(
        "providerDisbursements",
      )
      .doc(
        disbursementId,
      );

  let readinessSnapshot: FirebaseFirestore.DocumentSnapshot | undefined;
  try {
    await db.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(
            reference,
          );

        readinessSnapshot = snapshot;
        if (!snapshot.exists) {
          return;
        }

        const data =
          snapshot.data() ??
          {};

        if (
          data.schemaVersion !== 1 ||
          data.policyVersion !==
            PROVIDER_DISBURSEMENT_POLICY_VERSION ||
          data.disbursementId !==
            disbursementId ||
          data.currency !== "PHP"
        ) {
          throw new Error(
            "Provider disbursement identity is invalid.",
          );
        }

        if (
          TERMINAL.has(
            String(
              data.status,
            ),
          )
        ) {
          if (
            data.nextCheckAt !==
              null
          ) {
            transaction.update(
              reference,
              {
                nextCheckAt:
                  null,
              },
            );
          }

          return;
        }

        // Financial readiness is the only responsibility of this reconciler.
        // Locked/terminal attempts require gateway evidence, never recalculation.
        if (!["scheduled", "held", "ready"].includes(String(data.status))) return;

        const eligibleAt =
          timestampDate(
            data.payoutEligibleAt,
          );

        if (!eligibleAt) {
          throw new Error(
            "Provider payout eligibility time is invalid.",
          );
        }

        if (
          now.getTime() <
            eligibleAt.getTime()
        ) {
          transaction.update(
            reference,
            {
              status:
                "scheduled",

              holdReason:
                null,

              nextCheckAt:
                Timestamp.fromDate(
                  eligibleAt,
                ),

              updatedAt:
                serverTimestamp(),
            },
          );

          return;
        }

        const providerId =
          requireId(
            data.providerId,
            "Provider",
          );

        const sourceSettlementIds =
          requireIdArray(
            data.sourceSettlementIds,
            "Provider settlement",
          );

        const sourcePaymentIds =
          requireIdArray(
            data.sourcePaymentIds,
            "Payment",
          );

        if (
          sourceSettlementIds.length === 0 ||
          sourceSettlementIds.length !==
            sourcePaymentIds.length
        ) {
          throw new Error(
            "Provider disbursement source set is invalid.",
          );
        }

        const settingsReference =
          db
            .collection(
              "appSettings",
            )
            .doc(
              "platform",
            );

        const accountReference =
          db
            .collection(
              "providerPaymentAccounts",
            )
            .doc(
              providerId,
            );

        const settlementReferences =
          sourceSettlementIds.map(
            (id) =>
              db
                .collection(
                  "providerSettlements",
                )
                .doc(id),
          );

        const paymentReferences =
          sourcePaymentIds.map(
            (id) =>
              db
                .collection(
                  "payments",
                )
                .doc(id),
          );

        /*
         * All reads are completed before this transaction writes.
         */
        const [
          settingsSnapshot,
          accountSnapshot,
          settlementSnapshots,
          paymentSnapshots,
        ] =
          await Promise.all([
            transaction.get(
              settingsReference,
            ),

            transaction.get(
              accountReference,
            ),

            transaction.getAll(
              ...settlementReferences,
            ),

            transaction.getAll(
              ...paymentReferences,
            ),
          ]);

        const settings = settingsSnapshot.data() ?? {};
        // Dispatch flag is operational evidence only, never a financial hold.
        const dispatchEnabled = settings.providerDisbursementsEnabled === true;
        const operationalCapability = providerDisbursementTransport.capability(accountSnapshot.data() ?? {}, settings);

        const capability = providerSettlementCapability(
          accountSnapshot.exists ? accountSnapshot.data() ?? {} : null,
        );
        const requestId = requireId(data.providerRequestId, "Provider request");
        const eventId = requireId(data.mainEventId, "Main event");
        const [requestSnapshot, eventSnapshot, earningSnapshots] = await Promise.all([
          transaction.get(db.collection("providerRequests").doc(requestId)),
          transaction.get(db.collection("mainEvents").doc(eventId)),
          transaction.getAll(...sourcePaymentIds.map(id => db.collection("providerEarnings").doc(id))),
        ]);
        const request = requestSnapshot.data() ?? {};
        const financial = request.financialSnapshot as Record<string, unknown> | undefined;
        if (!timestampDate(data.trigger === "completed_booking" ? request.completedAt : request.paymentDefaultAccountingFinalizedAt)) throw new Error("Invalid trusted payout anchor.");
        if (!requestSnapshot.exists || !eventSnapshot.exists || (data.trigger === "completed_booking" ? request.status !== "completed" :
              request.status !== "cancelled" || request.paymentDefaultAccountingSchemaVersion !== 1) ||
            financial?.providerDisbursementPolicyVersion !== 1 ||
            (data.trigger === "completed_booking" ?
              timestampDate(request.completedAt)?.getTime() !== timestampDate(data.completedBookingAt)?.getTime() :
              timestampDate(request.paymentDefaultAccountingFinalizedAt)?.getTime() !== timestampDate(data.financialFinalizedAt)?.getTime())) {
          throw new Error("Provider completion authority is invalid.");
        }
        if (data.trigger === "payment_default_compensation" &&
            (sourcePaymentIds.length !== 1 || sourcePaymentIds[0] !== request.initialPaymentId)) {
          throw new Error("Compensation source membership is invalid.");
        }
        if (data.trigger === "completed_booking") {
        const trusted = await readTrustedProviderRequestPaymentSetInTransaction({
          transaction, providerRequestId: requestId, providerRequest: request,
          mainEventId: eventId, mainEvent: eventSnapshot.data() ?? {}, providerId,
          customerId: requireId(data.customerId, "Customer"),
          invalid: () => { throw new Error("Canonical payment authority is invalid."); },
        });
        if (trusted.mode !== "p5" || !trusted.settlement.fullySettled ||
            trusted.settlement.settledPaymentIds.length !== sourcePaymentIds.length ||
            sourcePaymentIds.some(id => !trusted.settlement?.settledPaymentIds.includes(id))) {
          throw new Error("Customer obligation is not canonically settled.");
        }
        } else if (data.trigger !== "payment_default_compensation") throw new Error("Invalid disbursement trigger.");

        let total =
          0;

        for (
          let index = 0;
          index <
            settlementSnapshots.length;
          index += 1
        ) {
          const settlementSnapshot =
            settlementSnapshots[index];

          const paymentSnapshot =
            paymentSnapshots[index];

          if (
            !settlementSnapshot.exists ||
            !paymentSnapshot.exists
          ) {
            throw new Error(
              "Provider disbursement source record is missing.",
            );
          }

          const settlement =
            settlementSnapshot.data() ??
            {};

          const payment =
            paymentSnapshot.data() ??
            {};

          if (
            settlement.settlementId !==
              sourceSettlementIds[index] ||
            settlement.paymentId !==
              sourcePaymentIds[index] ||
            settlement.providerId !==
              providerId
          ) {
            throw new Error(
              "Provider disbursement settlement linkage is invalid.",
            );
          }

          if (
            settlement.reconciliationRequired ===
              true ||
            settlement.activePayoutAttemptId !==
              null ||
            Number(
              settlement
                .reservedAmountInCentavos,
            ) !== 0 ||
            Number(
              settlement
                .paidOutAmountInCentavos,
            ) !== 0
          ) {
            throw new Error(
              "Provider settlement already contains payout activity.",
            );
          }

          if (
            settlement.status ===
              "cancelled"
          ) {
            if (
              Number(
                settlement
                  .netSettlementAmountInCentavos,
              ) !== 0
            ) {
              throw new Error(
                "Cancelled Provider settlement contains money.",
              );
            }

            continue;
          }

          if (
            settlement.status !==
              "ready"
          ) {
            hold(
              transaction,
              reference,
              now,
              "provider_settlement_not_ready",
            );

            return;
          }

          const earning = earningSnapshots[index].data();
          if (data.trigger === "payment_default_compensation" &&
              (earning?.economicSource !== "payment_default_reservation_compensation" ||
               payment.paymentDefaultAccountingSchemaVersion !== 1 ||
               timestampDate(payment.paymentDefaultAccountingFinalizedAt)?.getTime() !== timestampDate(data.financialFinalizedAt)?.getTime())) {
            throw new Error("Compensation source not finalized.");
          }
          if (!earning || payment.providerEarningSchemaVersion !== 1 ||
              payment.providerEarningId !== sourcePaymentIds[index] ||
              settlement.providerRequestId !== requestId || settlement.mainEventId !== eventId ||
              settlement.customerId !== data.customerId || earning.providerRequestId !== requestId ||
              earning.mainEventId !== eventId || earning.customerId !== data.customerId ||
              payment.reconciliationRequired === true || payment.refundReconciliationRequired === true) {
            throw new Error("Canonical earning/payment linkage requires reconciliation.");
          }
          // Reuse the settlement validator without writing or creating an attempt.
          reserveProviderSettlementPayout({settlement, earning, attemptSequence: 1, timestamp: null});
          const amount = settlement.netSettlementAmountInCentavos;

          if (
            !Number.isSafeInteger(
              amount,
            ) ||
            amount < 0
          ) {
            throw new Error(
              "Provider settlement amount is invalid.",
            );
          }

          const refundReserved =
            payment
              .refundReservedAmountInCentavos;

          if (
            refundReserved !==
              undefined &&
            refundReserved !==
              null &&
            (
              !Number.isSafeInteger(
                refundReserved,
              ) ||
              refundReserved < 0
            )
          ) {
            throw new Error(
              "Payment refund reservation is invalid.",
            );
          }

          if (
            Number(
              refundReserved ??
              0,
            ) > 0 ||
            payment
              .refundExecutionLock !=
                null
          ) {
            hold(
              transaction,
              reference,
              now,
              "customer_refund_in_progress",
            );

            return;
          }

          total =
            checkedAdd(
              total,
              amount,
            );
        }

        if (
          total === 0
        ) {
          transaction.update(
            reference,
            {
              status:
                "cancelled",

              amountInCentavos:
                0,

              holdReason:
                null,

              nextCheckAt:
                null,

              updatedAt:
                serverTimestamp(),
            },
          );

          return;
        }

        // Financial truth is independent of permission/capability to dispatch.
        transaction.update(
          reference,
          {
            status:
              "ready",

            amountInCentavos:
              total,

            holdReason:
              null,

            transportMode: "disabled",
            dispatchEnabled,
            dispatchBlockReason: !dispatchEnabled ? "platform_disbursements_disabled" :
              !capability.transportReady ? capability.reason : !operationalCapability.ready ? operationalCapability.reason : null,

            transportReady: capability.transportReady && operationalCapability.ready,

            readyAt:
              timestampDate(data.readyAt) ? data.readyAt : serverTimestamp(),

            nextCheckAt: Timestamp.fromMillis(now.getTime() + HELD_RETRY_MS),

            updatedAt:
              serverTimestamp(),
          },
        );
      },
    );
  } catch (error) {
    if (readinessSnapshot) await recordReadinessReconciliationFailure(readinessSnapshot);
    throw error;
  }
}

function hold(
  transaction:
    FirebaseFirestore.Transaction,

  reference:
    FirebaseFirestore.DocumentReference,

  now:
    Date,

  reason:
    string,
): void {
  transaction.update(
    reference,
    {
      status:
        "held",

      holdReason:
        reason,

      nextCheckAt:
        Timestamp.fromMillis(
          now.getTime() +
            HELD_RETRY_MS,
        ),

      updatedAt:
        serverTimestamp(),
    },
  );
}

function timestampDate(
  value: unknown,
): Date | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const timestamp =
    value as {
      toDate?: () => unknown;
    };

  if (
    typeof timestamp.toDate !==
      "function"
  ) {
    return null;
  }

  const result =
    timestamp.toDate();

  return (
    result instanceof Date &&
    Number.isFinite(
      result.getTime(),
    )
  )
    ? result
    : null;
}

function requireIdArray(
  value: unknown,
  label: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 10
  ) {
    throw new Error(
      `${label} identities are invalid.`,
    );
  }

  const ids =
    value.map(
      (entry) =>
        requireId(
          entry,
          label,
        ),
    );

  if (
    new Set(ids).size !==
      ids.length
  ) {
    throw new Error(
      `${label} identities are duplicated.`,
    );
  }

  return ids;
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

function checkedAdd(
  left: number,
  right: number,
): number {
  const result =
    left +
    right;

  if (
    !Number.isSafeInteger(
      result,
    ) ||
    result < 0
  ) {
    throw new Error(
      "Provider disbursement amount overflowed.",
    );
  }

  return result;
}

export async function recordReadinessReconciliationFailure(candidate: FirebaseFirestore.DocumentSnapshot) {
  await db.runTransaction(async transaction => {
    const current = await transaction.get(candidate.ref);
    if (!current.exists || !candidate.updateTime || !current.updateTime?.isEqual(candidate.updateTime)) return;
    if (!["scheduled", "held", "ready"].includes(String(current.data()?.status))) return;
    transaction.update(candidate.ref, {status: "reconciliation_required",
      holdReason: "internal_reconciliation_failure", nextCheckAt: null, updatedAt: serverTimestamp()});
  });
}
