import {
  getApps,
  initializeApp,
} from "firebase-admin/app";

import {
  FieldPath,
  Firestore,
  getFirestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  classifyFullPaymentMigration,
  FULL_PAYMENT_MIGRATION_CLASSIFICATIONS,
  type FullPaymentMigrationRecord,
  type FullPaymentMigrationResult,
} from "../payments/full-payment-migration-classifier.js";

const DEFAULT_PAGE_SIZE =
  100;

const MAX_PAGE_SIZE =
  500;

const PROJECT_ID_PATTERN =
  /^[a-z0-9][a-z0-9-]{3,62}[a-z0-9]$/u;

const COLLECTIONS = {
  packages:
    "packages",

  providerRequests:
    "providerRequests",

  payments:
    "payments",

  financialLedgerEntries:
    "financialLedgerEntries",

  providerEarnings:
    "providerEarnings",

  providerSettlements:
    "providerSettlements",

  refunds:
    "refunds",
} as const;

type ParsedArguments = {
  projectId: string;
  pageSize: number;
};

type StoredDocument = {
  id: string;

  data:
    Readonly<
      Record<string, unknown>
    >;
};

type MigrationSummary = {
  total: number;

  alreadyCanonical: number;

  autoMigratable: number;

  preserved: number;

  manualReview: number;

  byClassification:
    Record<string, number>;
};

type ScanAnomaly = {
  providerRequestId:
    string;

  packageId:
    string | null;

  mainEventId:
    string | null;

  reasonCode:
    | "provider_request_type_missing_or_invalid"
    | "provider_request_package_id_missing"
    | "provider_request_package_missing";
};

