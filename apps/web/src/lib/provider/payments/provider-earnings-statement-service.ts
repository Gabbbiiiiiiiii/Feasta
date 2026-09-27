import "server-only";

import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  requireApprovedProvider,
} from "@/lib/auth/session";

import {
  adminDb,
} from "@/lib/firebase/admin";

import type {
  ProviderEarningStatus,
  ProviderSettlementStatus,
} from "./provider-finance-types";

import type {
  ProviderEarningsStatement,
  ProviderEarningsStatementPeriod,
  ProviderEarningsStatementRow,
  ProviderEarningsStatementSettlement,
  ProviderEarningsStatementTotals,
} from "./provider-earnings-statement-types";

const MANILA_UTC_OFFSET_MS =
  8 * 60 * 60 * 1000;

const EARNING_STATUSES =
  new Set<ProviderEarningStatus>([
    "pending",
    "available",
    "paid",
    "reversed",
  ]);

const SETTLEMENT_STATUSES =
  new Set<ProviderSettlementStatus>([
    "awaiting_availability",
    "ready",
    "reserved",
    "processing",
    "paid",
    "reconciliation_required",
    "cancelled",
  ]);

const SAFE_ID =
  /^[A-Za-z0-9:_-]{1,220}$/u;

export async function getProviderEarningsStatement(
  requestedMonth?: string | null,
): Promise<ProviderEarningsStatement> {
  const account =
    await requireApprovedProvider();

  const providerId =
    safeId(
      account.providerId,
    );

  if (!providerId) {
    throw new Error(
      "The approved Provider profile is unavailable.",
    );
  }

  const month =
    requestedMonth ===
      undefined ||
    requestedMonth ===
      null ||
    requestedMonth.trim() ===
      ""
      ? currentManilaMonth()
      : normalizeProviderEarningsStatementMonth(
          requestedMonth,
        );

  if (!month) {
    throw new Error(
      "The Provider Earnings Statement month is invalid.",
    );
  }

  const period =
    statementPeriod(
      month,
    );

  const startTimestamp =
    Timestamp.fromDate(
      new Date(
        period.startAt,
      ),
    );

  const endTimestamp =
    Timestamp.fromDate(
      new Date(
        period.endAtExclusive,
      ),
    );

  const earningsQuery =
    adminDb
      .collection(
        "providerEarnings",
      )
      .where(
        "providerId",
        "==",
        providerId,
      )
      .where(
        "createdAt",
        ">=",
        startTimestamp,
      )
      .where(
        "createdAt",
        "<",
        endTimestamp,
      )
      .orderBy(
        "createdAt",
        "desc",
      );

  /*
   * Settlements are read independently from earnings because
   * Customer payment truth, Provider earning truth, and
   * Provider settlement truth are intentionally separate.
   */
  const settlementsQuery =
    adminDb
      .collection(
        "providerSettlements",
      )
      .where(
        "providerId",
        "==",
        providerId,
      );

  const [
    providerSnapshot,
    earningsSnapshot,
    settlementsSnapshot,
  ] =
    await Promise.all([
      adminDb
        .collection(
          "providers",
        )
        .doc(
          providerId,
        )
        .get(),

      earningsQuery.get(),

      settlementsQuery.get(),
    ]);

  if (
    !providerSnapshot.exists ||
    providerSnapshot.id !==
      providerId
  ) {
    throw new Error(
      "The approved Provider profile is unavailable.",
    );
  }

  const provider =
    providerSnapshot.data() ??
    {};

  const settlementsByEarning =
    buildSettlementMap(
      settlementsSnapshot.docs,
      providerId,
    );

  let skippedMalformedCount =
    0;

  const rows:
    ProviderEarningsStatementRow[] =
      [];

  for (
    const document of
      earningsSnapshot.docs
  ) {
    const row =
      normalizeStatementEarning({
        document,
        expectedProviderId:
          providerId,
        settlementsByEarning,
      });

    if (!row) {
      skippedMalformedCount +=
        1;

      continue;
    }

    rows.push(
      row,
    );
  }

  const missingSettlementCount =
    rows.filter(
      (row) =>
        row.settlement ===
        null,
    ).length;

  return {
    documentKind:
      "provider_earnings_statement",

    providerId,

    providerName:
      boundedText(
        provider.businessName,
        "FEASTA Provider",
        160,
      ),

    currency:
      "PHP",

    period,

    rows,

    totals:
      summarizeRows(
        rows,
      ),

    skippedMalformedCount,

    missingSettlementCount,

    generatedAt:
      new Date()
        .toISOString(),

    recordNotice:
      "This Provider Earnings Statement is a FEASTA platform finance record. It is not a statutory fiscal document.",
  };
}

