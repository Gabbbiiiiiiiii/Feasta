import {createHash} from "node:crypto";

export const CANONICAL_REVIEW_SCHEMA_VERSION = 2 as const;
export const CANONICAL_REVIEW_RELATIONSHIP_VERSION =
  "provider_request_v1" as const;

export type ReviewRelationship = {
  kind: "canonical" | "legacy";
  providerRequestId: string | null;
  mainEventId: string;
  providerId: string;
  customerId: string;
};

export function canonicalReviewId(
  providerRequestId: string,
  customerId: string,
): string {
  const digest = createHash("sha256")
    .update(`${providerRequestId}\u0000${customerId}`)
    .digest("hex");

  return `review_${digest}`;
}

export function canonicalReviewRelationship(input: {
  review: Readonly<Record<string, unknown>>;
  providerRequestId: string;
  providerRequest: Readonly<Record<string, unknown>>;
  mainEventId: string;
  mainEvent: Readonly<Record<string, unknown>>;
  providerId: string;
  providerExists: boolean;
}): ReviewRelationship | null {
  const reviewProviderRequestId = stringValue(
    input.review.providerRequestId,
  );
  const reviewMainEventId = stringValue(
    input.review.mainEventId,
  );
  const reviewProviderId = stringValue(
    input.review.providerId,
  );
  const reviewCustomerId = stringValue(
    input.review.customerId,
  );
  const requestHasStoredId = Object.hasOwn(
    input.providerRequest,
    "providerRequestId",
  );
  const requestStoredId = stringValue(
    input.providerRequest.providerRequestId,
  );
  const requestMainEventId = stringValue(
    input.providerRequest.mainEventId,
  );
  const requestProviderId = stringValue(
    input.providerRequest.providerId,
  );
  const requestCustomerId = stringValue(
    input.providerRequest.customerId,
  );
  const mainEventCustomerId = stringValue(
    input.mainEvent.customerId,
  );
  const mainEventRequestIds = stringArray(
    input.mainEvent.providerRequestIds,
  );

  if (
    input.review.schemaVersion !== CANONICAL_REVIEW_SCHEMA_VERSION ||
    input.review.relationshipVersion !==
      CANONICAL_REVIEW_RELATIONSHIP_VERSION ||
    reviewProviderRequestId !== input.providerRequestId ||
    reviewMainEventId !== input.mainEventId ||
    reviewProviderId !== input.providerId ||
    !reviewCustomerId ||
    (requestHasStoredId && requestStoredId !== input.providerRequestId) ||
    requestMainEventId !== input.mainEventId ||
    requestProviderId !== input.providerId ||
    requestCustomerId !== reviewCustomerId ||
    mainEventCustomerId !== reviewCustomerId ||
    input.providerRequest.status !== "completed" ||
    input.mainEvent.status !== "completed" ||
    !mainEventRequestIds.includes(input.providerRequestId) ||
    !input.providerExists
  ) {
    return null;
  }

  return {
    kind: "canonical",
    providerRequestId: input.providerRequestId,
    mainEventId: input.mainEventId,
    providerId: input.providerId,
    customerId: reviewCustomerId,
  };
}

export function legacyReviewRelationship(input: {
  review: Readonly<Record<string, unknown>>;
  mainEventId: string;
  mainEvent: Readonly<Record<string, unknown>>;
  providerId: string;
  providerExists: boolean;
}): ReviewRelationship | null {
  if (Object.hasOwn(input.review, "providerRequestId")) {
    return null;
  }

  const reviewMainEventId = stringValue(
    input.review.bookingId,
  );
  const reviewProviderId = stringValue(
    input.review.providerId,
  );
  const reviewCustomerId = stringValue(
    input.review.customerId,
  );
  const mainEventProviderId = stringValue(
    input.mainEvent.providerId,
  );
  const mainEventCustomerId = stringValue(
    input.mainEvent.customerId,
  );

  if (
    reviewMainEventId !== input.mainEventId ||
    reviewProviderId !== input.providerId ||
    !reviewCustomerId ||
    mainEventProviderId !== input.providerId ||
    mainEventCustomerId !== reviewCustomerId ||
    input.mainEvent.status !== "completed" ||
    !input.providerExists
  ) {
    return null;
  }

  return {
    kind: "legacy",
    providerRequestId: null,
    mainEventId: input.mainEventId,
    providerId: input.providerId,
    customerId: reviewCustomerId,
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}