async function main(): Promise<void> {
  const argumentsValue =
    parseArguments(
      process.argv.slice(2),
    );

  if (
    process.argv.includes(
      "--apply",
    )
  ) {
    throw new Error(
      "P13-B is read-only. --apply is not supported.",
    );
  }

  initializeFirebase(
    argumentsValue.projectId,
  );

  const firestore =
    getFirestore();

  console.log("");
  console.log(
    "P13-B FULL-PAYMENT MIGRATION DRY RUN",
  );

  console.log(
    `Project: ${argumentsValue.projectId}`,
  );

  console.log(
    process.env
      .FIRESTORE_EMULATOR_HOST
      ? "Target: Firestore emulator (READ-ONLY)"
      : "Target: Explicit Firestore project (READ-ONLY)",
  );

  console.log("");

  const [
    packages,
    providerRequests,
    payments,
    financialLedgerEntries,
    providerEarnings,
    providerSettlements,
    refundRecords,
  ] =
    await Promise.all([
      readCollection(
        firestore,
        COLLECTIONS.packages,
        argumentsValue.pageSize,
      ),

      readCollection(
        firestore,
        COLLECTIONS.providerRequests,
        argumentsValue.pageSize,
      ),

      readCollection(
        firestore,
        COLLECTIONS.payments,
        argumentsValue.pageSize,
      ),

      readCollection(
        firestore,
        COLLECTIONS.financialLedgerEntries,
        argumentsValue.pageSize,
      ),

      readCollection(
        firestore,
        COLLECTIONS.providerEarnings,
        argumentsValue.pageSize,
      ),

      readCollection(
        firestore,
        COLLECTIONS.providerSettlements,
        argumentsValue.pageSize,
      ),

      readCollectionGroup(
        firestore,
        COLLECTIONS.refunds,
        argumentsValue.pageSize,
      ),
    ]);

  const cateringRequests =
    providerRequests.filter(
      (requestRecord) =>
        requestRecord.data.type ===
          "catering",
    );

  const addonRequests =
    providerRequests.filter(
      (requestRecord) =>
        requestRecord.data.type ===
          "addon",
    );

  const requestsByPackage =
    groupByIdField(
      cateringRequests,
      "packageId",
    );

  const requestStatusById =
    new Map<
      string,
      string | null
    >(
      providerRequests.map(
        (requestRecord) => [
          requestRecord.id,
          safeId(
            requestRecord.data.status,
          ),
        ],
      ),
    );

  const paymentsByRequest =
    groupByIdField(
      payments,
      "providerRequestId",
    );

  const ledgerByRequest =
    groupByIdField(
      financialLedgerEntries,
      "providerRequestId",
    );

  const earningsByRequest =
    groupByIdField(
      providerEarnings,
      "providerRequestId",
    );

  const settlementsByRequest =
    groupByIdField(
      providerSettlements,
      "providerRequestId",
    );

  const refundsByRequest =
    groupByIdField(
      refundRecords,
      "providerRequestId",
    );

  const scanAnomalies =
    findScanAnomalies(
      packages,
      providerRequests,
    );

  const results:
    FullPaymentMigrationResult[] =
      [];

  for (
    const packageRecord of packages
  ) {
    const linkedRequests =
      requestsByPackage.get(
        packageRecord.id,
      ) ?? [];

    if (
      linkedRequests.length === 0
    ) {
      results.push(
        classifyFullPaymentMigration({
          packageId:
            packageRecord.id,

          packageData:
            packageRecord.data,
        }),
      );

      continue;
    }

    for (
      const requestRecord of
        linkedRequests
    ) {
      const requestId =
        requestRecord.id;

      results.push(
        classifyFullPaymentMigration({
          packageId:
            packageRecord.id,

          packageData:
            packageRecord.data,

          providerRequestId:
            requestId,

          providerRequest:
            requestRecord.data,

          payments:
            migrationRecords(
              paymentsByRequest.get(
                requestId,
              ) ?? [],
            ),

          financialLedgerEntries:
            migrationRecords(
              ledgerByRequest.get(
                requestId,
              ) ?? [],
            ),

          providerEarnings:
            migrationRecords(
              earningsByRequest.get(
                requestId,
              ) ?? [],
            ),

          providerSettlements:
            migrationRecords(
              settlementsByRequest.get(
                requestId,
              ) ?? [],
            ),

          /*
           * Refund truth is already represented
           * by trusted payment status and ledger
           * evidence for classification.
           *
           * P13-B intentionally does not inspect
           * gateway payloads or reconstruct
           * financial evidence.
           */
          refundRecords:
            migrationRecords(
              refundsByRequest.get(
                requestId,
              ) ?? [],
            ),
        }),
      );
    }
  }

  for (
    const requestRecord of
      addonRequests
  ) {
    const requestId =
      requestRecord.id;

    results.push(
      classifyFullPaymentMigration({
        packageId:
          null,

        packageData:
          null,

        providerRequestId:
          requestId,

        providerRequest:
          requestRecord.data,

        payments:
          migrationRecords(
            paymentsByRequest.get(
              requestId,
            ) ?? [],
          ),

        financialLedgerEntries:
          migrationRecords(
            ledgerByRequest.get(
              requestId,
            ) ?? [],
          ),

        providerEarnings:
          migrationRecords(
            earningsByRequest.get(
              requestId,
            ) ?? [],
          ),

        providerSettlements:
          migrationRecords(
            settlementsByRequest.get(
              requestId,
            ) ?? [],
          ),

        refundRecords:
          migrationRecords(
            refundsByRequest.get(
              requestId,
            ) ?? [],
          ),
      }),
    );
  }

  results.sort(
    compareResults,
  );

  printDecisions(
    results,
    requestStatusById,
  );

  printScanAnomalies(
    scanAnomalies,
  );

  printManualReview(
    results,
  );

  printSummary(
    summarize(
      results,
      scanAnomalies.length,
    ),
  );
}

