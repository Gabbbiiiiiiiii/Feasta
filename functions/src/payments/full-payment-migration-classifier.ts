type UnknownRecord =
  Readonly<Record<string, unknown>>;

export const FULL_PAYMENT_MIGRATION_CLASSIFICATIONS = [
  "already_canonical",
  "migrate_unused_package_to_full_payment",
  "migrate_unpaid_request_to_full_payment",
  "preserve_legacy_paid_deposit",
  "preserve_historical_finance",
  "manual_review_conflict",
  "manual_review_missing_authority",
] as const;

export type FullPaymentMigrationClassification =
  (typeof FULL_PAYMENT_MIGRATION_CLASSIFICATIONS)[number];

export type FullPaymentMigrationRecord = {
  id: string;
  data: UnknownRecord;
};

export type FullPaymentMigrationEvidenceSummary = {
  hasProviderRequest: boolean;

  paymentCount: number;
  settledPaymentCount: number;
  unresolvedPaymentCount: number;

  ledgerEntryCount: number;
  providerEarningCount: number;
  providerSettlementCount: number;
  refundRecordCount: number;

  authoritativeGrossAmountInCentavos:
    number | null;

  authoritativeGrossSource:
    | "financial_snapshot"
    | "provider_request_amount"
    | null;
};

export type FullPaymentMigrationResult = {
  classification:
    FullPaymentMigrationClassification;

  safeToAutoMigrate: boolean;

  reasonCode: string;
  reason: string;

  packageId:
    string | null;

  providerRequestId:
    string | null;

  mainEventId:
    string | null;

  evidence:
    FullPaymentMigrationEvidenceSummary;

  proposedChanges:
    Readonly<Record<string, unknown>> | null;

  conflicts:
    readonly string[];
};

export type FullPaymentMigrationInput = {
  packageId?:
    string | null;

  packageData?:
    UnknownRecord | null;

  providerRequestId?:
    string | null;

  providerRequest?:
    UnknownRecord | null;

  payments?:
    readonly FullPaymentMigrationRecord[];

  financialLedgerEntries?:
    readonly FullPaymentMigrationRecord[];

  providerEarnings?:
    readonly FullPaymentMigrationRecord[];

  providerSettlements?:
    readonly FullPaymentMigrationRecord[];

  refundRecords?:
    readonly FullPaymentMigrationRecord[];
};

const SETTLED_PAYMENT_STATUSES =
  new Set([
    "paid",
    "partially_refunded",
    "refunded",
  ]);

const UNRESOLVED_PAYMENT_STATUSES =
  new Set([
    "pending",
    "processing",
  ]);

const BASIS_POINTS_SCALE =
  10_000;

