import type {DocumentData, QueryDocumentSnapshot} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {resolveProviderRequestRelationships} from "./provider-request-relationships.js";

/**
 * Adapt an exhaustive mainEventId query read in the same transaction as the
 * parent. Never supply documents fetched only from stored complete/active IDs.
 * Keep failure as a result so webhooks can retain financial evidence while
 * refusing lifecycle changes; callable consumers use the throwing wrapper.
 */
export function resolveProviderRequestDocuments(input: {
  mainEventId: string;
  mainEvent: DocumentData;
  requests: readonly QueryDocumentSnapshot<DocumentData>[];
}) {
  const relationships = resolveProviderRequestRelationships({
    mainEventId: input.mainEventId,
    mainEvent: input.mainEvent,
    linkedRequests: input.requests.map((document) => ({
      id: document.id, data: document.data(),
    })),
  });
  if (!relationships.ok) return relationships;
  const byId = new Map(input.requests.map((document) => [document.id, document]));
  return {
    ...relationships,
    completeRequests: relationships.complete.map((id) => byId.get(id)!),
    activeRequests: relationships.activeRequired.map((id) => byId.get(id)!),
    historicalRequests: relationships.historical.map((id) => byId.get(id)!),
  };
}

export function requireProviderRequestDocuments(
  input: Parameters<typeof resolveProviderRequestDocuments>[0],
) {
  const relationships = resolveProviderRequestDocuments(input);
  if (!relationships.ok) {
    throw new HttpsError(
      "failed-precondition", "The event provider-request relationships are invalid.",
      {reason: relationships.reason},
    );
  }
  return relationships;
}

export function requireActiveProviderRequest(
  relationships: ReturnType<typeof requireProviderRequestDocuments>,
  providerRequestId: string,
): void {
  if (!relationships.activeRequired.includes(providerRequestId)) {
    throw new HttpsError(
      "failed-precondition", "The provider request is not a current required assignment.",
      {reason: "provider-request-not-active"},
    );
  }
}
