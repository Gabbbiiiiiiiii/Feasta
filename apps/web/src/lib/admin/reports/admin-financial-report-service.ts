import "server-only";

import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  requireAdmin,
} from "@/lib/auth/session";

import {
  adminDb,
} from "@/lib/firebase/admin";

import type {
  AdminPaymentProviderEarningStatus,
  AdminPaymentProviderSettlementStatus,
} from "@/lib/admin/payments/admin-payment-types";

import {
  resolveAdminReportFilters,
} from "./admin-report-policy";

import type {
  AdminReportFilters,
  AdminReportResolvedFilters,
} from "./admin-report-types";

import {
  summarizeAdminFinancialLedger,
  summarizeAdminGatewayFees,
  summarizeAdminProviderEarnings,
  summarizeAdminSettlementPayouts,
} from "./admin-financial-report-domain";

import type {
  AdminFinancialLedgerRow,
  AdminFinancialReport,
  AdminGatewayFeeEvidenceRow,
  AdminProviderEarningPeriodRow,
  AdminSettlementPayoutRow,
} from "./admin-financial-report-types";

const COLLECTIONS = {
  financialLedger:
    "financialLedgerEntries",

  providerEarnings:
    "providerEarnings",

  providerSettlements:
    "providerSettlements",

  payments:
    "payments",
} as const;

const SAFE_ID =
  /^[A-Za-z0-9:_-]{1,220}$/u;

const EARNING_STATUSES =
  new Set<
    AdminPaymentProviderEarningStatus
  >([
    "pending",
    "available",
    "paid",
    "reversed",
  ]);

const SETTLEMENT_STATUSES =
  new Set<
    AdminPaymentProviderSettlementStatus
  >([
    "awaiting_availability",
    "ready",
    "reserved",
    "processing",
    "paid",
    "reconciliation_required",
    "cancelled",
  ]);

export async function getAdminFinancialReport(
  input: AdminReportFilters,
): Promise<AdminFinancialReport> {
  await requireAdmin();

  return queryAdminFinancialReport(
    resolveAdminReportFilters(
      input,
    ),
  );
}

export async function getAdminFinancialReportForResolvedFilters(
  input: AdminReportResolvedFilters,
): Promise<AdminFinancialReport> {
  await requireAdmin();

  return queryAdminFinancialReport(
    input,
  );
}

