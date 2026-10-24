import {
  render,
  screen,
} from "@testing-library/react";

import {
  expect,
  it,
} from "vitest";

import {
  AdminFinancialReportSummary,
} from "@/components/admin/reports/admin-financial-report-summary";

import type {
  AdminFinancialReport,
} from "@/lib/admin/reports/admin-financial-report-types";

const financial:
  AdminFinancialReport = {
    documentKind:
      "admin_financial_report",

    currency:
      "PHP",

    timeZone:
      "Asia/Manila",

    period: {
      startAt:
        "2026-08-31T16:00:00.000Z",

      endAtExclusive:
        "2026-09-30T16:00:00.000Z",

      label:
        "Sep 1, 2026 – Sep 30, 2026",

      timeZone:
        "Asia/Manila",
    },

    ledgerRows:
      [],

    providerEarningRows:
      [],

    settlementPayoutRows:
      [],

    gatewayFeeRows:
      [],

    ledger: {
      paymentSettlementCount:
        1,

      completedRefundCount:
        1,

      grossCollectedInCentavos:
        100000,

      completedRefundsInCentavos:
        25000,

      customerCashMovementInCentavos:
        75000,

      commissionAccruedInCentavos:
        10000,

      commissionReversedInCentavos:
        2500,

      commissionNetMovementInCentavos:
        7500,

      providerVatAccruedInCentavos:
        10000,

      providerVatReversedInCentavos:
        2500,

      providerVatNetMovementInCentavos:
        7500,

      platformVatAccruedInCentavos:
        1200,

      platformVatReversedInCentavos:
        300,

      platformVatNetMovementInCentavos:
        900,

      withholdingAccruedInCentavos:
        0,

      withholdingReversedInCentavos:
        0,

      withholdingNetMovementInCentavos:
        0,

      malformedRecordCount:
        0,
    },

    providerEarnings: {
      earningCount:
        1,

      originalEarningInCentavos:
        90000,

      reversedAmountInCentavos:
        22500,

      netEarningInCentavos:
        67500,

      pendingAmountInCentavos:
        0,

      availableAmountInCentavos:
        67500,

      paidAmountInCentavos:
        0,

      malformedRecordCount:
        0,

      basis:
        "earnings_created_in_period_current_state",
    },

    settlementPayouts: {
      payoutRecordCount:
        0,

      paidOutAmountInCentavos:
        0,

      reconciliationRequiredCount:
        0,

      malformedRecordCount:
        0,

      basis:
        "settlements_paid_out_in_period",
    },

    gatewayFees: {
      successfulPaymentCount:
        2,

      observedCount:
        1,

      unavailableCount:
        1,

      invalidCount:
        0,

      observedFeeInCentavos:
        2500,

      evidenceCompleteness:
        "partial",

      authoritativeNetPlatformRevenueInCentavos:
        null,
    },

    generatedAt:
      "2026-09-27T15:00:00.000Z",

    scopeNotice:
      "Financial movements use the selected reporting period.",

    gatewayFeeNotice:
      "Missing gateway fee evidence remains unavailable.",

    recordNotice:
      "This Financial Report is a FEASTA administrative platform record for authorized internal use. It is not a statutory fiscal document.",
  };

it("shows business fee totals without technical evidence or invented net revenue", () => {
  const {container} = render(<AdminFinancialReportSummary report={financial} fallbackExplanation="" />);
  expect(screen.getByRole("heading", {name: "FEASTA revenue and provider payouts"})).toBeVisible();
  expect(screen.getByText("FEASTA Revenue").parentElement).toHaveTextContent("₱75.00");
  expect(screen.getByText("FEASTA fees before refunds").parentElement).toHaveTextContent("₱100.00");
  expect(screen.getByText("Customer payments after refunds").parentElement).toHaveTextContent("₱750.00");
  expect(container.textContent).not.toMatch(/gateway|immutable|canonical|net platform revenue/i);
});

it("hides zero tax cards and keeps record issues understandable", () => {
  render(<AdminFinancialReportSummary report={{...financial, ledger: {...financial.ledger, platformVatAccruedInCentavos: 0, platformVatReversedInCentavos: 0, malformedRecordCount: 1}}} fallbackExplanation="" />);
  expect(screen.queryByText("Tax on FEASTA fees")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1 payment records need review");
});

it(
  "contains no statutory invoice or official receipt claims",
  () => {
    const {
      container,
    } =
      render(
        <AdminFinancialReportSummary
          report={financial}
          fallbackExplanation=""
        />,
      );

    expect(
      container.textContent,
    ).not.toMatch(
      /Official Receipt|Official Invoice|Sales Invoice|BIR Invoice|Tax Invoice/iu,
    );
  },
);