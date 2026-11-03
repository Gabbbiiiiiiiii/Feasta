/**
 * Shared, read-only booking dependency classification for Admin deactivation.
 *
 * The caller is responsible for obtaining complete, consistent inventories
 * within the Firestore transaction and enforcing inventory size limits.
 */
import {
  parseMainEventStatus,
  parseProviderRequestStatus,
} from "../shared/constants.js";

type BookingRecord = Record<string, unknown>;

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[a-z][a-z0-9_]{1,63}$/u.test(value);
}

function validDocumentId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}

function refuse(reason: string): never {
  throw new Error(reason);
}

export function assertNoOccasionBookingDependencies(input: {
  occasionId: string;
  events: ReadonlyMap<string, BookingRecord>;
  requests: ReadonlyMap<string, BookingRecord>;
}): void {
  const {occasionId, events, requests} = input;
  const terminalEvents = new Set(["completed", "cancelled", "expired"]);
  const terminalRequests = new Set([
    "completed", "cancelled", "expired", "rejected",
  ]);

  for (const [requestId, request] of requests) {
    // Other occasions cannot block a valid unrelated transition.
    // Unknown occasion identities always require manual review.
    if (validId(request.eventType) &&
        request.eventType !== occasionId) continue;

    if (!validDocumentId(requestId) ||
        !validDocumentId(request.mainEventId) ||
        !validId(request.eventType)) {
      refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
    }

    const parent = events.get(request.mainEventId);
    if (!parent || parent.eventType !== request.eventType ||
        !Array.isArray(parent.providerRequestIds) ||
        !parent.providerRequestIds.includes(requestId)) {
      refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
    }

    if (request.eventType === occasionId) {
      const parentStatus = parseMainEventStatus(parent.status);
      const requestStatus = parseProviderRequestStatus(request.status);

      if (!parentStatus || !requestStatus) {
        refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
      }

      if (!terminalEvents.has(parentStatus) ||
          !terminalRequests.has(requestStatus)) {
        refuse("OCCASION_LIVE_BOOKING_DEPENDENCY");
      }
    }
  }

  for (const [eventId, event] of events) {
    if (validId(event.eventType) &&
        event.eventType !== occasionId) continue;

    if (!validDocumentId(eventId) ||
        !validId(event.eventType) ||
        !Array.isArray(event.providerRequestIds) ||
        typeof event.providerRequestCount !== "number" ||
        !Number.isSafeInteger(event.providerRequestCount) ||
        event.providerRequestCount < 0 ||
        event.providerRequestCount !== event.providerRequestIds.length ||
        !event.providerRequestIds.every(validDocumentId) ||
        new Set(event.providerRequestIds).size !==
          event.providerRequestIds.length) {
      refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
    }

    if (event.providerRequestIds.some((id: string) => {
      const request = requests.get(id);
      return !request ||
        request.mainEventId !== eventId ||
        request.eventType !== event.eventType;
    })) {
      refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
    }

    if (event.eventType === occasionId) {
      const status = parseMainEventStatus(event.status);

      if (!status) {
        refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
      }

      if (!terminalEvents.has(status)) {
        refuse("OCCASION_LIVE_BOOKING_DEPENDENCY");
      }
    }
  }
}