async function queryAdminFinancialReport(
  resolved: AdminReportResolvedFilters,
): Promise<AdminFinancialReport> {
  const period =
    resolved.period;

  const start =
    Timestamp.fromDate(
      new Date(
        period.startAt,
      ),
    );

  const end =
    Timestamp.fromDate(
      new Date(
        period.endAtExclusive,
      ),
    );

  /*
   * Financial reporting is intentionally period-based and
   * platform-wide.
   *
   * Operational filters such as booking status or event type
   * must not reinterpret immutable financial ledger movements.
   */
  const [
    ledgerSnapshot,
    earningsSnapshot,
    settlementsSnapshot,
    paymentsSnapshot,
  ] =
    await Promise.all([
      adminDb
        .collection(
          COLLECTIONS.financialLedger,
        )
        .where(
          "createdAt",
          ">=",
          start,
        )
        .where(
          "createdAt",
          "<",
          end,
        )
        .select(
          "schemaVersion",
          "entryType",
          "ledgerEntryId",
          "paymentId",
          "providerRequestId",
          "mainEventId",
          "providerId",
          "currency",
          "grossAmountInCentavos",
          "refundAmountInCentavos",
          "commissionAccruedInCentavos",
          "commissionReversedInCentavos",
          "providerVatInCentavos",
          "providerVatReversedInCentavos",
          "platformVatInCentavos",
          "platformVatReversedInCentavos",
          "withholdingInCentavos",
          "withholdingReversedInCentavos",
          "createdAt",
        )
        .get(),

      adminDb
        .collection(
          COLLECTIONS.providerEarnings,
        )
        .where(
          "createdAt",
          ">=",
          start,
        )
        .where(
          "createdAt",
          "<",
          end,
        )
        .select(
          "schemaVersion",
          "earningId",
          "paymentId",
          "providerRequestId",
          "mainEventId",
          "providerId",
          "currency",
          "status",
          "earningAmountInCentavos",
          "reversedAmountInCentavos",
          "netEarningAmountInCentavos",
          "pendingAmountInCentavos",
          "availableAmountInCentavos",
          "paidAmountInCentavos",
          "createdAt",
        )
        .get(),

      adminDb
        .collection(
          COLLECTIONS.providerSettlements,
        )
        .where(
          "paidOutAt",
          ">=",
          start,
        )
        .where(
          "paidOutAt",
          "<",
          end,
        )
        .select(
          "schemaVersion",
          "settlementId",
          "earningId",
          "paymentId",
          "providerId",
          "currency",
          "status",
          "netSettlementAmountInCentavos",
          "paidOutAmountInCentavos",
          "reconciliationRequired",
          "paidOutAt",
        )
        .get(),

      adminDb
        .collection(
          COLLECTIONS.payments,
        )
        .where(
          "paidAt",
          ">=",
          start,
        )
        .where(
          "paidAt",
          "<",
          end,
        )
        .select(
          "paymentId",
          "providerId",
          "currency",
          "gatewayProcessingFeeEvidence",
          "paidAt",
        )
        .get(),
    ]);

  let malformedLedgerCount =
    0;

  const ledgerRows:
    AdminFinancialLedgerRow[] =
      [];

  for (
    const document of
      ledgerSnapshot.docs
  ) {
    const row =
      normalizeLedgerRow(
        document,
      );

    if (!row) {
      malformedLedgerCount +=
        1;

      continue;
    }

    ledgerRows.push(
      row,
    );
  }

  let malformedEarningCount =
    0;

  const providerEarningRows:
    AdminProviderEarningPeriodRow[] =
      [];

  for (
    const document of
      earningsSnapshot.docs
  ) {
    const row =
      normalizeEarningRow(
        document,
      );

    if (!row) {
      malformedEarningCount +=
        1;

      continue;
    }

    providerEarningRows.push(
      row,
    );
  }

  let malformedSettlementCount =
    0;

  const settlementPayoutRows:
    AdminSettlementPayoutRow[] =
      [];

  for (
    const document of
      settlementsSnapshot.docs
  ) {
    const row =
      normalizeSettlementPayoutRow(
        document,
      );

    if (!row) {
      malformedSettlementCount +=
        1;

      continue;
    }

    settlementPayoutRows.push(
      row,
    );
  }

  const gatewayFeeRows =
    paymentsSnapshot.docs.map(
      normalizeGatewayFeeRow,
    );

  ledgerRows.sort(
    newestLedgerFirst,
  );

  providerEarningRows.sort(
    (left, right) =>
      right.createdAt.localeCompare(
        left.createdAt,
      ),
  );

  settlementPayoutRows.sort(
    (left, right) =>
      right.paidOutAt.localeCompare(
        left.paidOutAt,
      ),
  );

  gatewayFeeRows.sort(
    (left, right) =>
      right.paidAt.localeCompare(
        left.paidAt,
      ),
  );

  return {
    documentKind:
      "admin_financial_report",

    currency:
      "PHP",

    timeZone:
      "Asia/Manila",

    period,

    ledgerRows,

    providerEarningRows,

    settlementPayoutRows,

    gatewayFeeRows,

    ledger:
      summarizeAdminFinancialLedger(
        ledgerRows,
        malformedLedgerCount,
      ),

    providerEarnings:
      summarizeAdminProviderEarnings(
        providerEarningRows,
        malformedEarningCount,
      ),

    settlementPayouts:
      summarizeAdminSettlementPayouts(
        settlementPayoutRows,
        malformedSettlementCount,
      ),

    gatewayFees:
      summarizeAdminGatewayFees(
        gatewayFeeRows,
      ),

    generatedAt:
      new Date()
        .toISOString(),

    scopeNotice:
      "Financial movements use the selected reporting period and remain platform-wide. Operational booking, event, and status filters do not reinterpret immutable finance records.",

    gatewayFeeNotice:
      "Gateway processing fees are reported only when trusted PayMongo payment-resource evidence was observed. Missing evidence remains unavailable and is never treated as zero.",

    recordNotice:
      "This Financial Report is a FEASTA administrative platform record for authorized internal use. It is not a statutory fiscal document.",
  };
}

