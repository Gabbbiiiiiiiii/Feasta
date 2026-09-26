import type {DocumentData, QueryDocumentSnapshot} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {parseProviderRequestStatus, type MainEventStatus,
  type ProviderRequestStatus} from "../shared/constants.js";
import {areAllAssignedProvidersAccepted, calculateMainEventRequestSummary}
  from "./recalculate-main-event-status.js";

/** Plans a response against the exact current lineup; never drops failed requests. */
export function providerAcceptancePlan(input: {
  mainEventId: string;
  mainEvent: DocumentData;
  mainEventStatus: MainEventStatus;
  providerRequestId: string;
  requests: readonly QueryDocumentSnapshot<DocumentData>[];
}) {
  const ids: unknown = input.mainEvent.providerRequestIds;
  if (!Array.isArray(ids) || ids.length === 0 ||
    ids.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{8,160}$/u.test(id)) ||
    new Set(ids).size !== ids.length || ids.length !== input.requests.length ||
    new Set(input.requests.map((request) => request.id)).size !== ids.length ||
    !ids.includes(input.providerRequestId)) {
    throw invalidLineup();
  }

  for (const request of input.requests) {
    const data = request.data();
    if (!ids.includes(request.id) || data.providerRequestId !== request.id ||
      data.mainEventId !== input.mainEventId || data.bookingId !== input.mainEventId ||
      data.customerId !== input.mainEvent.customerId ||
      !parseProviderRequestStatus(data.status)) {
      throw invalidLineup();
    }
  }

  const respondingRequest = input.requests.find(
    (request) => request.id === input.providerRequestId,
  );
  if (respondingRequest?.data().status !== "pending") {
    throw invalidLineup();
  }

  const overrides: {providerRequestId: string; status: ProviderRequestStatus}[] = [
    {providerRequestId: input.providerRequestId, status: "accepted"},
  ];
  const acceptedSummary = calculateMainEventRequestSummary(
    input.requests, input.mainEventStatus, overrides,
  );
  const allAccepted = areAllAssignedProvidersAccepted(acceptedSummary);

  if (allAccepted) {
    for (const request of input.requests) {
      const data = request.data();
      if (request.id !== input.providerRequestId && data.status !== "accepted") {
        continue;
      }
      // Accepted siblings carry trusted booking snapshots. Fail closed if their
      // stored financial values cannot determine the canonical next state.
      if (typeof data.downPaymentAmount !== "number" ||
        !Number.isFinite(data.downPaymentAmount) || data.downPaymentAmount < 0 ||
        typeof data.amount !== "number" || !Number.isFinite(data.amount) ||
        data.amount < data.downPaymentAmount) {
        throw new HttpsError("failed-precondition", "The provider-request amount is invalid.");
      }
      const status = data.downPaymentAmount > 0 ? "waiting_for_down_payment" : "confirmed";
      if (request.id === input.providerRequestId) {
        overrides[0].status = status;
      } else {
        overrides.push({providerRequestId: request.id, status});
      }
    }
  }

  return {
    allAccepted,
    overrides,
    nextStatus: overrides[0].status,
    summary: calculateMainEventRequestSummary(
      input.requests, input.mainEventStatus, overrides,
    ),
  };
}

function invalidLineup(): HttpsError {
  return new HttpsError(
    "failed-precondition", "The event provider-request relationships are invalid.",
  );
}