function parseArguments(
  argumentsValue:
    readonly string[],
): ParsedArguments {
  let projectId:
    string | null = null;

  let pageSize =
    DEFAULT_PAGE_SIZE;

  for (
    let index = 0;
    index <
      argumentsValue.length;
    index += 1
  ) {
    const value =
      argumentsValue[index];

    if (
      value === "--apply"
    ) {
      throw new Error(
        "P13-B is read-only. --apply is not supported.",
      );
    }

    if (
      value === "--project"
    ) {
      projectId =
        requiredNextArgument(
          argumentsValue,
          index,
          "--project",
        );

      index += 1;
      continue;
    }

    if (
      value.startsWith(
        "--project=",
      )
    ) {
      projectId =
        value.slice(
          "--project=".length,
        );

      continue;
    }

    if (
      value === "--page-size"
    ) {
      pageSize =
        parsedPageSize(
          requiredNextArgument(
            argumentsValue,
            index,
            "--page-size",
          ),
        );

      index += 1;
      continue;
    }

    if (
      value.startsWith(
        "--page-size=",
      )
    ) {
      pageSize =
        parsedPageSize(
          value.slice(
            "--page-size=".length,
          ),
        );

      continue;
    }

    throw new Error(
      `Unknown argument: ${value}`,
    );
  }

  if (
    !projectId ||
    !PROJECT_ID_PATTERN.test(
      projectId,
    )
  ) {
    throw new Error(
      "Specify an explicit Firebase project using --project <project-id>.",
    );
  }

  return {
    projectId,
    pageSize,
  };
}

function initializeFirebase(
  projectId: string,
): void {
  if (
    getApps().length > 0
  ) {
    return;
  }

  initializeApp({
    projectId,
  });
}

async function readCollection(
  firestore:
    Firestore,

  collectionName:
    string,

  pageSize:
    number,
): Promise<StoredDocument[]> {
  const documents:
    StoredDocument[] = [];

  let lastDocumentId:
    string | null = null;

  while (true) {
    let query =
      firestore
        .collection(
          collectionName,
        )
        .orderBy(
          FieldPath.documentId(),
        )
        .limit(
          pageSize,
        );

    if (
      lastDocumentId
    ) {
      query =
        query.startAfter(
          lastDocumentId,
        );
    }

    const snapshot =
      await query.get();

    if (
      snapshot.empty
    ) {
      break;
    }

    for (
      const document of
        snapshot.docs
    ) {
      documents.push(
        storedDocument(
          document,
        ),
      );
    }

    const last =
      snapshot.docs.at(-1);

    if (!last) {
      break;
    }

    lastDocumentId =
      last.id;

    if (
      snapshot.size <
        pageSize
    ) {
      break;
    }
  }

  return documents;
}

async function readCollectionGroup(
  firestore:
    Firestore,

  collectionName:
    string,

  pageSize:
    number,
): Promise<StoredDocument[]> {
  const documents:
    StoredDocument[] = [];

  let lastDocument:
    QueryDocumentSnapshot<DocumentData> |
    null = null;

  while (true) {
    let query =
      firestore
        .collectionGroup(
          collectionName,
        )
        .orderBy(
          FieldPath.documentId(),
        )
        .limit(
          pageSize,
        );

    if (lastDocument) {
      query =
        query.startAfter(
          lastDocument,
        );
    }

    const snapshot =
      await query.get();

    if (snapshot.empty) {
      break;
    }

    for (
      const document of
        snapshot.docs
    ) {
      documents.push({
        id:
          document.ref.path,

        data:
          document.data(),
      });
    }

    const last =
      snapshot.docs.at(-1);

    if (!last) {
      break;
    }

    lastDocument =
      last;

    if (
      snapshot.size <
        pageSize
    ) {
      break;
    }
  }

  return documents;
}

function storedDocument(
  document:
    QueryDocumentSnapshot<
      DocumentData
    >,
): StoredDocument {
  return {
    id:
      document.id,

    data:
      document.data(),
  };
}

function groupByIdField(
  documents:
    readonly StoredDocument[],

  field:
    string,
): Map<
  string,
  StoredDocument[]
> {
  const grouped =
    new Map<
      string,
      StoredDocument[]
    >();

  for (
    const document of documents
  ) {
    const id =
      safeId(
        document.data[field],
      );

    if (!id) {
      continue;
    }

    const existing =
      grouped.get(id) ?? [];

    existing.push(
      document,
    );

    grouped.set(
      id,
      existing,
    );
  }

  for (
    const records of
      grouped.values()
  ) {
    records.sort(
      (left, right) =>
        left.id.localeCompare(
          right.id,
        ),
    );
  }

  return grouped;
}