export function normalizeLedgerRow(
  document:
    QueryDocumentSnapshot<
      DocumentData
    >,
): AdminFinancialLedgerRow | null {
  const data =
    document.data();

  const ledgerEntryId =
    safeId(
      data.ledgerEntryId,
    );

  const paymentId =
    safeId(
      data.paymentId,
    );

  const providerRequestId =
    safeId(
      data.providerRequestId,
    );

  const mainEventId =
    safeId(
      data.mainEventId,
    );

  const providerId =
    safeId(
      data.providerId,
    );

  const createdAt =
    timestampIso(
      data.createdAt,
    );

  if (
    data.schemaVersion !==
      1 ||
    ledgerEntryId !==
      document.id ||
    !paymentId ||
    !providerRequestId ||
    !mainEventId ||
    !providerId ||
    data.currency !==
      "PHP" ||
    !createdAt
  ) {
    return null;
  }

  if (
    data.entryType ===
      "payment_settled"
  ) {
    const gross =
      positiveMoney(
        data.grossAmountInCentavos,
      );

    const commission =
      money(
        data.commissionAccruedInCentavos,
      );

    const providerVat =
      money(
        data.providerVatInCentavos,
      );

    const platformVat =
      money(
        data.platformVatInCentavos,
      );

    const withholding =
      money(
        data.withholdingInCentavos,
      );

    if (
      gross === null ||
      commission === null ||
      providerVat === null ||
      platformVat === null ||
      withholding === null ||
      commission > gross ||
      providerVat > gross ||
      platformVat > commission ||
      withholding > gross
    ) {
      return null;
    }

    return {
      ledgerEntryId,
      entryType:
        "payment_settled",

      paymentId,
      providerRequestId,
      mainEventId,
      providerId,

      currency:
        "PHP",

      grossAmountInCentavos:
        gross,

      refundAmountInCentavos:
        0,

      commissionAccruedInCentavos:
        commission,

      commissionReversedInCentavos:
        0,

      providerVatAccruedInCentavos:
        providerVat,

      providerVatReversedInCentavos:
        0,

      platformVatAccruedInCentavos:
        platformVat,

      platformVatReversedInCentavos:
        0,

      withholdingAccruedInCentavos:
        withholding,

      withholdingReversedInCentavos:
        0,

      createdAt,
    };
  }

  if (
    data.entryType ===
      "refund_completed"
  ) {
    const refund =
      positiveMoney(
        data.refundAmountInCentavos,
      );

    const commission =
      money(
        data.commissionReversedInCentavos,
      );

    const providerVat =
      money(
        data.providerVatReversedInCentavos,
      );

    const platformVat =
      money(
        data.platformVatReversedInCentavos,
      );

    const withholding =
      money(
        data.withholdingReversedInCentavos,
      );

    if (
      refund === null ||
      commission === null ||
      providerVat === null ||
      platformVat === null ||
      withholding === null
    ) {
      return null;
    }

    return {
      ledgerEntryId,
      entryType:
        "refund_completed",

      paymentId,
      providerRequestId,
      mainEventId,
      providerId,

      currency:
        "PHP",

      grossAmountInCentavos:
        0,

      refundAmountInCentavos:
        refund,

      commissionAccruedInCentavos:
        0,

      commissionReversedInCentavos:
        commission,

      providerVatAccruedInCentavos:
        0,

      providerVatReversedInCentavos:
        providerVat,

      platformVatAccruedInCentavos:
        0,

      platformVatReversedInCentavos:
        platformVat,

      withholdingAccruedInCentavos:
        0,

      withholdingReversedInCentavos:
        withholding,

      createdAt,
    };
  }

  return null;
}

