import * as logger from
  "firebase-functions/logger";

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  classifyProviderRequestRefundPolicyEvidence,
  requireRefundEligibilityState,
} from "../bookings/booking-refund-policy.js";

import {
  legacyActiveCancellationRequestId,
} from "../cancellations/refund-cancellation-domain.js";

import {
  db,
} from "../shared/firestore.js";

import {
  createNotificationWithIdInTransaction,
} from "../shared/notifications.js";

import {
  serverTimestamp,
} from "../shared/timestamps.js";

import {
  remainingBalanceLifecyclePlan,
} from "./remaining-balance-lifecycle-domain.js";

const ACTIVE_REMAINING_BALANCE_STATUSES = [
  "not_due",
  "due_soon",
  "due",
  "grace_period",
  "overdue",
] as const;

/*
 * Reconcile remaining-balance lifecycle once per hour.
 *
 * Manila calendar boundaries occur at midnight, so an hourly cron
 * with Asia/Manila timezone evaluates those transitions promptly.
 *
 * Firestore transaction conflicts plus deterministic notification
 * IDs make overlapping scheduler invocations safe.
 */
export const reconcileRemainingBalanceLifecycle =
  onSchedule(
    {
      schedule:
        "0 * * * *",

      timeZone:
        "Asia/Manila",

      region:
        "asia-southeast1",

      retryCount:
        2,
    },

    async (event) => {
      const now =
        new Date(
          event.scheduleTime,
        );

      if (
        !Number.isFinite(
          now.getTime(),
        )
      ) {
        throw new Error(
          "Scheduled lifecycle time is invalid.",
        );
      }

      /*
       * Single-field IN query only.
       *
       * No additional compound Firestore index is required for the
       * P10-D lifecycle worker.
       */
      const candidates =
        await db
          .collection(
            "providerRequests",
          )
          .where(
            "remainingBalanceStatus",
            "in",
            [
              ...ACTIVE_REMAINING_BALANCE_STATUSES,
            ],
          )
          .get();

      let updatedCount =
        0;

      let skippedCount =
        0;

      let failedCount =
        0;

      for (
        const candidate of
          candidates.docs
      ) {
        try {
          const changed =
            await db.runTransaction(
              async (transaction) => {
                const snapshot =
                  await transaction.get(
                    candidate.ref,
                  );

                if (!snapshot.exists) {
                  return false;
                }

                const providerRequest =
                  snapshot.data() ??
                  {};

                if (
                  cancellationActive(
                    providerRequest,
                  )
                ) {
                  return false;
                }

                const plan =
                  remainingBalanceLifecyclePlan({
                    providerRequestId:
                      snapshot.id,

                    providerRequest,

                    now,
                  });

                if (
                  !plan ||
                  !plan.changed
                ) {
                  return false;
                }

                const customerId =
                  requireStoredId(
                    providerRequest.customerId,
                    "Customer",
                  );

                transaction.update(
                  snapshot.ref,
                  {
                    remainingBalanceStatus:
                      plan.nextStatus,

                    remainingBalanceLifecycleUpdatedAt:
                      serverTimestamp(),

                    updatedAt:
                      serverTimestamp(),
                  },
                );

                if (
                  plan.reminder &&
                  plan.notificationId
                ) {
                  createNotificationWithIdInTransaction(
                    transaction,

                    plan.notificationId,

                    {
                      userId:
                        customerId,

                      title:
                        plan.reminder.title,

                      message:
                        plan.reminder.message,

                      type:
                        "payment",

                      relatedId:
                        snapshot.id,

                      relatedCollection:
                        "providerRequests",

                      metadata: {
                        providerRequestId:
                          snapshot.id,

                        remainingBalanceStatus:
                          plan.nextStatus,

                        dueAt:
                          plan.dueAt
                            ?.toISOString() ??
                          null,

                        graceEndsAt:
                          plan
                            .graceEndsAt
                            ?.toISOString() ??
                          null,
                      },
                    },
                  );
                }

                return true;
              },
            );

          if (changed) {
            updatedCount +=
              1;
          } else {
            skippedCount +=
              1;
          }
        } catch (error) {
          failedCount +=
            1;

          logger.error(
            "Remaining-balance lifecycle reconciliation failed.",
            {
              providerRequestId:
                candidate.id,

              error:
                error instanceof Error
                  ? error.message
                  : "unknown_error",
            },
          );
        }
      }

      logger.info(
        "Remaining-balance lifecycle reconciliation completed.",
        {
          candidateCount:
            candidates.size,

          updatedCount,
          skippedCount,
          failedCount,
        },
      );
    },
  );

function cancellationActive(
  providerRequest:
    Readonly<Record<string, unknown>>,
): boolean {
  const evidence =
    classifyProviderRequestRefundPolicyEvidence(
      providerRequest,
    );

  if (
    evidence.status ===
      "invalid"
  ) {
    /*
     * Invalid cancellation-policy evidence fails closed:
     * do not send financial reminders until reconciled.
     */
    return true;
  }

  const activeCancellationRequestId =
    evidence.status ===
      "policy_backed"
      ? requireRefundEligibilityState(
          providerRequest,
        )
          .activeCancellationRequestId
      : legacyActiveCancellationRequestId(
          providerRequest,
        );

  return (
    activeCancellationRequestId !==
      null
  );
}

function requireStoredId(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !==
      "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value.includes("/")
  ) {
    throw new Error(
      `${label} ID is invalid.`,
    );
  }

  return value;
}