function migrationRecords(
  documents:
    readonly StoredDocument[],
): FullPaymentMigrationRecord[] {
  return documents.map(
    (document) => ({
      id:
        document.id,

      data:
        document.data,
    }),
  );
}

function findScanAnomalies(
  packages:
    readonly StoredDocument[],

  providerRequests:
    readonly StoredDocument[],
): ScanAnomaly[] {
  const packageIds =
    new Set(
      packages.map(
        (packageRecord) =>
          packageRecord.id,
      ),
    );

  const anomalies:
    ScanAnomaly[] = [];

  for (
    const requestRecord of
      providerRequests
  ) {
    const requestType =
      safeId(
        requestRecord.data.type,
      );

    const packageId =
      safeId(
        requestRecord.data.packageId,
      );

    const mainEventId =
      safeId(
        requestRecord.data.mainEventId ??
          requestRecord.data.bookingId,
      );

    /*
     * Add-on Provider Requests intentionally
     * have no catering package.
     *
     * They must not make a catering package look
     * used and must not be reported as broken
     * merely because packageId is null.
     */
    if (
      requestType === "addon"
    ) {
      continue;
    }

    if (
      requestType !== "catering"
    ) {
      anomalies.push({
        providerRequestId:
          requestRecord.id,

        packageId,

        mainEventId,

        reasonCode:
          "provider_request_type_missing_or_invalid",
      });

      continue;
    }

    if (!packageId) {
      anomalies.push({
        providerRequestId:
          requestRecord.id,

        packageId:
          null,

        mainEventId,

        reasonCode:
          "provider_request_package_id_missing",
      });

      continue;
    }

    if (
      !packageIds.has(
        packageId,
      )
    ) {
      anomalies.push({
        providerRequestId:
          requestRecord.id,

        packageId,

        mainEventId,

        reasonCode:
          "provider_request_package_missing",
      });
    }
  }

  anomalies.sort(
    (left, right) =>
      left.providerRequestId.localeCompare(
        right.providerRequestId,
      ),
  );

  return anomalies;
}

function printDecisions(
  results:
    readonly FullPaymentMigrationResult[],

  requestStatusById:
    ReadonlyMap<
      string,
      string | null
    >,
): void {
  console.log(
    "MIGRATION DECISIONS",
  );

  for (
    const resultValue of results
  ) {
    console.log(
      JSON.stringify({
        packageId:
          resultValue.packageId,

        providerRequestId:
          resultValue
            .providerRequestId,

        mainEventId:
          resultValue.mainEventId,

        providerRequestStatus:
          resultValue.providerRequestId
            ? (
                requestStatusById.get(
                  resultValue.providerRequestId,
                ) ?? null
              )
            : null,

        classification:
          resultValue.classification,

        reasonCode:
          resultValue.reasonCode,

        safeToAutoMigrate:
          resultValue.safeToAutoMigrate,
      }),
    );
  }

  console.log("");
}

function printScanAnomalies(
  anomalies:
    readonly ScanAnomaly[],
): void {
  if (
    anomalies.length === 0
  ) {
    return;
  }

  console.log(
    "PROVIDER-REQUEST LINKAGE ANOMALIES",
  );

  for (
    const anomaly of anomalies
  ) {
    console.log(
      JSON.stringify({
        providerRequestId:
          anomaly.providerRequestId,

        packageId:
          anomaly.packageId,

        mainEventId:
          anomaly.mainEventId,

        classification:
          "manual_review_missing_authority",

        reasonCode:
          anomaly.reasonCode,
      }),
    );
  }

  console.log("");
}

