import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {createNotificationInTransaction} from "../shared/notifications.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";
import {appCheckCallableOptions} from "../shared/function-options.js";

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
    const bookingId = requireString(input.bookingId, "bookingId", {
      minLength: 1,
      maxLength: 128,
    });
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
      payload: {bookingId, rating, comment},
    });

    const execution = await executeIdempotently({
      key,
      operation: "submitReview",
      actorId: user.uid,
      handler: async () => db.runTransaction(async (transaction) => {
        const bookingReference = db.collection("mainEvents").doc(bookingId);
        const reviewReference = db.collection("reviews")
          .doc(`${bookingId}_${user.uid}`);
        const bookingSnapshot = await transaction.get(bookingReference);
        const existingReview = await transaction.get(reviewReference);

        if (!bookingSnapshot.exists) {
          throw new HttpsError("not-found", "The booking was not found.");
        }
        const booking = bookingSnapshot.data();
        if (booking?.customerId !== user.uid) {
          throw new HttpsError("permission-denied", "You do not own this booking.");
        }
        if (booking?.status !== "completed") {
          throw new HttpsError(
            "failed-precondition",
            "Only completed bookings can be reviewed.",
          );
        }
        if (existingReview.exists) {
          return {reviewId: reviewReference.id, created: false};
        }

        const providerId = typeof booking.providerId === "string" ?
          booking.providerId : "";
        if (!providerId) {
          throw new HttpsError(
            "failed-precondition",
            "The booking has no provider.",
          );
        }
        const providerReference = db.collection("providers").doc(providerId);
        const providerSnapshot = await transaction.get(providerReference);
        if (!providerSnapshot.exists) {
          throw new HttpsError("not-found", "The provider was not found.");
        }
        const provider = providerSnapshot.data();
        const reviewCount = typeof provider?.reviewCount === "number" ?
          provider.reviewCount : 0;
        const ratingAverage = typeof provider?.ratingAverage === "number" ?
          provider.ratingAverage : 0;
        const nextReviewCount = reviewCount + 1;

        transaction.create(reviewReference, {
          bookingId,
          customerId: user.uid,
          providerId,
          packageId: booking.packageId ?? null,
          customerFirstName: booking.customerFirstName ?? "Customer",
          customerLastName: booking.customerLastName ?? "",
          rating,
          comment,
          providerReply: null,
          providerReplyAt: null,
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
          ratingAverage: ((ratingAverage * reviewCount) + rating) /
            nextReviewCount,
          reviewCount: nextReviewCount,
          updatedAt: serverTimestamp(),
        });

        if (typeof provider?.ownerId === "string") {
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