export function normalizeProviderEarningsStatementMonth(
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

  const match =
    /^(\d{4})-(0[1-9]|1[0-2])$/u
      .exec(
        normalized,
      );

  if (!match) {
    return null;
  }

  const year =
    Number(
      match[1],
    );

  if (
    !Number.isSafeInteger(
      year,
    ) ||
    year < 2000 ||
    year > 2099
  ) {
    return null;
  }

  return normalized;
}

function currentManilaMonth():
string {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Manila",

        year:
          "numeric",

        month:
          "2-digit",
      },
    ).formatToParts(
      new Date(),
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        "month",
    )?.value;

  if (
    !year ||
    !month
  ) {
    throw new Error(
      "The Manila statement period is unavailable.",
    );
  }

  return `${year}-${month}`;
}

function statementPeriod(
  month:
    string,
): ProviderEarningsStatementPeriod {
  const [
    yearValue,
    monthValue,
  ] =
    month
      .split("-")
      .map(Number);

  const startUtc =
    Date.UTC(
      yearValue,
      monthValue - 1,
      1,
    ) -
    MANILA_UTC_OFFSET_MS;

  const endUtc =
    Date.UTC(
      yearValue,
      monthValue,
      1,
    ) -
    MANILA_UTC_OFFSET_MS;

  const label =
    new Intl.DateTimeFormat(
      "en-PH",
      {
        month:
          "long",

        year:
          "numeric",

        timeZone:
          "Asia/Manila",
      },
    ).format(
      new Date(
        startUtc,
      ),
    );

  return {
    month,
    label,

    startAt:
      new Date(
        startUtc,
      ).toISOString(),

    endAtExclusive:
      new Date(
        endUtc,
      ).toISOString(),

    timeZone:
      "Asia/Manila",
  };
}

function normalizeStatementEarning(
  input: {
    document:
      QueryDocumentSnapshot<
        DocumentData
      >;

    expectedProviderId:
      string;

    settlementsByEarning:
      ReadonlyMap<
        string,
        ProviderEarningsStatementSettlement | null
      >;
  },
): ProviderEarningsStatementRow | null {
  const data =
    input.document.data();

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

  const createdAt =
    timestampIso(
      data.createdAt,
    );

  const status =
    earningStatus(
      data.status,
    );

  if (
    data.schemaVersion !==
      1 ||
    data.providerId !==
      input.expectedProviderId ||
    data.currency !==
      "PHP" ||
    !earningId ||
    earningId !==
      input.document.id ||
    !paymentId ||
    !providerRequestId ||
    !mainEventId ||
    !createdAt ||
    !status
  ) {
    return null;
  }

  const gross =
    strictMoney(
      data
        .grossCollectedInCentavos,
    );

  const commission =
    strictMoney(
      data
        .commissionDeductedInCentavos,
    );

  const withholding =
    strictMoney(
      data
        .withholdingDeductedInCentavos,
    );

  const providerVat =
    strictMoney(
      data
        .providerVatComponentInCentavos,
    );

  const platformVat =
    strictMoney(
      data
        .platformVatOnCommissionInCentavos,
    );

  const earning =
    strictMoney(
      data
        .earningAmountInCentavos,
    );

  const pending =
    strictMoney(
      data
        .pendingAmountInCentavos,
    );

  const available =
    strictMoney(
      data
        .availableAmountInCentavos,
    );

  const paid =
    strictMoney(
      data
        .paidAmountInCentavos,
    );

  const reversed =
    strictMoney(
      data
        .reversedAmountInCentavos,
    );

  const net =
    strictMoney(
      data
        .netEarningAmountInCentavos,
    );

  if (
    gross === null ||
    gross <= 0 ||
    commission === null ||
    withholding === null ||
    providerVat === null ||
    platformVat === null ||
    earning === null ||
    pending === null ||
    available === null ||
    paid === null ||
    reversed === null ||
    net === null
  ) {
    return null;
  }

  if (
    commission +
      withholding >
      gross ||
    earning !==
      gross -
      commission -
      withholding ||
    checkedAdd(
      checkedAdd(
        pending,
        available,
      ),
      checkedAdd(
        paid,
        reversed,
      ),
    ) !==
      earning ||
    net !==
      earning -
      reversed ||
    providerVat >
      gross ||
    platformVat >
      commission
  ) {
    return null;
  }

  return {
    earningId,
    paymentId,
    providerRequestId,
    mainEventId,
    status,

    currency:
      "PHP",

    grossCollectedInCentavos:
      gross,

    commissionDeductedInCentavos:
      commission,

    withholdingDeductedInCentavos:
      withholding,

    providerVatComponentInCentavos:
      providerVat,

    platformVatOnCommissionInCentavos:
      platformVat,

    earningAmountInCentavos:
      earning,

    reversedAmountInCentavos:
      reversed,

    netEarningAmountInCentavos:
      net,

    pendingAmountInCentavos:
      pending,

    availableAmountInCentavos:
      available,

    paidAmountInCentavos:
      paid,

    createdAt,

    updatedAt:
      timestampIso(
        data.updatedAt,
      ),

    settlement:
      input
        .settlementsByEarning
        .get(
          earningId,
        ) ??
      null,
  };
}