export function classifyFullPaymentMigration(
  input:
    FullPaymentMigrationInput,
): FullPaymentMigrationResult {
  const packageId =
    normalizedOptionalId(
      input.packageId,
    );

  const packageData =
    input.packageData ?? null;

  const providerRequest =
    input.providerRequest ?? null;

  const providerRequestId =
    normalizedOptionalId(
      input.providerRequestId,
    );

  const mainEventId =
    providerRequest
      ? normalizedOptionalId(
          providerRequest.mainEventId ??
            providerRequest.bookingId,
        )
      : null;

  const payments =
    input.payments ?? [];

  const financialLedgerEntries =
    input.financialLedgerEntries ?? [];

  const providerEarnings =
    input.providerEarnings ?? [];

  const providerSettlements =
    input.providerSettlements ?? [];

  const refundRecords =
    input.refundRecords ?? [];

  const settledPayments =
    payments.filter(
      ({data}) =>
        SETTLED_PAYMENT_STATUSES.has(
          stringValue(
            data.status,
          ) ?? "",
        ),
    );

  const unresolvedPayments =
    payments.filter(
      ({data}) =>
        UNRESOLVED_PAYMENT_STATUSES.has(
          stringValue(
            data.status,
          ) ?? "",
        ),
    );

  const grossAuthority =
    providerRequest
      ? authoritativeGross(
          providerRequest,
        )
      : {
          amountInCentavos:
            null,

          source:
            null,

          conflicts:
            [] as string[],
        };

  const evidence:
    FullPaymentMigrationEvidenceSummary = {
      hasProviderRequest:
        providerRequest !== null,

      paymentCount:
        payments.length,

      settledPaymentCount:
        settledPayments.length,

      unresolvedPaymentCount:
        unresolvedPayments.length,

      ledgerEntryCount:
        financialLedgerEntries.length,

      providerEarningCount:
        providerEarnings.length,

      providerSettlementCount:
        providerSettlements.length,

      refundRecordCount:
        refundRecords.length,

      authoritativeGrossAmountInCentavos:
        grossAuthority
          .amountInCentavos,

      authoritativeGrossSource:
        grossAuthority.source,
    };

  if (!providerRequest) {
    if (
      !packageId ||
      !packageData
    ) {
      return result({
        classification:
          "manual_review_missing_authority",

        reasonCode:
          "package_context_missing",

        reason:
          "Unused package classification requires package identity and package data.",

        packageId,

        providerRequestId:
          null,

        mainEventId:
          null,

        evidence,

        conflicts:
          [
            "package_context_missing",
          ],
      });
    }

    return classifyUnusedPackage({
      packageId,

      packageData,

      evidence,
    });
  }

  if (!providerRequestId) {
    return result({
      classification:
        "manual_review_missing_authority",

      reasonCode:
        "provider_request_id_missing",

      reason:
        "The provider request identifier is missing.",

      packageId,

      providerRequestId:
        null,

      mainEventId,

      evidence,

      conflicts:
        [
          "provider_request_id_missing",
        ],
    });
  }

  const requestType =
    stringValue(
      providerRequest.type,
    );

  if (
    requestType !== "catering" &&
    requestType !== "addon"
  ) {
    return result({
      classification:
        "manual_review_conflict",

      reasonCode:
        "provider_request_type_invalid",

      reason:
        "The provider request type is missing or unsupported.",

      packageId,

      providerRequestId,

      mainEventId,

      evidence,

      conflicts:
        [
          "provider_request_type_invalid",
        ],
    });
  }

  const storedPackageId =
    normalizedOptionalId(
      providerRequest.packageId,
    );

  if (
    requestType === "catering"
  ) {
    if (
      !packageId ||
      !packageData ||
      !storedPackageId
    ) {
      return result({
        classification:
          "manual_review_missing_authority",

        reasonCode:
          "catering_package_authority_missing",

        reason:
          "The catering request does not have complete package authority.",

        packageId,

        providerRequestId,

        mainEventId,

        evidence,

        conflicts:
          [
            "catering_package_authority_missing",
          ],
      });
    }

    if (
      storedPackageId !== packageId
    ) {
      return result({
        classification:
          "manual_review_conflict",

        reasonCode:
          "provider_request_package_mismatch",

        reason:
          "The provider request points to a different package.",

        packageId,

        providerRequestId,

        mainEventId,

        evidence,

        conflicts:
          [
            "provider_request_package_mismatch",
          ],
      });
    }
  }

  if (
    requestType === "addon" &&
    storedPackageId !== null
  ) {
    return result({
      classification:
        "manual_review_conflict",

      reasonCode:
        "addon_request_unexpected_package",

      reason:
        "The add-on request unexpectedly references a catering package.",

      packageId:
        storedPackageId,

      providerRequestId,

      mainEventId,

      evidence,

      conflicts:
        [
          "addon_request_unexpected_package",
        ],
    });
  }
  if (
    grossAuthority.conflicts.length >
      0
  ) {
    return result({
      classification:
        "manual_review_conflict",

      reasonCode:
        "financial_authority_conflict",

      reason:
        "Frozen provider-request financial evidence is inconsistent.",

      packageId,

      providerRequestId,

      mainEventId,

      evidence,

      conflicts:
        grossAuthority.conflicts,
    });
  }

  const hasHistoricalFinance =
    settledPayments.length > 0 ||
    financialLedgerEntries.length >
      0 ||
    providerEarnings.length > 0 ||
    providerSettlements.length >
      0 ||
    refundRecords.length > 0;

  if (hasHistoricalFinance) {
    const paidDeposit =
      settledPayments.some(
        ({data}) =>
          isHistoricalDeposit({
            payment:
              data,

            grossAmountInCentavos:
              grossAuthority
                .amountInCentavos,
          }),
      );

    if (paidDeposit) {
      return result({
        classification:
          "preserve_legacy_paid_deposit",

        reasonCode:
          "historical_deposit_exists",

        reason:
          "A trusted historical deposit exists and must not be rewritten as a full payment.",

        packageId,

        providerRequestId,

        mainEventId,

        evidence,

        conflicts:
          [],
      });
    }

    return result({
      classification:
        "preserve_historical_finance",

      reasonCode:
        "historical_finance_exists",

      reason:
        "Trusted historical financial records exist and must be preserved without recomputation.",

      packageId,

      providerRequestId,

      mainEventId,

      evidence,

      conflicts:
        [],
    });
  }

  if (
    payments.length > 0 ||
    hasPaymentIdentity(
      providerRequest,
    )
  ) {
    return result({
      classification:
        "manual_review_conflict",

      reasonCode:
        "active_or_existing_payment_identity",

      reason:
        "The provider request has an active or existing payment " +
        "identity that must be reconciled before migration.",

      packageId,

      providerRequestId,

      mainEventId,

      evidence,

      conflicts:
        [
          "active_or_existing_payment_identity",
        ],
    });
  }

  const providerRequestStatus =
    stringValue(
      providerRequest.status,
    );

  const lifecycleAllowsAutoMigration =
    providerRequestStatus === "pending" ||
    providerRequestStatus === "accepted" ||
    providerRequestStatus ===
      "waiting_for_down_payment";

  if (!lifecycleAllowsAutoMigration) {
    return result({
      classification:
        "manual_review_conflict",

      reasonCode:
        "provider_request_lifecycle_not_auto_migratable",

      reason:
        "The provider request lifecycle is not eligible for automatic full-payment migration.",

      packageId,

      providerRequestId,

      mainEventId,

      evidence,

      conflicts:
        [
          "provider_request_lifecycle_not_auto_migratable",
        ],
    });
  }

  const grossAmountInCentavos =
    grossAuthority
      .amountInCentavos;

  if (
    grossAmountInCentavos ===
      null
  ) {
    return result({
      classification:
        "manual_review_missing_authority",

      reasonCode:
        "authoritative_gross_missing",

      reason:
        "The frozen full booking amount cannot be proven from " +
        "authoritative provider-request evidence.",

      packageId,

      providerRequestId,

      mainEventId,

      evidence,

      conflicts:
        [
          "authoritative_gross_missing",
        ],
    });
  }

  return result({
    classification:
      "migrate_unpaid_request_to_full_payment",

    safeToAutoMigrate:
      true,

    reasonCode:
      "unpaid_request_has_authoritative_gross",

    reason:
      "The unpaid provider request has authoritative frozen financial " +
        "evidence and no existing financial movement.",

    packageId,

    providerRequestId,

    mainEventId,

    evidence,

    proposedChanges: {
      providerRequest: {
        downPaymentPercentage:
          100,

        downPaymentAmount:
          grossAmountInCentavos /
          100,

        remainingBalance:
          0,

        ...(requestType === "catering"
          ? {
              packagePaymentTerms: {
                schemaVersion:
                  1,

                source:
                  "canonical_package",

                paymentPolicy:
                  "full_payment",

                depositRateBps:
                  BASIS_POINTS_SCALE,

                balanceDueDaysBeforeEvent:
                  null,

                usesLegacyPaymentTerms:
                  false,
              },
            }
          : {}),

        financialSnapshot: {
          preserveExistingSnapshotFields:
            true,

          requiredUpfrontAmountInCentavos:
            grossAmountInCentavos,

          remainingBalanceInCentavos:
            0,

          requiredUpfrontRateBps:
            BASIS_POINTS_SCALE,
        },
      },
    },

    conflicts:
      [],
  });
}

