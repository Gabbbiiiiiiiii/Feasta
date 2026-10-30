const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const sourcePath =
  path.resolve(
    __dirname,
    "../src/scripts/full-payment-migration-dry-run.ts",
  );

const source =
  fs.readFileSync(
    sourcePath,
    "utf8",
  );

test(
  "P13-B dry run contains no Firestore mutation path",
  () => {
    for (
      const forbidden of [
        /firestore\.batch\s*\(/u,
        /firestore\.runTransaction\s*\(/u,
        /transaction\.(?:create|set|update|delete)\s*\(/u,
        /batch\.(?:create|set|update|delete)\s*\(/u,
        /bulkWriter\s*\(/iu,
        /\.ref\.(?:create|set|update|delete)\s*\(/u,
        /\.doc\s*\([^)]*\)[\s\S]{0,120}\.(?:create|set|update|delete)\s*\(/u,
      ]
    ) {
      assert.doesNotMatch(
        source,
        forbidden,
      );
    }

    /*
     * Map.set() is allowed. It mutates only the
     * in-memory grouping Map and is not a
     * Firestore write operation.
     */
    assert.match(
      source,
      /grouped\.set\s*\(/u,
    );
  },
);

test(
  "P13-B dry run requires explicit project selection",
  () => {
    assert.match(
      source,
      /--project/u,
    );

    assert.match(
      source,
      /Specify an explicit Firebase project/u,
    );

    assert.doesNotMatch(
      source,
      /GCLOUD_PROJECT|GOOGLE_CLOUD_PROJECT|FIREBASE_CONFIG/u,
    );
  },
);

test(
  "P13-B dry run rejects apply mode",
  () => {
    assert.match(
      source,
      /--apply/u,
    );

    assert.match(
      source,
      /P13-B is read-only/u,
    );
  },
);

test(
  "P13-B dry run reads all financial evidence collections",
  () => {
    for (
      const collection of [
        "packages",
        "providerRequests",
        "payments",
        "financialLedgerEntries",
        "providerEarnings",
        "providerSettlements",
      ]
    ) {
      assert.match(
        source,
        new RegExp(
          `"${collection}"`,
          "u",
        ),
      );
    }
  },
);

test(
  "P13-B dry run classifies through the pure migration classifier",
  () => {
    assert.match(
      source,
      /classifyFullPaymentMigration/u,
    );

    assert.match(
      source,
      /FULL_PAYMENT_MIGRATION_CLASSIFICATIONS/u,
    );
  },
);

test(
  "P13-B output omits customer identity fields",
  () => {
    const manualReviewBlock =
      source.slice(
        source.indexOf(
          "function printManualReview",
        ),
        source.indexOf(
          "function printSummary",
        ),
      );

    assert.doesNotMatch(
      manualReviewBlock,
      /customerId|email|phone|address/iu,
    );

    assert.match(
      manualReviewBlock,
      /packageId/u,
    );

    assert.match(
      manualReviewBlock,
      /providerRequestId/u,
    );

    assert.match(
      manualReviewBlock,
      /reasonCode/u,
    );
  },
);

test(
  "P13-B report declares itself read-only",
  () => {
    assert.match(
      source,
      /DRY RUN ONLY — NO FIRESTORE WRITES PERFORMED\./u,
    );
  },
);

test(
  "P13-B reports broken provider-request package linkage",
  () => {
    assert.match(
      source,
      /findScanAnomalies/u,
    );

    assert.match(
      source,
      /provider_request_package_id_missing/u,
    );

    assert.match(
      source,
      /provider_request_package_missing/u,
    );

    assert.match(
      source,
      /manual_review_missing_authority/u,
    );
  },
);

test(
  "P13-B excludes add-on requests from catering package migration scope",
  () => {
    assert.match(
      source,
      /requestRecord\.data\.type ===[\s\S]*"catering"/u,
    );

    assert.match(
      source,
      /requestType === "addon"/u,
    );

    assert.match(
      source,
      /provider_request_type_missing_or_invalid/u,
    );

    assert.match(
      source,
      /provider_request_package_id_missing/u,
    );

    assert.match(
      source,
      /provider_request_package_missing/u,
    );
  },
);

test(
  "P13-B classifies add-on provider requests independently of packages",
  () => {
    assert.match(
      source,
      /const addonRequests/u,
    );

    assert.match(
      source,
      /packageId:[\s\S]*null[\s\S]*packageData:[\s\S]*null/u,
    );

    assert.match(
      source,
      /for \([\s\S]*const requestRecord of[\s\S]*addonRequests/u,
    );
  },
);

test(
  "P13-B prints non-PII per-record migration decisions",
  () => {
    assert.match(
      source,
      /function printDecisions/u,
    );

    assert.match(
      source,
      /safeToAutoMigrate/u,
    );

    const start =
      source.indexOf(
        "function printDecisions",
      );

    const end =
      source.indexOf(
        "function printScanAnomalies",
      );

    const block =
      source.slice(
        start,
        end,
      );

    assert.doesNotMatch(
      block,
      /customerId|email|phone|address/iu,
    );
  },
);

test(
  "P13-B reads refund-operation evidence instead of assuming none",
  () => {
    assert.match(
      source,
      /collectionGroup/u,
    );

    assert.match(
      source,
      /COLLECTIONS\.refunds/u,
    );

    assert.match(
      source,
      /refundsByRequest/u,
    );

    assert.match(
      source,
      /refundRecords:[\s\S]*migrationRecords/u,
    );

    assert.doesNotMatch(
      source,
      /refundRecords:\s*\[\]/u,
    );
  },
);

test(
  "P13-B decision report includes provider-request lifecycle status",
  () => {
    assert.match(
      source,
      /requestStatusById/u,
    );

    assert.match(
      source,
      /providerRequestStatus/u,
    );
  },
);