function buildSettlementMap(
  documents:
    readonly QueryDocumentSnapshot<
      DocumentData
    >[],

  expectedProviderId:
    string,
): Map<
  string,
  ProviderEarningsStatementSettlement | null
> {
  const map =
    new Map<
      string,
      ProviderEarningsStatementSettlement | null
    >();

  for (
    const document of
      documents
  ) {
    const normalized =
      normalizeStatementSettlement(
        document,
        expectedProviderId,
      );

    if (!normalized) {
      continue;
    }

    if (
      map.has(
        normalized.earningId,
      )
    ) {
      /*
       * More than one settlement for an earning is not
       * canonical. Do not guess which record is authoritative.
       */
      map.set(
        normalized.earningId,
        null,
      );

      continue;
    }

    map.set(
      normalized.earningId,
      normalized.settlement,
    );
  }

  return map;
}

function normalizeStatementSettlement(
  document:
    QueryDocumentSnapshot<
      DocumentData
    >,

  expectedProviderId:
    string,
): {
  earningId:
    string;

  settlement:
    ProviderEarningsStatementSettlement;
} | null {
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

  const status =
    settlementStatus(
      data.status,
    );

  if (
    data.schemaVersion !==
      1 ||
    data.providerId !==
      expectedProviderId ||
    data.currency !==
      "PHP" ||
    !settlementId ||
    settlementId !==
      document.id ||
    !earningId ||
    !status
  ) {
    return null;
  }

  const netSettlement =
    strictMoney(
      data
        .netSettlementAmountInCentavos,
    );

  const reserved =
    strictMoney(
      data
        .reservedAmountInCentavos,
    );

  const paidOut =
    strictMoney(
      data
        .paidOutAmountInCentavos,
    );

  if (
    netSettlement === null ||
    reserved === null ||
    paidOut === null ||
    reserved >
      netSettlement ||
    paidOut >
      netSettlement
  ) {
    return null;
  }

  return {
    earningId,

    settlement: {
      settlementId,
      status,

      netSettlementAmountInCentavos:
        netSettlement,

      reservedAmountInCentavos:
        reserved,

      paidOutAmountInCentavos:
        paidOut,

      reconciliationRequired:
        data.reconciliationRequired ===
          true,

      paidOutAt:
        timestampIso(
          data.paidOutAt,
        ),
    },
  };
}