function normalizeEarningRow(
  document:
    QueryDocumentSnapshot<
      DocumentData
    >,
): AdminProviderEarningPeriodRow | null {
  const data =
    document.data();

  const earningId =
    safeId(
      data.earningId,
    );

  const paymentId =
    safeId(
      data.paymentId,
    );

  const providerRequestId =
    safeId(
      data.providerRequestId,
    );

  const mainEventId =
    safeId(
      data.mainEventId,
    );

  const providerId =
    safeId(
      data.providerId,
    );

  const status =
    earningStatus(
      data.status,
    );

  const createdAt =
    timestampIso(
      data.createdAt,
    );

  const original =
    money(
      data.earningAmountInCentavos,
    );

  const reversed =
    money(
      data.reversedAmountInCentavos,
    );

  const net =
    money(
      data.netEarningAmountInCentavos,
    );

  const pending =
    money(
      data.pendingAmountInCentavos,
    );

  const available =
    money(
      data.availableAmountInCentavos,
    );

  const paid =
    money(
      data.paidAmountInCentavos,
    );

  if (
    data.schemaVersion !==
      1 ||
    earningId !==
      document.id ||
    !paymentId ||
    !providerRequestId ||
    !mainEventId ||
    !providerId ||
    data.currency !==
      "PHP" ||
    !status ||
    !createdAt ||
    original === null ||
    reversed === null ||
    net === null ||
    pending === null ||
    available === null ||
    paid === null ||
    reversed > original ||
    net !==
      original -
      reversed ||
    safeAdd(
      safeAdd(
        pending,
        available,
      ),
      safeAdd(
        paid,
        reversed,
      ),
    ) !==
      original
  ) {
    return null;
  }

  return {
    earningId,
    paymentId,
    providerRequestId,
    mainEventId,
    providerId,

    status,

    currency:
      "PHP",

    originalEarningInCentavos:
      original,

    reversedAmountInCentavos:
      reversed,

    netEarningInCentavos:
      net,

    pendingAmountInCentavos:
      pending,

    availableAmountInCentavos:
      available,

    paidAmountInCentavos:
      paid,

    createdAt,
  };
}

function normalizeSettlementPayoutRow(
  document:
    QueryDocumentSnapshot<
      DocumentData
    >,
): AdminSettlementPayoutRow | null {
  const data =
    document.data();

  const settlementId =
    safeId(
      data.settlementId,
    );

  const earningId =
    safeId(
      data.earningId,
    );

  const paymentId =
    safeId(
      data.paymentId,
    );

  const providerId =
    safeId(
      data.providerId,
    );

  const status =
    settlementStatus(
      data.status,
    );

  const paidOutAt =
    timestampIso(
      data.paidOutAt,
    );

  const netSettlement =
    money(
      data.netSettlementAmountInCentavos,
    );

  const paidOut =
    positiveMoney(
      data.paidOutAmountInCentavos,
    );

  if (
    data.schemaVersion !==
      1 ||
    settlementId !==
      document.id ||
    !earningId ||
    !paymentId ||
    !providerId ||
    data.currency !==
      "PHP" ||
    !status ||
    !paidOutAt ||
    netSettlement === null ||
    paidOut === null ||
    paidOut > netSettlement
  ) {
    return null;
  }

  return {
    settlementId,
    earningId,
    paymentId,
    providerId,

    status,

    currency:
      "PHP",

    netSettlementAmountInCentavos:
      netSettlement,

    paidOutAmountInCentavos:
      paidOut,

    reconciliationRequired:
      data.reconciliationRequired ===
        true,

    paidOutAt,
  };
}

