import {HttpsError, onCall} from "firebase-functions/v2/https";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";
import {
  adjustedCanonicalRatingAggregate,
  adjustedRatingAggregate,
  moderationStatus,
} from "./review-moderation-policy.js";
import {loadReviewRelationship} from "./review-relationship.js";

export const deleteReview = onCall(
  appCheckCallableOptions,
  async (request) => {
    const customer = requireAuth(request);
    await enforceCallableRateLimit(request, {
      scope: "deleteReview",
      limit: 10,
      windowSeconds: 60 * 60,
    });
    await requireRole(customer.uid, [USER_ROLES.customer]);

    const input = requireObject(request.data);
    rejectUnknownFields(input, ["reviewId", "reason", "idempotencyKey"]);
    const reviewId = requireReviewId(input.reviewId);
    const reason = optionalReason(input.reason);
    const key = createIdempotencyKey({
      operation: "deleteReview",
      actorId: customer.uid,
      clientKey: input.idempotencyKey,
      payload: {reviewId, reason},
    });

    const execution = await executeIdempotently({
      key,
      operation: "deleteReview",
      actorId: customer.uid,
      handler: async () => db.runTransaction(async (transaction) => {
        const reviewReference = db.collection("reviews").doc(reviewId);
        const reviewSnapshot = await transaction.get(reviewReference);

        if (!reviewSnapshot.exists) {
          throw new HttpsError("not-found", "The review was not found.");
        }

        const review = reviewSnapshot.data() ?? {};
        const relationship = await loadReviewRelationship(
          transaction,
          reviewSnapshot,
        );

        if (relationship.customerId !== customer.uid) {
          throw new HttpsError(
            "permission-denied",
            "You do not own this review.",
          );
        }

        if (review.isDeleted === true) {
          return {reviewId, deleted: false};
        }

        const rating = validRating(review.rating);
        const counted =
          moderationStatus(review) === "published" &&
          review.isVisible !== false;
        const providerReference = db
          .collection("providers")
          .doc(relationship.providerId);
        const providerUpdate: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
        };

        if (counted) {
          const aggregate = adjustedRatingAggregate({
            reviewCount: relationship.provider.reviewCount,
            ratingAverage: relationship.provider.ratingAverage,
            rating,
            contributionChange: -1,
          });
          providerUpdate.reviewCount = aggregate.reviewCount;
          providerUpdate.ratingAverage = aggregate.ratingAverage;

          if (relationship.kind === "canonical") {
            const canonicalAggregate = adjustedCanonicalRatingAggregate({
              reviewCount: relationship.provider.canonicalReviewCount,
              ratingTotal: relationship.provider.canonicalRatingTotal,
              ratingDistribution:
                relationship.provider.canonicalRatingDistribution,
              rating,
              contributionChange: -1,
            });
            if (!canonicalAggregate) {
              throw inconsistentAggregate();
            }
            providerUpdate.canonicalReviewCount =
              canonicalAggregate.reviewCount;
            providerUpdate.canonicalRatingTotal =
              canonicalAggregate.ratingTotal;
            providerUpdate.canonicalRatingDistribution =
              canonicalAggregate.ratingDistribution;
          }
        }

        transaction.update(reviewReference, {
          isDeleted: true,
          isVisible: false,
          deletedAt: serverTimestamp(),
          deletedBy: customer.uid,
          deletionReason: reason || "Deleted by customer",
          updatedAt: serverTimestamp(),
        });
        if (counted) {
          transaction.update(providerReference, providerUpdate);
        }

        writeAuditLogInTransaction(transaction, {
          actorId: customer.uid,
          actorRole: USER_ROLES.customer,
          action: "review_deleted_by_customer",
          targetCollection: "reviews",
          targetId: reviewId,
          reason: reason || undefined,
          source: "cloud_function",
          before: {isDeleted: false, isVisible: review.isVisible !== false},
          after: {isDeleted: true, isVisible: false},
          metadata: {
            providerRequestId: relationship.providerRequestId,
            mainEventId: relationship.mainEventId,
            providerId: relationship.providerId,
            rating,
          },
        });

        return {reviewId, deleted: true};
      }),
    });

    return {
      success: true,
      ...execution.result,
      idempotentReplay: execution.replayed,
    };
  },
);

function requireReviewId(value: unknown): string {
  const reviewId = requireString(value, "reviewId", {
    minLength: 1,
    maxLength: 256,
  });
  if (!/^[A-Za-z0-9_-]+$/u.test(reviewId)) {
    throw new HttpsError("invalid-argument", "reviewId is invalid.");
  }
  return reviewId;
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(input).filter((field) => !allowed.includes(field));
  if (unknown.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unsupported review fields: ${unknown.sort().join(", ")}.`,
    );
  }
}

function optionalReason(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "reason must be a string.");
  }
  const reason = value.trim().replace(/\s+/gu, " ");
  if (reason.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      "reason must not exceed 500 characters.",
    );
  }
  return reason;
}

function validRating(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 ||
      (value as number) > 5) {
    throw new HttpsError(
      "failed-precondition",
      "The review rating is invalid.",
    );
  }
  return value as number;
}

function inconsistentAggregate(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The provider review aggregate is inconsistent.",
  );
}
