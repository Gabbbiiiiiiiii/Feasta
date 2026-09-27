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

it(
  "renders trusted financial movements without inventing net platform revenue",
  () => {
    render(
      <AdminFinancialReportSummary
        report={financial}
        fallbackExplanation=""
      />,
    );

    expect(
      screen.getByRole(
        "heading",
        {
          name:
            "Financial Report",
        },
      ),
    ).toBeVisible();

    expect(
      screen.getByLabelText(
        "Customer financial movements",
      ),
    ).toHaveTextContent(
      "₱750.00",
    );

    expect(
      screen.getByLabelText(
        "Commission movements",
      ),
    ).toHaveTextContent(
      "₱75.00",
    );

    expect(
      screen.getByText(
        /Net FEASTA platform revenue: Not derived automatically/iu,
      ),
    ).toBeVisible();

    expect(
      screen.getByText(
        /Partial/iu,
      ),
    ).toBeVisible();
  },
);

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