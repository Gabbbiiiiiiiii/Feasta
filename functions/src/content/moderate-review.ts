import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  writeAuditLogInTransaction,
} from "../shared/audit.js";
import {
  requireAuth,
} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  USER_ROLES,
} from "../shared/constants.js";
import {
  db,
} from "../shared/firestore.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {
  createNotificationInTransaction,
} from "../shared/notifications.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";
import {
  requireObject,
  requireString,
} from "../shared/validation.js";
import {
  REVIEW_ACTIONS,
  adjustedRatingAggregate,
  moderationStatus,
  resolveNextState,
  type ReviewAction,
} from "./review-moderation-policy.js";




export const moderateReview = onCall(
  appCheckCallableOptions,
  async (request) => {
    const administrator =
      requireAuth(request);

    await enforceCallableRateLimit(
      request,
      {
        scope: "moderateReview",
        limit: 30,
        windowSeconds: 60 * 60,
      },
    );

    await requireRole(
      administrator.uid,
      [USER_ROLES.admin],
    );

    const input =
      requireObject(request.data);

    const reviewId = requireString(
      input.reviewId,
      "reviewId",
      {
        minLength: 1,
        maxLength: 128,
      },
    );

    const actionValue = requireString(
      input.action,
      "action",
      {
        minLength: 1,
        maxLength: 40,
      },
    );

    if (
      !REVIEW_ACTIONS.includes(
        actionValue as ReviewAction,
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "The review moderation action is invalid.",
      );
    }

    const action =
      actionValue as ReviewAction;

    const reason = normalizeReason(
      input.reason,
    );

    if (
      action === "hide" &&
      reason.length < 10
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a moderation reason of at least 10 characters.",
      );
    }

    const key = createIdempotencyKey({
      operation: "moderateReview",
      actorId: administrator.uid,
      clientKey: input.idempotencyKey,
      payload: {
        reviewId,
        action,
        reason,
      },
    });

    const execution =
      await executeIdempotently({
        key,
        operation: "moderateReview",
        actorId: administrator.uid,
        handler: async () =>
          db.runTransaction(
            async (transaction) => {
              const reviewReference =
                db.collection("reviews")
                  .doc(reviewId);

              const reviewSnapshot =
                await transaction.get(
                  reviewReference,
                );

              if (!reviewSnapshot.exists) {
                throw new HttpsError(
                  "not-found",
                  "The review was not found.",
                );
              }

              const review =
                reviewSnapshot.data() ?? {};

              if (review.isDeleted === true) {
                throw new HttpsError(
                  "failed-precondition",
                  "A deleted review cannot be moderated.",
                );
              }

              const providerId =
                stringField(
                  review.providerId,
                );

              const customerId =
                stringField(
                  review.customerId,
                );

              if (!providerId) {
                throw new HttpsError(
                  "failed-precondition",
                  "The review has no provider.",
                );
              }

              const currentStatus =
                moderationStatus(review);

              const currentVisible =
                review.isVisible !== false;

              const currentReported =
                review.isReported === true;

              const nextState =
                resolveNextState({
                  action,
                  currentStatus,
                  currentVisible,
                  currentReported,
                });

              if (!nextState.changed) {
                return {
                  reviewId,
                  moderationStatus:
                    currentStatus,
                  isVisible:
                    currentVisible,
                  isReported:
                    currentReported,
                  changed: false,
                };
              }

              const providerReference =
                db.collection("providers")
                  .doc(providerId);

              const providerSnapshot =
                await transaction.get(
                  providerReference,
                );

              if (!providerSnapshot.exists) {
                throw new HttpsError(
                  "not-found",
                  "The review provider was not found.",
                );
              }

              const provider =
                providerSnapshot.data() ?? {};

              const rating =
                validRating(review.rating);

              const previouslyCounted =
                currentStatus ===
                  "published" &&
                currentVisible;

              const nextCounted =
                nextState.status ===
                  "published" &&
                nextState.isVisible;

              const contributionChange =
                Number(nextCounted) -
                Number(previouslyCounted);

              transaction.update(
                reviewReference,
                {
                  moderationStatus:
                    nextState.status,
                  isVisible:
                    nextState.isVisible,
                  isReported:
                    nextState.isReported,
                  moderationReason:
                    action === "restore"
                      ? null
                      : reason || null,
                  moderatedAt:
                    serverTimestamp(),
                  moderatedBy:
                    administrator.uid,
                  updatedAt:
                    serverTimestamp(),
                },
              );

              if (
                contributionChange !== 0
              ) {
                const aggregate =
                  adjustedRatingAggregate({
                    reviewCount:
                      provider.reviewCount,
                    ratingAverage:
                      provider.ratingAverage,
                    rating,
                    contributionChange,
                  });

                transaction.update(
                  providerReference,
                  {
                    reviewCount:
                      aggregate.reviewCount,
                    ratingAverage:
                      aggregate.ratingAverage,
                    updatedAt:
                      serverTimestamp(),
                  },
                );
              }

              writeAuditLogInTransaction(
                transaction,
                {
                  actorId:
                    administrator.uid,
                  actorRole:
                    USER_ROLES.admin,
                  action:
                    auditAction(action),
                  targetCollection:
                    "reviews",
                  targetId:
                    reviewId,
                  reason:
                    reason || undefined,
                  source:
                    "cloud_function",
                  before: {
                    moderationStatus:
                      currentStatus,
                    isVisible:
                      currentVisible,
                    isReported:
                      currentReported,
                  },
                  after: {
                    moderationStatus:
                      nextState.status,
                    isVisible:
                      nextState.isVisible,
                    isReported:
                      nextState.isReported,
                  },
                  metadata: {
                    providerId,
                    customerId:
                      customerId || null,
                    bookingId:
                      stringField(
                        review.bookingId,
                      ) || null,
                    rating,
                    moderationAction:
                      action,
                  },
                },
              );

              if (
                customerId &&
                action !==
                  "dismiss_report"
              ) {
                createNotificationInTransaction(
                  transaction,
                  {
                    userId: customerId,
                    title:
                      "Review Status Updated",
                    message:
                      action === "hide"
                        ? "Your review was hidden following administrative moderation."
                        : "Your review has been restored and is visible again.",
                    type: "review",
                    relatedId: reviewId,
                    relatedCollection:
                      "reviews",
                  },
                );
              }

              return {
                reviewId,
                moderationStatus:
                  nextState.status,
                isVisible:
                  nextState.isVisible,
                isReported:
                  nextState.isReported,
                changed: true,
              };
            },
          ),
      });

    return {
      success: true,
      ...execution.result,
      idempotentReplay:
        execution.replayed,
    };
  },
);

function normalizeReason(
  value: unknown,
): string {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "The moderation reason is invalid.",
    );
  }

  const reason = value
    .trim()
    .replace(/\s+/g, " ");

  if (reason.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      "The moderation reason must not exceed 500 characters.",
    );
  }

  return reason;
}







function validRating(
  value: unknown,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 5
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The review rating is invalid.",
    );
  }

  return value as number;
}

function stringField(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function auditAction(
  action: ReviewAction,
): string {
  switch (action) {
    case "hide":
      return "review_hidden";

    case "restore":
      return "review_restored";

    case "dismiss_report":
      return "review_report_dismissed";
  }
}