function classifyUnusedPackage(
  input: {
    packageId: string;

    packageData:
      UnknownRecord;

    evidence:
      FullPaymentMigrationEvidenceSummary;
  },
): FullPaymentMigrationResult {
  const paymentPolicy =
    stringValue(
      input.packageData
        .paymentPolicy,
    );

  if (
    paymentPolicy ===
      "full_payment"
  ) {
    const depositPercentage =
      percentage(
        input.packageData
          .depositPercentage,
      );

    const compatibilityPercentage =
      optionalPercentage(
        input.packageData
          .downPaymentPercentage,
      );

    const balance =
      input.packageData
        .balanceDueDaysBeforeEvent;

    const balanceAbsent =
      balance === null ||
      balance === undefined;

    if (
      depositPercentage !== 100 ||
      compatibilityPercentage ===
        "invalid" ||
      (
        typeof compatibilityPercentage ===
          "number" &&
        compatibilityPercentage !==
          100
      ) ||
      !balanceAbsent
    ) {
      return result({
        classification:
          "manual_review_conflict",

        reasonCode:
          "canonical_full_payment_invalid",

        reason:
          "The package claims full payment but its payment-term fields conflict.",

        packageId:
          input.packageId,

        providerRequestId:
          null,

        mainEventId:
          null,

        evidence:
          input.evidence,

        conflicts:
          [
            "canonical_full_payment_invalid",
          ],
      });
    }

    return result({
      classification:
        "already_canonical",

      safeToAutoMigrate:
        true,

      reasonCode:
        "package_already_full_payment",

      reason:
        "The unused package already uses canonical full payment.",

      packageId:
        input.packageId,

      providerRequestId:
        null,

      mainEventId:
        null,

      evidence:
        input.evidence,

      proposedChanges:
        null,

      conflicts:
        [],
    });
  }

  if (
    paymentPolicy ===
      "deposit_then_balance"
  ) {
    const depositPercentage =
      percentage(
        input.packageData
          .depositPercentage,
      );

    const compatibilityPercentage =
      optionalPercentage(
        input.packageData
          .downPaymentPercentage,
      );

    const balanceDays =
      input.packageData
        .balanceDueDaysBeforeEvent;

    if (
      depositPercentage === null ||
      depositPercentage <= 0 ||
      depositPercentage >= 100 ||
      !Number.isSafeInteger(
        balanceDays,
      ) ||
      (balanceDays as number) <
        1 ||
      (balanceDays as number) >
        365 ||
      compatibilityPercentage ===
        "invalid" ||
      (
        typeof compatibilityPercentage ===
          "number" &&
        compatibilityPercentage !==
          depositPercentage
      )
    ) {
      return result({
        classification:
          "manual_review_conflict",

        reasonCode:
          "canonical_deposit_terms_invalid",

        reason:
          "The unused package has conflicting deposit payment terms.",

        packageId:
          input.packageId,

        providerRequestId:
          null,

        mainEventId:
          null,

        evidence:
          input.evidence,

        conflicts:
          [
            "canonical_deposit_terms_invalid",
          ],
      });
    }

    return migrateUnusedPackage(
      input.packageId,
      input.evidence,
      "unused_deposit_package",
    );
  }

  if (
    paymentPolicy !== null &&
    paymentPolicy !== ""
  ) {
    return result({
      classification:
        "manual_review_conflict",

      reasonCode:
        "unknown_payment_policy",

      reason:
        "The package contains an unknown payment policy.",

      packageId:
        input.packageId,

      providerRequestId:
        null,

      mainEventId:
        null,

      evidence:
        input.evidence,

      conflicts:
        [
          "unknown_payment_policy",
        ],
    });
  }

  const legacyPercentage =
    optionalPercentage(
      input.packageData
        .downPaymentPercentage,
    );

  if (
    legacyPercentage ===
      "invalid"
  ) {
    return result({
      classification:
        "manual_review_conflict",

      reasonCode:
        "legacy_percentage_invalid",

      reason:
        "The legacy package down-payment percentage is invalid.",

      packageId:
        input.packageId,

      providerRequestId:
        null,

      mainEventId:
        null,

      evidence:
        input.evidence,

      conflicts:
        [
          "legacy_percentage_invalid",
        ],
    });
  }

  return migrateUnusedPackage(
    input.packageId,
    input.evidence,
    legacyPercentage === null
      ? "unused_legacy_terms_missing"
      : "unused_legacy_package",
  );
}

