/**
 * Pure historical booking relationship verification.
 *
 * Does not establish inventory completeness, concurrency safety,
 * or permission to activate/deactivate an occasion.
 */

import {
  classifyMainEventForRegistry,
} from "./occasion-dependency-registry.js";

interface Row {
  id: string;
  data: Readonly<Record<string, unknown>>;
}

export interface HistoricalBookingLinkReport {
  verifiedBookingIds: string[];
  unresolvedBookingIds: string[];
  orphanRequestIds: string[];
  coverageVerified: false;
}

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const OCCASION_ID = /^[a-z][a-z0-9_]{1,63}$/u;

export function verifyHistoricalBookingLinks(input: {
  mainEvents: readonly Row[];
  providerRequests: readonly Row[];
}): HistoricalBookingLinkReport {
  const events = new Map<string, Row>();
  const requests = new Map<string, Row>();
  const unresolved = new Set<string>();
  const orphans = new Set<string>();
  const verified: string[] = [];

  for (const row of input.mainEvents) {
    if (!DOC_ID.test(row.id) || events.has(row.id)) {
      throw new Error("INVALID_HISTORICAL_BOOKING_INVENTORY");
    }
    events.set(row.id, row);
  }

  for (const row of input.providerRequests) {
    if (!DOC_ID.test(row.id) || requests.has(row.id)) {
      throw new Error("INVALID_HISTORICAL_REQUEST_INVENTORY");
    }
    requests.set(row.id, row);
  }

  for (const row of input.mainEvents) {
    const classification = classifyMainEventForRegistry(
      row.id, row.data,
    );

    if (classification === "customer_draft") continue;

    if (classification !== "submitted_booking") {
      unresolved.add(row.id);
      continue;
    }

    const ids = row.data.providerRequestIds as string[];
    let valid = true;

    for (const id of ids) {
      const request = requests.get(id);

      if (!request ||
          request.data.mainEventId !== row.id ||
          request.data.eventType !== row.data.eventType ||
          !OCCASION_ID.test(String(request.data.eventType)) ||
          typeof request.data.status !== "string") {
        valid = false;
      }
    }

    if (valid) {
      verified.push(row.id);
    } else {
      unresolved.add(row.id);
    }
  }

  for (const row of input.providerRequests) {
    const parentId = row.data.mainEventId;
    const parent = typeof parentId === "string" ?
      events.get(parentId) : undefined;

    if (!parent ||
        classifyMainEventForRegistry(parent.id, parent.data) !==
          "submitted_booking" ||
        !Array.isArray(parent.data.providerRequestIds) ||
        !parent.data.providerRequestIds.includes(row.id) ||
        row.data.eventType !== parent.data.eventType) {
      orphans.add(row.id);
      if (parent) unresolved.add(parent.id);
    }
  }

  return {
    verifiedBookingIds: verified
      .filter(id => !unresolved.has(id)).sort(),
    unresolvedBookingIds: [...unresolved].sort(),
    orphanRequestIds: [...orphans].sort(),
    coverageVerified: false,
  };
}
