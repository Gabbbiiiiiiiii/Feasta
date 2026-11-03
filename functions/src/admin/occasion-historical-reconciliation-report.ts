/**
 * Pure historical dependency reconciliation report.
 *
 * The input is a supplied snapshot of source records and registry entries.
 * This does not establish complete Firestore inventory coverage, validate
 * providerRequest linkage, perform writes, or authorize occasion changes.
 */

import {
  classifyHistoricalPackage,
  classifyHistoricalMainEvent,
  type HistoricalWitness,
} from "./occasion-historical-witnesses.js";

import {
  reconcileOccasionDependencyWitnesses,
} from "./occasion-dependency-reconciliation.js";

import {
  verifyHistoricalBookingLinks,
} from "./occasion-historical-booking-links.js";

interface SourceRow {
  id: string;
  data: Record<string, unknown>;
}

export function buildHistoricalOccasionReconciliationReport(input: {
  packages: readonly SourceRow[];
  mainEvents: readonly SourceRow[];
  providerRequests: readonly SourceRow[];
  actual: readonly HistoricalWitness[];
}) {
  const expected: HistoricalWitness[] = [];
  const unresolved: string[] = [];
  const excluded: string[] = [];
  const retainedArchivedWitnesses: string[] = [];
  const actualPaths = new Set(input.actual.map(entry => entry.path));

  for (const row of input.packages) {
    const result = classifyHistoricalPackage(row.id, row.data);
    if (result.kind === "witnesses") {
      expected.push(...result.witnesses);
    } else if (result.kind === "unresolved") {
      unresolved.push(`packages/${row.id}`);
    } else {
      excluded.push(`packages/${row.id}`);

      // Preserve valid historical witnesses from fully archived packages.
      // Deleted packages and malformed archive records are not trusted.
      const fullyArchived = row.data.isDeleted !== true &&
        row.data.status === "archived" &&
        row.data.isActive === false &&
        row.data.isPublished === false &&
        row.data.providerPubliclyVisible === false;

      if (fullyArchived) {
        const historical = classifyHistoricalPackage(row.id, {
          ...row.data,
          status: "draft",
        });

        if (historical.kind === "unresolved") {
          unresolved.push(`packages/${row.id}:archived_membership_unverified`);
        } else if (historical.kind === "witnesses") {
          for (const witness of historical.witnesses) {
            if (actualPaths.has(witness.path)) {
              expected.push(witness);
              retainedArchivedWitnesses.push(witness.path);
            }
          }
        }
      }
    }
  }

  const bookingLinks = verifyHistoricalBookingLinks({
    mainEvents: input.mainEvents,
    providerRequests: input.providerRequests,
  });

  const verifiedBookings = new Set(bookingLinks.verifiedBookingIds);

  for (const id of bookingLinks.unresolvedBookingIds) {
    unresolved.push(`mainEvents/${id}:provider_requests_unverified`);
  }

  for (const id of bookingLinks.orphanRequestIds) {
    unresolved.push(`providerRequests/${id}:orphan_or_mismatch`);
  }

  for (const row of input.mainEvents) {
    const result = classifyHistoricalMainEvent(row.id, row.data);
    if (result.kind === "witnesses") {
      expected.push(...result.witnesses);
      if (!verifiedBookings.has(row.id)) {
        unresolved.push(`mainEvents/${row.id}:provider_requests_unverified`);
      }
    } else if (result.kind === "unresolved") {
      unresolved.push(`mainEvents/${row.id}`);
    } else {
      excluded.push(`mainEvents/${row.id}`);
    }
  }

  // Retained archived witnesses participate in consistency checking,
  // but must never establish complete registry coverage.
  const reconciliation = reconcileOccasionDependencyWitnesses({
    expected,
    actual: input.actual,
  });

  return {
    ...reconciliation,
    unresolved: [...new Set(unresolved)].sort(),
    excluded: [...new Set(excluded)].sort(),
    retainedArchivedWitnesses: [...new Set(retainedArchivedWitnesses)].sort(),
    // Never certify coverage from a bounded or caller-supplied inventory.
    coverageVerified: false as const,
  };
}