function summarize(
  results:
    readonly FullPaymentMigrationResult[],

  anomalyCount:
    number,
): MigrationSummary {
  const byClassification:
    Record<string, number> = {};

  for (
    const classification of
      FULL_PAYMENT_MIGRATION_CLASSIFICATIONS
  ) {
    byClassification[
      classification
    ] = 0;
  }

  for (
    const resultValue of
      results
  ) {
    byClassification[
      resultValue.classification
    ] += 1;
  }

  byClassification
    .manual_review_missing_authority +=
      anomalyCount;

  const alreadyCanonical =
    byClassification
      .already_canonical;

  const autoMigratable =
    byClassification
      .migrate_unused_package_to_full_payment +
    byClassification
      .migrate_unpaid_request_to_full_payment;

  const preserved =
    byClassification
      .preserve_legacy_paid_deposit +
    byClassification
      .preserve_historical_finance;

  const manualReview =
    byClassification
      .manual_review_conflict +
    byClassification
      .manual_review_missing_authority;

  return {
    total:
      results.length +
      anomalyCount,

    alreadyCanonical,

    autoMigratable,

    preserved,

    manualReview,

    byClassification,
  };
}

function printManualReview(
  results:
    readonly FullPaymentMigrationResult[],
): void {
  const manualReview =
    results.filter(
      (resultValue) =>
        resultValue.classification ===
          "manual_review_conflict" ||
        resultValue.classification ===
          "manual_review_missing_authority",
    );

  if (
    manualReview.length === 0
  ) {
    return;
  }

  console.log(
    "MANUAL REVIEW RECORDS",
  );

  for (
    const resultValue of
      manualReview
  ) {
    console.log(
      JSON.stringify({
        packageId:
          resultValue.packageId,

        providerRequestId:
          resultValue
            .providerRequestId,

        mainEventId:
          resultValue.mainEventId,


        classification:
          resultValue.classification,

        reasonCode:
          resultValue.reasonCode,

        conflicts:
          resultValue.conflicts,
      }),
    );
  }

  console.log("");
}

function printSummary(
  summary:
    MigrationSummary,
): void {
  console.log(
    "SUMMARY",
  );

  for (
    const classification of
      FULL_PAYMENT_MIGRATION_CLASSIFICATIONS
  ) {
    console.log(
      `${classification.padEnd(42)}: ${
        summary.byClassification[
          classification
        ]
      }`,
    );
  }

  console.log("");

  console.log(
    `${"TOTAL".padEnd(42)}: ${summary.total}`,
  );

  console.log(
    `${"ALREADY CANONICAL".padEnd(42)}: ${
      summary.alreadyCanonical
    }`,
  );

  console.log(
    `${"AUTO-MIGRATABLE".padEnd(42)}: ${
      summary.autoMigratable
    }`,
  );

  console.log(
    `${"PRESERVED".padEnd(42)}: ${
      summary.preserved
    }`,
  );

  console.log(
    `${"MANUAL REVIEW".padEnd(42)}: ${
      summary.manualReview
    }`,
  );

  console.log("");
  console.log(
    "DRY RUN ONLY — NO FIRESTORE WRITES PERFORMED.",
  );
}

function compareResults(
  left:
    FullPaymentMigrationResult,

  right:
    FullPaymentMigrationResult,
): number {
  return (
    (
      left.packageId ??
      ""
    ).localeCompare(
      right.packageId ??
        "",
    ) ||
    (
      left.providerRequestId ??
      ""
    ).localeCompare(
      right.providerRequestId ??
      "",
    ) ||
    left.classification.localeCompare(
      right.classification,
    )
  );
}

function safeId(
  value:
    unknown,
): string | null {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized ||
    null;
}

function requiredNextArgument(
  values:
    readonly string[],

  index:
    number,

  name:
    string,
): string {
  const value =
    values[index + 1];

  if (
    !value ||
    value.startsWith("--")
  ) {
    throw new Error(
      `${name} requires a value.`,
    );
  }

  return value;
}

function parsedPageSize(
  value:
    string,
): number {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed < 1 ||
    parsed > MAX_PAGE_SIZE
  ) {
    throw new Error(
      `Page size must be between 1 and ${MAX_PAGE_SIZE}.`,
    );
  }

  return parsed;
}

void main().catch(
  (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown migration audit error.";

    console.error(
      `P13-B dry run failed: ${message}`,
    );

    process.exitCode =
      1;
  },
);