function migrateUnusedPackage(
  packageId: string,

  evidence:
    FullPaymentMigrationEvidenceSummary,

  reasonCode:
    string,
): FullPaymentMigrationResult {
  return result({
    classification:
      "migrate_unused_package_to_full_payment",

    safeToAutoMigrate:
      true,

    reasonCode,

    reason:
      "The package has no linked provider request or financial history " +
        "and can adopt the full-payment-only policy.",

    packageId,

    providerRequestId:
      null,

    mainEventId:
      null,

    evidence,

    proposedChanges: {
      package: {
        paymentPolicy:
          "full_payment",

        depositPercentage:
          100,

        balanceDueDaysBeforeEvent:
          null,

        downPaymentPercentage:
          100,
      },
    },

    conflicts:
      [],
  });
}

function authoritativeGross(
  providerRequest:
    UnknownRecord,
): {
  amountInCentavos:
    number | null;

  source:
    | "financial_snapshot"
    | "provider_request_amount"
    | null;

  conflicts:
    string[];
} {
  const conflicts:
    string[] = [];

  const snapshot =
    recordValue(
      providerRequest
        .financialSnapshot,
    );

  const requestAmount =
    moneyInCentavos(
      providerRequest.amount,
    );

  const requestDownPayment =
    moneyInCentavosAllowZero(
      providerRequest
        .downPaymentAmount,
    );

  const requestRemaining =
    moneyInCentavosAllowZero(
      providerRequest
        .remainingBalance,
    );

  if (snapshot) {
    const gross =
      positiveCentavos(
        snapshot
          .grossAmountInCentavos,
      );

    const upfront =
      nonNegativeCentavos(
        snapshot
          .requiredUpfrontAmountInCentavos,
      );

    const remaining =
      nonNegativeCentavos(
        snapshot
          .remainingBalanceInCentavos,
      );

    if (
      snapshot.schemaVersion !==
        1 ||
      snapshot.currency !==
        "PHP" ||
      gross === null ||
      upfront === null ||
      remaining === null ||
      upfront + remaining !==
        gross
    ) {
      conflicts.push(
        "financial_snapshot_invalid",
      );

      return {
        amountInCentavos:
          null,

        source:
          null,

        conflicts,
      };
    }

    if (
      requestAmount !== null &&
      requestAmount !== gross
    ) {
      conflicts.push(
        "request_amount_snapshot_mismatch",
      );
    }

    if (
      requestDownPayment !==
        null &&
      requestRemaining !== null &&
      requestDownPayment +
        requestRemaining !==
        gross
    ) {
      conflicts.push(
        "request_split_snapshot_mismatch",
      );
    }

    return {
      amountInCentavos:
        gross,

      source:
        "financial_snapshot",

      conflicts,
    };
  }

  if (
    requestAmount === null
  ) {
    return {
      amountInCentavos:
        null,

      source:
        null,

      conflicts,
    };
  }

  if (
    requestDownPayment !== null &&
    requestRemaining !== null &&
    requestDownPayment +
      requestRemaining !==
      requestAmount
  ) {
    conflicts.push(
      "provider_request_amounts_inconsistent",
    );
  }

  return {
    amountInCentavos:
      requestAmount,

    source:
      "provider_request_amount",

    conflicts,
  };
}

