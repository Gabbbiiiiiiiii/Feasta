/**
 * Read-only historical inventory orchestration.
 *
 * Trusted callers provide page readers for all three collections and
 * registry witnesses. No Firebase writes or release authorization.
 */

import {
  scanHistoricalOccasionInventory,
  type ReadHistoricalInventoryPage,
} from "./occasion-historical-inventory-scan.js";

import {
  buildHistoricalOccasionReconciliationReport,
} from "./occasion-historical-reconciliation-report.js";

import type {
  HistoricalWitness,
} from "./occasion-historical-witnesses.js";

export async function buildHistoricalOccasionInventoryReport(input: {
  readPackages: ReadHistoricalInventoryPage;
  readMainEvents: ReadHistoricalInventoryPage;
  readProviderRequests: ReadHistoricalInventoryPage;
  actual: readonly HistoricalWitness[];
}) {
  // Sequential scans are deliberately non-isolated.
  // A terminal page never proves that writers were fenced.
  const packages = await scanHistoricalOccasionInventory({
    collection: "packages",
    readPage: input.readPackages,
  });

  const mainEvents = await scanHistoricalOccasionInventory({
    collection: "mainEvents",
    readPage: input.readMainEvents,
  });

  const providerRequests = await scanHistoricalOccasionInventory({
    collection: "providerRequests",
    readPage: input.readProviderRequests,
  });

  const report = buildHistoricalOccasionReconciliationReport({
    packages: packages.rows,
    mainEvents: mainEvents.rows,
    providerRequests: providerRequests.rows,
    actual: input.actual,
  });

  return {
    ...report,
    inventory: {
      packages: packages.scannedCount,
      mainEvents: mainEvents.scannedCount,
      providerRequests: providerRequests.scannedCount,
      pageCounts: {
        packages: packages.pageCount,
        mainEvents: mainEvents.pageCount,
        providerRequests: providerRequests.pageCount,
      },
    },
    snapshotIsolated: false as const,
    writersFenced: false as const,
    coverageVerified: false as const,
    canDeactivate: false as const,
  };
}
