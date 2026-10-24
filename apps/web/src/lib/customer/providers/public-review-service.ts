import "server-only";

import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {adminDb} from "@/lib/firebase/admin";
import {loadReviewRelations, mapProviderReview} from "@/lib/provider/reviews/provider-review-service";
import {normalizePublicProvider} from "./provider-normalization";
import {isPublicProviderId} from "./provider-route-policy";
import type {PublicReviewPage} from "./public-review-types";

const PAGE_SIZE = 5;
type Cursor = {providerId: string; id: string; seconds: number; nanoseconds: number};

export function decodePublicReviewCursor(value: string, providerId: string): Cursor {
  try {
    if (value.length > 1000 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (cursor.providerId !== providerId || typeof cursor.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,160}$/u.test(cursor.id) ||
      !Number.isSafeInteger(cursor.seconds) || !Number.isSafeInteger(cursor.nanoseconds) ||
      cursor.nanoseconds < 0 || cursor.nanoseconds > 999999999) throw new Error();
    new Timestamp(cursor.seconds, cursor.nanoseconds);
    return cursor;
  } catch {
    throw new Error("Invalid review cursor.");
  }
}

export async function getPublicReviewPage(providerId: string, cursorValue?: string): Promise<PublicReviewPage | null> {
  if (!isPublicProviderId(providerId)) return null;
  const cursor = cursorValue ? decodePublicReviewCursor(cursorValue, providerId) : null;
  const providerSnapshot = await adminDb.collection("providers").doc(providerId).get();
  const data = providerSnapshot.data() ?? {};
  if (!providerSnapshot.exists || typeof data.ownerId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(data.ownerId)) return null;
  const owner = await adminDb.collection("users").doc(data.ownerId).get();
  if (!normalizePublicProvider(providerId, data, owner.exists ? owner.data() ?? {} : {})) return null;

  // Matches the existing providerId/isDeleted/createdAt/__name__ index.
  // Scan only five candidates per request; excluded candidates still advance the cursor.
  let query = adminDb.collection("reviews")
    .where("providerId", "==", providerId)
    .where("isDeleted", "==", false)
    .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (cursor) query = query.startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), cursor.id);
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const candidates = snapshot.docs.slice(0, PAGE_SIZE);
  const published = candidates.filter((document) => {
    const review = document.data();
    return review.providerId === providerId && review.moderationStatus === "published" &&
      review.isVisible === true && review.isDeleted === false && Object.hasOwn(review, "providerRequestId");
  });
  const relations = await loadReviewRelations(published, providerId, false);
  const reviews = published.flatMap((document) => {
    const review = mapProviderReview(document, providerId, relations);
    return review ? [{id: review.id, rating: review.rating, comment: review.comment,
      createdAt: review.createdAt, providerReply: review.providerReply}] : [];
  });
  const last = candidates.at(-1);
  const timestamp: unknown = last?.data().createdAt;
  const nextCursor = snapshot.docs.length > PAGE_SIZE && last && timestamp instanceof Timestamp
    ? Buffer.from(JSON.stringify({providerId, id: last.id, seconds: timestamp.seconds,
      nanoseconds: timestamp.nanoseconds} satisfies Cursor)).toString("base64url") : null;
  return {reviews, nextCursor};
}