function normalizeGatewayFeeRow(
  document:
    QueryDocumentSnapshot<
      DocumentData
    >,
): AdminGatewayFeeEvidenceRow {
  const data =
    document.data();

  const paymentId =
    safeId(
      data.paymentId,
    ) ??
    document.id;

  const providerId =
    safeId(
      data.providerId,
    ) ??
    "unknown";

  const paidAt =
    timestampIso(
      data.paidAt,
    ) ??
    new Date(0)
      .toISOString();

  if (
    paymentId !==
      document.id ||
    providerId ===
      "unknown" ||
    data.currency !==
      "PHP" ||
    paidAt ===
      new Date(0)
        .toISOString()
  ) {
    return {
      paymentId:
        document.id,

      providerId,

      currency:
        "PHP",

      status:
        "invalid",

      amountInCentavos:
        null,

      paidAt,
    };
  }

  const evidence =
    data
      .gatewayProcessingFeeEvidence;

  if (
    evidence === undefined ||
    evidence === null
  ) {
    return {
      paymentId,
      providerId,

      currency:
        "PHP",

      status:
        "unavailable",

      amountInCentavos:
        null,

      paidAt,
    };
  }

  if (
    typeof evidence !==
      "object"
  ) {
    return invalidGatewayFeeRow({
      paymentId,
      providerId,
      paidAt,
    });
  }

  const record =
    evidence as
      Record<string, unknown>;

  if (
    record.schemaVersion !==
      1 ||
    record.provider !==
      "paymongo" ||
    record.source !==
      "paymongo_payment_resource" ||
    record.currency !==
      "PHP"
  ) {
    return invalidGatewayFeeRow({
      paymentId,
      providerId,
      paidAt,
    });
  }

  if (
    record.status ===
      "unavailable"
  ) {
    if (
      record.amountInCentavos !==
        null
    ) {
      return invalidGatewayFeeRow({
        paymentId,
        providerId,
        paidAt,
      });
    }

    return {
      paymentId,
      providerId,

      currency:
        "PHP",

      status:
        "unavailable",

      amountInCentavos:
        null,

      paidAt,
    };
  }

  if (
    record.status ===
      "observed"
  ) {
    const amount =
      money(
        record.amountInCentavos,
      );

    if (
      amount === null
    ) {
      return invalidGatewayFeeRow({
        paymentId,
        providerId,
        paidAt,
      });
    }

    return {
      paymentId,
      providerId,

      currency:
        "PHP",

      status:
        "observed",

      amountInCentavos:
        amount,

      paidAt,
    };
  }

  return invalidGatewayFeeRow({
    paymentId,
    providerId,
    paidAt,
  });
}

function invalidGatewayFeeRow(
  input: {
    paymentId: string;
    providerId: string;
    paidAt: string;
  },
): AdminGatewayFeeEvidenceRow {
  return {
    paymentId:
      input.paymentId,

    providerId:
      input.providerId,

    currency:
      "PHP",

    status:
      "invalid",

    amountInCentavos:
      null,

    paidAt:
      input.paidAt,
  };
}

function earningStatus(
  value: unknown,
): AdminPaymentProviderEarningStatus | null {
  return typeof value ===
      "string" &&
    EARNING_STATUSES.has(
      value as
        AdminPaymentProviderEarningStatus,
    )
    ? value as
      AdminPaymentProviderEarningStatus
    : null;
}

function settlementStatus(
  value: unknown,
): AdminPaymentProviderSettlementStatus | null {
  return typeof value ===
      "string" &&
    SETTLEMENT_STATUSES.has(
      value as
        AdminPaymentProviderSettlementStatus,
    )
    ? value as
      AdminPaymentProviderSettlementStatus
    : null;
}

function safeId(
  value: unknown,
): string | null {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return SAFE_ID.test(
    normalized,
  )
    ? normalized
    : null;
}

function money(
  value: unknown,
): number | null {
  return typeof value ===
      "number" &&
    Number.isSafeInteger(
      value,
    ) &&
    value >= 0
    ? value
    : null;
}

function positiveMoney(
  value: unknown,
): number | null {
  const parsed =
    money(
      value,
    );

  return parsed !== null &&
    parsed > 0
    ? parsed
    : null;
}

function safeAdd(
  left: number,
  right: number,
): number {
  const result =
    left +
    right;

  return Number.isSafeInteger(
      result,
    )
    ? result
    : Number.NaN;
}

function timestampIso(
  value: unknown,
): string | null {
  if (
    value instanceof
      Timestamp
  ) {
    return value
      .toDate()
      .toISOString();
  }

  if (
    value instanceof Date &&
    Number.isFinite(
      value.getTime(),
    )
  ) {
    return value
      .toISOString();
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "toDate" in value &&
    typeof value.toDate ===
      "function"
  ) {
    const date =
      value.toDate();

    return date instanceof
        Date &&
      Number.isFinite(
        date.getTime(),
      )
      ? date
          .toISOString()
      : null;
  }

  return null;
}

function newestLedgerFirst(
  left:
    AdminFinancialLedgerRow,

  right:
    AdminFinancialLedgerRow,
): number {
  return right
    .createdAt
    .localeCompare(
      left.createdAt,
    );
}