function isHistoricalDeposit(
  input: {
    payment:
      UnknownRecord;

    grossAmountInCentavos:
      number | null;
  },
): boolean {
  if (
    input.payment
      .paymentChoice ===
      "minimum"
  ) {
    return true;
  }

  if (
    input.payment
      .paymentChoice ===
      "full"
  ) {
    return false;
  }

  if (
    input.payment.paymentType !==
      "provider_down_payment"
  ) {
    return false;
  }

  const paymentAmount =
    paymentAmountInCentavos(
      input.payment,
    );

  return (
    paymentAmount !== null &&
    input.grossAmountInCentavos !==
      null &&
    paymentAmount <
      input.grossAmountInCentavos
  );
}

function paymentAmountInCentavos(
  payment:
    UnknownRecord,
): number | null {
  const canonical =
    positiveCentavos(
      payment.amountInCentavos,
    );

  if (canonical !== null) {
    return canonical;
  }

  return moneyInCentavos(
    payment.amount,
  );
}

function hasPaymentIdentity(
  providerRequest:
    UnknownRecord,
): boolean {
  return [
    providerRequest.paymentId,
    providerRequest.initialPaymentId,
    providerRequest
      .remainingBalancePaymentId,
    providerRequest
      .initialPaymentChoice,
  ].some(
    (value) =>
      value !== null &&
      value !== undefined,
  );
}

