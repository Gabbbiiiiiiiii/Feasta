import type {
  DocumentData,
  DocumentSnapshot,
  Transaction,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {db} from "../shared/firestore.js";
import {
  canonicalReviewId,
  canonicalReviewRelationship,
  legacyReviewRelationship,
  type ReviewRelationship,
} from "./review-domain.js";

export type LoadedReviewRelationship = ReviewRelationship & {
  provider: DocumentData;
};

export async function loadReviewRelationship(
  transaction: Transaction,
  reviewSnapshot: DocumentSnapshot<DocumentData>,
): Promise<LoadedReviewRelationship> {
  const review = reviewSnapshot.data() ?? {};

  if (Object.hasOwn(review, "providerRequestId")) {
    const relationship = await loadCanonicalRelationship(transaction, review);
    if (
      reviewSnapshot.id !== canonicalReviewId(
        relationship.providerRequestId as string,
        relationship.customerId,
      )
    ) {
      throw invalidRelationship();
    }
    return relationship;
  }

  return loadLegacyRelationship(transaction, review);
}

async function loadCanonicalRelationship(
  transaction: Transaction,
  review: DocumentData,
): Promise<LoadedReviewRelationship> {
  const providerRequestId = requiredDocumentId(
    review.providerRequestId,
    "The review provider-request relationship is invalid.",
  );
  const mainEventId = requiredDocumentId(
    review.mainEventId,
    "The review main-event relationship is invalid.",
  );
  const providerId = requiredDocumentId(
    review.providerId,
    "The review provider relationship is invalid.",
  );
  const providerRequestReference = db
    .collection("providerRequests")
    .doc(providerRequestId);
  const mainEventReference = db.collection("mainEvents").doc(mainEventId);
  const providerReference = db.collection("providers").doc(providerId);
  const [providerRequestSnapshot, mainEventSnapshot, providerSnapshot] =
    await Promise.all([
      transaction.get(providerRequestReference),
      transaction.get(mainEventReference),
      transaction.get(providerReference),
    ]);
  const relationship = canonicalReviewRelationship({
    review,
    providerRequestId,
    providerRequest: providerRequestSnapshot.data() ?? {},
    mainEventId,
    mainEvent: mainEventSnapshot.data() ?? {},
    providerId,
    providerExists: providerSnapshot.exists,
  });

  if (!providerRequestSnapshot.exists || !mainEventSnapshot.exists ||
      !relationship) {
    throw invalidRelationship();
  }

  return {
    ...relationship,
    provider: providerSnapshot.data() ?? {},
  };
}

async function loadLegacyRelationship(
  transaction: Transaction,
  review: DocumentData,
): Promise<LoadedReviewRelationship> {
  const mainEventId = requiredDocumentId(
    review.bookingId,
    "The legacy review booking relationship is invalid.",
  );
  const providerId = requiredDocumentId(
    review.providerId,
    "The legacy review provider relationship is invalid.",
  );
  const mainEventReference = db.collection("mainEvents").doc(mainEventId);
  const providerReference = db.collection("providers").doc(providerId);
  const [mainEventSnapshot, providerSnapshot] = await Promise.all([
    transaction.get(mainEventReference),
    transaction.get(providerReference),
  ]);
  const relationship = legacyReviewRelationship({
    review,
    mainEventId,
    mainEvent: mainEventSnapshot.data() ?? {},
    providerId,
    providerExists: providerSnapshot.exists,
  });

  if (!mainEventSnapshot.exists || !relationship) {
    throw invalidRelationship();
  }

  return {
    ...relationship,
    provider: providerSnapshot.data() ?? {},
  };
}

function requiredDocumentId(value: unknown, message: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,256}$/u.test(normalized)) {
    throw new HttpsError("failed-precondition", message);
  }
  return normalized;
}

function invalidRelationship(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The review relationship is invalid.",
  );
}
