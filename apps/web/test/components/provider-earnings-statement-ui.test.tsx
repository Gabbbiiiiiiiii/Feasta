import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import {
  expect,
  it,
  vi,
} from "vitest";

import {
  ProviderEarningsStatementClient,
} from "@/app/provider/payments/statements/provider-earnings-statement-client";

import type {
  ProviderEarningsStatement,
} from "@/lib/provider/payments/provider-earnings-statement-types";

const statement: ProviderEarningsStatement = {
  documentKind:
    "provider_earnings_statement",

  providerId:
    "provider-one",

  providerName:
    "Ormoc Event Catering",

  currency:
    "PHP",

  period: {
    month:
      "2026-09",

    label:
      "September 2026",

    startAt:
      "2026-08-31T16:00:00.000Z",

    endAtExclusive:
      "2026-09-30T16:00:00.000Z",

    timeZone:
      "Asia/Manila",
  },

  rows: [
    {
      earningId:
        "earning-one",

      paymentId:
        "payment-one",

      providerRequestId:
        "request-one",

      mainEventId:
        "event-one",

      status:
        "available",

      currency:
        "PHP",

      grossCollectedInCentavos:
        1000000,

      commissionDeductedInCentavos:
        100000,

      withholdingDeductedInCentavos:
        0,

      providerVatComponentInCentavos:
        107143,

      platformVatOnCommissionInCentavos:
        10714,

      earningAmountInCentavos:
        900000,

      reversedAmountInCentavos:
        100000,

      netEarningAmountInCentavos:
        800000,

      pendingAmountInCentavos:
        0,

      availableAmountInCentavos:
        800000,

      paidAmountInCentavos:
        0,

      createdAt:
        "2026-09-12T02:00:00.000Z",

      updatedAt:
        "2026-09-15T02:00:00.000Z",

      settlement: {
        settlementId:
          "settlement-one",

        status:
          "ready",

        netSettlementAmountInCentavos:
          800000,

        reservedAmountInCentavos:
          0,

        paidOutAmountInCentavos:
          0,

        reconciliationRequired:
          false,

        paidOutAt:
          null,
      },
    },
  ],

  totals: {
    customerGrossCollectedInCentavos:
      1000000,

    commissionDeductedInCentavos:
      100000,

    withholdingDeductedInCentavos:
      0,

    providerVatComponentInCentavos:
      107143,

    platformVatOnCommissionInCentavos:
      10714,

    originalProviderEarningInCentavos:
      900000,

    providerEarningReversedInCentavos:
      100000,

    netProviderEarningInCentavos:
      800000,

    pendingAmountInCentavos:
      0,

    availableAmountInCentavos:
      800000,

    paidAmountInCentavos:
      0,

    settlementPaidOutInCentavos:
      0,
  },

  skippedMalformedCount:
    0,

  missingSettlementCount:
    0,

  generatedAt:
    "2026-09-27T15:00:00.000Z",

  recordNotice:
    "This Provider Earnings Statement is a FEASTA platform finance record. It is not a statutory fiscal document.",
};

it(
  "renders trusted Provider Earnings Statement totals",
  () => {
    render(
      <ProviderEarningsStatementClient
        statement={statement}
      />,
    );

    expect(
      screen.getByRole(
        "heading",
        {
          name:
            "Provider Earnings Statement",
        },
      ),
    ).toBeVisible();

    expect(
      screen.getByText(
        "September 2026",
      ),
    ).toBeVisible();

    expect(
      screen.getByLabelText(
        "Provider earnings summary",
      ),
    ).toHaveTextContent(
      "₱10,000.00",
    );

    expect(
      screen.getByLabelText(
        "Provider earnings summary",
      ),
    ).toHaveTextContent(
      "₱8,000.00",
    );
  },
);

it(
  "prints through the browser print workflow",
  () => {
    const print =
      vi
        .spyOn(
          window,
          "print",
        )
        .mockImplementation(
          () => undefined,
        );

    render(
      <ProviderEarningsStatementClient
        statement={statement}
      />,
    );

    fireEvent.click(
      screen.getByRole(
        "button",
        {
          name:
            "Print statement",
        },
      ),
    );

    expect(
      print,
    ).toHaveBeenCalledOnce();

    print.mockRestore();
  },
);

it(
  "keeps the statement distinct from a statutory invoice or receipt",
  () => {
    const {
      container,
    } =
      render(
        <ProviderEarningsStatementClient
          statement={statement}
        />,
      );

    expect(
      container.textContent,
    ).not.toMatch(
      /Official Receipt|Official Invoice|Sales Invoice|BIR Invoice|Tax Invoice/iu,
    );
  },
);