function result(
  input: {
    classification:
      FullPaymentMigrationClassification;

    safeToAutoMigrate?:
      boolean;

    reasonCode:
      string;

    reason:
      string;

    packageId:
      string | null;

    providerRequestId:
      string | null;

    mainEventId:
      string | null;

    evidence:
      FullPaymentMigrationEvidenceSummary;

    proposedChanges?:
      Readonly<
        Record<string, unknown>
      > | null;

    conflicts:
      readonly string[];
  },
): FullPaymentMigrationResult {
  return {
    classification:
      input.classification,

    safeToAutoMigrate:
      input.safeToAutoMigrate ??
      false,

    reasonCode:
      input.reasonCode,

    reason:
      input.reason,

    packageId:
      input.packageId,

    providerRequestId:
      input.providerRequestId,

    mainEventId:
      input.mainEventId,

    evidence:
      input.evidence,

    proposedChanges:
      input.proposedChanges ??
      null,

    conflicts:
      [...input.conflicts],
  };
}

function normalizedId(
  value:
    unknown,
): string {
  return (
    typeof value === "string"
  )
    ? value.trim()
    : "";
}

function normalizedOptionalId(
  value:
    unknown,
): string | null {
  const normalized =
    normalizedId(value);

  return normalized ||
    null;
}

function stringValue(
  value:
    unknown,
): string | null {
  return typeof value ===
    "string"
    ? value
    : null;
}

function recordValue(
  value:
    unknown,
): UnknownRecord | null {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as UnknownRecord
    : null;
}

function percentage(
  value:
    unknown,
): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  )
    ? Math.round(
        (value +
          Number.EPSILON) *
          100,
      ) / 100
    : null;
}

function optionalPercentage(
  value:
    unknown,
): number | null | "invalid" {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  return percentage(value) ??
    "invalid";
}

function moneyInCentavos(
  value:
    unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  const centavos =
    Math.round(
      (value +
        Number.EPSILON) *
        100,
    );

  return Number.isSafeInteger(
    centavos,
  )
    ? centavos
    : null;
}

function moneyInCentavosAllowZero(
  value:
    unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }

  const centavos =
    Math.round(
      (value +
        Number.EPSILON) *
        100,
    );

  return Number.isSafeInteger(
    centavos,
  )
    ? centavos
    : null;
}

function positiveCentavos(
  value:
    unknown,
): number | null {
  return (
    Number.isSafeInteger(value) &&
    (value as number) > 0
  )
    ? value as number
    : null;
}

function nonNegativeCentavos(
  value:
    unknown,
): number | null {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0
  )
    ? value as number
    : null;
}
