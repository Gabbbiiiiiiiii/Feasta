import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {createNotificationInTransaction} from "../shared/notifications.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";
import {
  CANONICAL_REVIEW_RELATIONSHIP_VERSION,
  CANONICAL_REVIEW_SCHEMA_VERSION,
  canonicalReviewId,
  canonicalReviewRelationship,
} from "./review-domain.js";
import {
  adjustedCanonicalRatingAggregate,
  adjustedRatingAggregate,
} from "./review-moderation-policy.js";

export const submitReview = onCall(
  appCheckCallableOptions,
  async (request) => {
    const user = requireAuth(request);
    await enforceCallableRateLimit(request, {
      scope: "submitReview",
      limit: 5,
      windowSeconds: 60 * 60,
    });
    await requireRole(user.uid, [USER_ROLES.customer]);

    const input = requireObject(request.data);
    rejectUnknownFields(input, [
      "providerRequestId",
      "rating",
      "comment",
      "idempotencyKey",
    ]);
    const providerRequestId = requireDocumentId(
      input.providerRequestId,
      "providerRequestId",
    );
    const comment = requireString(input.comment, "comment", {
      minLength: 2,
      maxLength: 2000,
    });
    if (!Number.isInteger(input.rating) ||
        (input.rating as number) < 1 || (input.rating as number) > 5) {
      throw new HttpsError("invalid-argument", "rating must be from 1 to 5.");
    }
    const rating = input.rating as number;
    const key = createIdempotencyKey({
      operation: "submitReview",
      actorId: user.uid,
      clientKey: input.idempotencyKey,
      payload: {providerRequestId, rating, comment},
    });

    const execution = await executeIdempotently({
      key,
      operation: "submitReview",
      actorId: user.uid,
      handler: async () => db.runTransaction(async (transaction) => {
        const providerRequestReference = db
          .collection("providerRequests")
          .doc(providerRequestId);
        const reviewReference = db
          .collection("reviews")
          .doc(canonicalReviewId(providerRequestId, user.uid));
        const [providerRequestSnapshot, existingReview] = await Promise.all([
          transaction.get(providerRequestReference),
          transaction.get(reviewReference),
        ]);

        if (!providerRequestSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The provider request was not found.",
          );
        }

        const providerRequest = providerRequestSnapshot.data() ?? {};
        const mainEventId = documentIdValue(
          providerRequest.mainEventId ?? providerRequest.bookingId,
        );
        const providerId = documentIdValue(providerRequest.providerId);
        const customerId = documentIdValue(providerRequest.customerId);

        if (!mainEventId || !providerId || !customerId) {
          throw invalidRelationship();
        }
        if (customerId !== user.uid) {
          throw new HttpsError(
            "permission-denied",
            "You do not own this provider request.",
          );
        }

        const mainEventReference = db.collection("mainEvents").doc(mainEventId);
        const providerReference = db.collection("providers").doc(providerId);
        const [mainEventSnapshot, providerSnapshot] = await Promise.all([
          transaction.get(mainEventReference),
          transaction.get(providerReference),
        ]);
        const mainEvent = mainEventSnapshot.data() ?? {};
        if (!mainEventSnapshot.exists || !providerSnapshot.exists) {
          throw invalidRelationship();
        }
        if (
          providerRequest.status !== "completed" ||
          mainEvent.status !== "completed"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Only completed provider requests can be reviewed.",
          );
        }
        const relationshipReview = {
          schemaVersion: CANONICAL_REVIEW_SCHEMA_VERSION,
          relationshipVersion: CANONICAL_REVIEW_RELATIONSHIP_VERSION,
          providerRequestId,
          mainEventId,
          providerId,
          customerId: user.uid,
        };
        const relationship = canonicalReviewRelationship({
          review: relationshipReview,
          providerRequestId,
          providerRequest,
          mainEventId,
          mainEvent,
          providerId,
          providerExists: providerSnapshot.exists,
        });

        if (!relationship) {
          throw invalidRelationship();
        }

        if (existingReview.exists) {
          const existing = existingReview.data() ?? {};
          const existingRelationship = canonicalReviewRelationship({
            review: existing,
            providerRequestId,
            providerRequest,
            mainEventId,
            mainEvent,
            providerId,
            providerExists: providerSnapshot.exists,
          });
          if (!existingRelationship || existingReview.id !== reviewReference.id) {
            throw new HttpsError(
              "failed-precondition",
              "The existing review identity is inconsistent.",
            );
          }
          return {reviewId: reviewReference.id, created: false};
        }

        const provider = providerSnapshot.data() ?? {};
        const aggregate = adjustedRatingAggregate({
          reviewCount: provider.reviewCount,
          ratingAverage: provider.ratingAverage,
          rating,
          contributionChange: 1,
        });
        const canonicalAggregate = adjustedCanonicalRatingAggregate({
          reviewCount: provider.canonicalReviewCount,
          ratingTotal: provider.canonicalRatingTotal,
          ratingDistribution: provider.canonicalRatingDistribution,
          rating,
          contributionChange: 1,
        });

        if (!canonicalAggregate) {
          throw new HttpsError(
            "failed-precondition",
            "The provider review aggregate is inconsistent.",
          );
        }

        transaction.create(reviewReference, {
          ...relationshipReview,
          packageId: nullableDocumentId(providerRequest.packageId),
          serviceName: reviewServiceName(providerRequest),
          customerFirstName:
            textValue(providerRequest.customerFirstName) ||
            textValue(mainEvent.customerFirstName) ||
            "Customer",
          customerLastName:
            textValue(providerRequest.customerLastName) ||
            textValue(mainEvent.customerLastName),
          rating,
          comment,
          providerReply: null,
          providerReplyAt: null,

          moderationStatus: "published",
          moderationReason: null,
          moderatedAt: null,
          moderatedBy: null,

          isVisible: true,
          isReported: false,
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          deletionReason: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.update(providerReference, {
          ratingAverage: aggregate.ratingAverage,
          reviewCount: aggregate.reviewCount,
          canonicalReviewCount: canonicalAggregate.reviewCount,
          canonicalRatingTotal: canonicalAggregate.ratingTotal,
          canonicalRatingDistribution: canonicalAggregate.ratingDistribution,
          updatedAt: serverTimestamp(),
        });

        if (typeof provider.ownerId === "string") {
          createNotificationInTransaction(transaction, {
            userId: provider.ownerId,
            title: "New Review Received",
            message: `A customer left a ${rating}-star review.`,
            type: "review",
            relatedId: reviewReference.id,
            relatedCollection: "reviews",
          });
        }
        return {reviewId: reviewReference.id, created: true};
      }),
    });

    return {
      success: true,
      ...execution.result,
      idempotentReplay: execution.replayed,
    };
  },
);

function requireDocumentId(value: unknown, field: string): string {
  const id = requireString(value, field, {minLength: 1, maxLength: 160});
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return id;
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

function documentIdValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,256}$/u.test(normalized) ? normalized : "";
}

function nullableDocumentId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return documentIdValue(value) || null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function reviewServiceName(providerRequest: Record<string, unknown>): string {
  const packageName = textValue(providerRequest.packageName);
  if (packageName) return packageName.slice(0, 160);

  if (Array.isArray(providerRequest.services)) {
    const serviceNames = providerRequest.services
      .map((service) => {
        if (!service || typeof service !== "object" || Array.isArray(service)) {
          return "";
        }
        const record = service as Record<string, unknown>;
        return textValue(record.name ?? record.serviceName);
      })
      .filter(Boolean)
      .slice(0, 3);
    if (serviceNames.length > 0) return serviceNames.join(", ").slice(0, 160);
  }

  return "Requested event service";
}

function invalidRelationship(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The provider-request relationship is invalid.",
  );
}