function summarizeRows(
  rows:
    readonly ProviderEarningsStatementRow[],
): ProviderEarningsStatementTotals {
  const totals:
    ProviderEarningsStatementTotals = {
      customerGrossCollectedInCentavos:
        0,

      commissionDeductedInCentavos:
        0,

      withholdingDeductedInCentavos:
        0,

      providerVatComponentInCentavos:
        0,

      platformVatOnCommissionInCentavos:
        0,

      originalProviderEarningInCentavos:
        0,

      providerEarningReversedInCentavos:
        0,

      netProviderEarningInCentavos:
        0,

      pendingAmountInCentavos:
        0,

      availableAmountInCentavos:
        0,

      paidAmountInCentavos:
        0,

      settlementPaidOutInCentavos:
        0,
    };

  for (
    const row of rows
  ) {
    totals
      .customerGrossCollectedInCentavos =
        checkedAdd(
          totals
            .customerGrossCollectedInCentavos,
          row
            .grossCollectedInCentavos,
        );

    totals
      .commissionDeductedInCentavos =
        checkedAdd(
          totals
            .commissionDeductedInCentavos,
          row
            .commissionDeductedInCentavos,
        );

    totals
      .withholdingDeductedInCentavos =
        checkedAdd(
          totals
            .withholdingDeductedInCentavos,
          row
            .withholdingDeductedInCentavos,
        );

    totals
      .providerVatComponentInCentavos =
        checkedAdd(
          totals
            .providerVatComponentInCentavos,
          row
            .providerVatComponentInCentavos,
        );

    totals
      .platformVatOnCommissionInCentavos =
        checkedAdd(
          totals
            .platformVatOnCommissionInCentavos,
          row
            .platformVatOnCommissionInCentavos,
        );

    totals
      .originalProviderEarningInCentavos =
        checkedAdd(
          totals
            .originalProviderEarningInCentavos,
          row
            .earningAmountInCentavos,
        );

    totals
      .providerEarningReversedInCentavos =
        checkedAdd(
          totals
            .providerEarningReversedInCentavos,
          row
            .reversedAmountInCentavos,
        );

    totals
      .netProviderEarningInCentavos =
        checkedAdd(
          totals
            .netProviderEarningInCentavos,
          row
            .netEarningAmountInCentavos,
        );

    totals
      .pendingAmountInCentavos =
        checkedAdd(
          totals
            .pendingAmountInCentavos,
          row
            .pendingAmountInCentavos,
        );

    totals
      .availableAmountInCentavos =
        checkedAdd(
          totals
            .availableAmountInCentavos,
          row
            .availableAmountInCentavos,
        );

    totals
      .paidAmountInCentavos =
        checkedAdd(
          totals
            .paidAmountInCentavos,
          row
            .paidAmountInCentavos,
        );

    totals
      .settlementPaidOutInCentavos =
        checkedAdd(
          totals
            .settlementPaidOutInCentavos,
          row.settlement
            ?.paidOutAmountInCentavos ??
          0,
        );
  }

  return totals;
}

function earningStatus(
  value:
    unknown,
): ProviderEarningStatus | null {
  return typeof value ===
      "string" &&
    EARNING_STATUSES.has(
      value as
        ProviderEarningStatus,
    )
    ? value as
      ProviderEarningStatus
    : null;
}

function settlementStatus(
  value:
    unknown,
): ProviderSettlementStatus | null {
  return typeof value ===
      "string" &&
    SETTLEMENT_STATUSES.has(
      value as
        ProviderSettlementStatus,
    )
    ? value as
      ProviderSettlementStatus
    : null;
}

function strictMoney(
  value:
    unknown,
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

function checkedAdd(
  left:
    number,

  right:
    number,
): number {
  const result =
    left +
    right;

  if (
    !Number.isSafeInteger(
      result,
    ) ||
    result < 0
  ) {
    throw new Error(
      "Provider Earnings Statement totals are invalid.",
    );
  }

  return result;
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

  return SAFE_ID.test(
    normalized,
  )
    ? normalized
    : null;
}

function boundedText(
  value:
    unknown,

  fallback:
    string,

  maximumLength:
    number,
): string {
  if (
    typeof value !==
      "string"
  ) {
    return fallback;
  }

  const normalized =
    value
      .trim()
      .replace(
        /\s+/gu,
        " ",
      );

  return normalized
    ? normalized.slice(
        0,
        maximumLength,
      )
    : fallback;
}

function timestampIso(
  value:
    unknown,
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
    const result =
      value.toDate();

    return result instanceof
        Date &&
      Number.isFinite(
        result.getTime(),
      )
      ? result
          .toISOString()
      : null;
  }

  return null;
}