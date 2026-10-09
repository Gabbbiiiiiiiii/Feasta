"use client";

import {
  ArrowLeft,
  CalendarDays,
  Download,
  FileText,
  Printer,
} from "lucide-react";

import Link from "next/link";

import {
  Button,
} from "@/components/ui/button";

import type {
  ProviderEarningsStatement,
} from "@/lib/provider/payments/provider-earnings-statement-types";

export function ProviderEarningsStatementClient({
  statement,
}: {
  statement:
    ProviderEarningsStatement;
}) {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5">
      <div
        data-print-hidden
        className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            variant="secondary"
          >
            <Link href="/provider/payments">
              <ArrowLeft
                aria-hidden="true"
                className="size-4"
              />
              Back to payments
            </Link>
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              downloadStatementCsv(
                statement,
              )
            }
          >
            <Download
              aria-hidden="true"
              className="size-4"
            />
            Export CSV
          </Button>

          <Button
            type="button"
            onClick={() =>
              window.print()
            }
          >
            <Printer
              aria-hidden="true"
              className="size-4"
            />
            Print statement
          </Button>
        </div>

        <form
          action="/provider/payments/statements"
          method="get"
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <label className="grid gap-1 text-sm font-semibold">
            Statement month

            <input
              type="month"
              name="month"
              defaultValue={
                statement.period.month
              }
              required
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>

          <Button
            type="submit"
            variant="secondary"
          >
            <CalendarDays
              aria-hidden="true"
              className="size-4"
            />
            View month
          </Button>
        </form>
      </div>

      <article
        data-provider-earnings-statement
        className="overflow-hidden rounded-card border border-border bg-card shadow-card"
      >
        <header className="border-b border-border px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary-strong">
                <FileText
                  aria-hidden="true"
                  className="size-5"
                />

                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  FEASTA
                </p>
              </div>

              <h1 className="mt-2 text-2xl font-black sm:text-3xl">
                Provider Earnings Statement
              </h1>

              <p className="mt-2 text-sm text-muted-foreground">
                {statement.providerName}
              </p>
            </div>

            <div className="text-sm lg:text-right">
              <p className="font-bold">
                {statement.period.label}
              </p>

              <p className="mt-1 text-muted-foreground">
                Statement period - Asia/Manila
              </p>
            </div>
          </div>
        </header>

        <section
          className="grid gap-3 border-b border-border bg-muted/30 px-5 py-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-8"
          aria-label="Provider earnings summary"
        >
          <AmountCard
            label="Customer gross collected"
            value={formatCentavos(
              statement.totals
                .customerGrossCollectedInCentavos,
            )}
          />

          <AmountCard
            label="FEASTA commission"
            value={formatCentavos(
              statement.totals
                .commissionDeductedInCentavos,
            )}
          />

          <AmountCard
            label="Original Provider earnings"
            value={formatCentavos(
              statement.totals
                .originalProviderEarningInCentavos,
            )}
          />

          <AmountCard
            label="Reversed by refunds"
            value={formatCentavos(
              statement.totals
                .providerEarningReversedInCentavos,
            )}
          />

          <AmountCard
            label="Net Provider earnings"
            value={formatCentavos(
              statement.totals
                .netProviderEarningInCentavos,
            )}
            strong
          />

          <AmountCard
            label="Pending"
            value={formatCentavos(
              statement.totals
                .pendingAmountInCentavos,
            )}
          />

          <AmountCard
            label="Available"
            value={formatCentavos(
              statement.totals
                .availableAmountInCentavos,
            )}
          />

          <AmountCard
            label="Confirmed settlement paid out"
            value={formatCentavos(
              statement.totals
                .settlementPaidOutInCentavos,
            )}
            strong
          />
        </section>

        <section className="grid gap-4 border-b border-border px-5 py-5 sm:px-8">
          <div>
            <h2 className="font-black">
              Tax and deduction information
            </h2>

            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
              Provider VAT is an informational component already included in the Provider service gross.
              FEASTA VAT on commission belongs to FEASTA&apos;s commission-side accounting and is not
              another deduction from Provider earnings.
            </p>
          </div>

          <dl className="grid gap-3 sm:grid-cols-3">
            <StatementDetail
              label="Provider VAT component"
              value={formatCentavos(
                statement.totals
                  .providerVatComponentInCentavos,
              )}
            />

            <StatementDetail
              label="FEASTA VAT on commission"
              value={formatCentavos(
                statement.totals
                  .platformVatOnCommissionInCentavos,
              )}
            />

            <StatementDetail
              label="Withholding deducted"
              value={formatCentavos(
                statement.totals
                  .withholdingDeductedInCentavos,
              )}
            />
          </dl>
        </section>

        {(statement.skippedMalformedCount > 0 ||
          statement.missingSettlementCount > 0) ? (
          <section
            className="border-b border-border bg-warning/5 px-5 py-4 text-sm sm:px-8"
            role="status"
          >
            <p className="font-semibold">
              Finance records require review
            </p>

            <p className="mt-1 text-muted-foreground">
              {statement.skippedMalformedCount.toLocaleString("en-PH")} malformed earning record(s)
              were excluded and {statement.missingSettlementCount.toLocaleString("en-PH")} earning
              record(s) do not currently have a canonical settlement record.
            </p>
          </section>
        ) : null}

        <section
          className="grid gap-4 px-5 py-6 sm:px-8"
          aria-labelledby="statement-activity-heading"
        >
          <div>
            <h2
              id="statement-activity-heading"
              className="text-lg font-black"
            >
              Earnings activity
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Each row represents one trusted Provider earning created from a successful Customer payment.
            </p>
          </div>

          {statement.rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/20 p-5 text-sm text-muted-foreground">
              No Provider earnings were recorded for this statement month.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-3 font-semibold">
                      Date
                    </th>

                    <th className="px-3 py-3 font-semibold">
                      Status
                    </th>

                    <th className="px-3 py-3 font-semibold">
                      Gross
                    </th>

                    <th className="px-3 py-3 font-semibold">
                      Commission
                    </th>

                    <th className="px-3 py-3 font-semibold">
                      Original earning
                    </th>

                    <th className="px-3 py-3 font-semibold">
                      Reversed
                    </th>

                    <th className="px-3 py-3 font-semibold">
                      Net earning
                    </th>

                    <th className="px-3 py-3 font-semibold">
                      Settlement
                    </th>

                    <th className="px-3 py-3 font-semibold">
                      Paid out
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {statement.rows.map(
                    (row) => (
                      <tr
                        key={row.earningId}
                        className="align-top"
                      >
                        <td className="px-3 py-3">
                          <p className="font-medium">
                            {formatDateTime(
                              row.createdAt,
                            )}
                          </p>

                          <p className="mt-1 max-w-[180px] truncate font-mono text-[11px] text-muted-foreground">
                            {row.paymentId}
                          </p>
                          <p>{row.economicSource === "payment_default_reservation_compensation" ? "Reservation compensation" : "Service earnings"}</p>
                        </td>

                        <td className="px-3 py-3">
                          <StatementStatus
                            value={row.status}
                          />
                        </td>

                        <td className="px-3 py-3">
                          {formatCentavos(
                            row.grossCollectedInCentavos,
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {formatCentavos(
                            row.commissionDeductedInCentavos,
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {formatCentavos(
                            row.earningAmountInCentavos,
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {formatCentavos(
                            row.reversedAmountInCentavos,
                          )}
                        </td>

                        <td className="px-3 py-3 font-bold">
                          {formatCentavos(
                            row.netEarningAmountInCentavos,
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {row.settlement ? (
                            <StatementStatus
                              value={
                                row.settlement.status
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground">
                              Not available
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-3 font-medium">
                          {formatCentavos(
                            row.settlement
                              ?.paidOutAmountInCentavos ??
                            0,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="grid gap-2 border-t border-border px-5 py-5 text-xs leading-5 text-muted-foreground sm:px-8">
          <p>
            {statement.recordNotice}
          </p>

          <p>
            Generated {formatDateTime(statement.generatedAt)} · Currency: PHP
          </p>
        </footer>
      </article>
    </div>
  );
}

function AmountCard({
  label,
  value,
  strong = false,
}: {
  label:
    string;

  value:
    string;

  strong?:
    boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <p
        className={
          `mt-1 ${
            strong
              ? "text-xl font-black text-primary-strong"
              : "text-lg font-black"
          }`
        }
      >
        {value}
      </p>
    </div>
  );
}

function StatementDetail({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>

      <dd className="mt-1 font-bold">
        {value}
      </dd>
    </div>
  );
}

function StatementStatus({
  value,
}: {
  value:
    string;
}) {
  return (
    <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold">
      {formatLabel(
        value,
      )}
    </span>
  );
}

function downloadStatementCsv(
  statement:
    ProviderEarningsStatement,
): void {
  const heading = [
    "Statement Month",
    "Provider",
    "Earning Date",
    "Earning ID",
    "Payment ID",
    "Provider Request ID",
    "Main Event ID",
    "Earning Status",
    "Customer Gross Collected PHP",
    "FEASTA Commission PHP",
    "Withholding PHP",
    "Provider VAT Component PHP",
    "FEASTA VAT On Commission PHP",
    "Original Provider Earning PHP",
    "Provider Earning Reversed PHP",
    "Net Provider Earning PHP",
    "Pending PHP",
    "Available PHP",
    "Provider Earning Paid Bucket PHP",
    "Settlement Status",
    "Net Settlement PHP",
    "Reserved Settlement PHP",
    "Confirmed Settlement Paid Out PHP",
    "Settlement Paid Out At",
    "Reconciliation Required",
    "Entitlement source",
  ];

  const rows =
    statement.rows.map(
      (row) => [
        statement.period.month,
        statement.providerName,
        row.createdAt,
        row.earningId,
        row.paymentId,
        row.providerRequestId,
        row.mainEventId,
        row.status,
        decimalPhp(row.grossCollectedInCentavos),
        decimalPhp(row.commissionDeductedInCentavos),
        decimalPhp(row.withholdingDeductedInCentavos),
        decimalPhp(row.providerVatComponentInCentavos),
        decimalPhp(row.platformVatOnCommissionInCentavos),
        decimalPhp(row.earningAmountInCentavos),
        decimalPhp(row.reversedAmountInCentavos),
        decimalPhp(row.netEarningAmountInCentavos),
        decimalPhp(row.pendingAmountInCentavos),
        decimalPhp(row.availableAmountInCentavos),
        decimalPhp(row.paidAmountInCentavos),
        row.settlement?.status ?? "",
        row.settlement
          ? decimalPhp(
              row.settlement
                .netSettlementAmountInCentavos,
            )
          : "",
        row.settlement
          ? decimalPhp(
              row.settlement
                .reservedAmountInCentavos,
            )
          : "",
        row.settlement
          ? decimalPhp(
              row.settlement
                .paidOutAmountInCentavos,
            )
          : "",
        row.settlement?.paidOutAt ?? "",
        row.settlement
          ?.reconciliationRequired
          ? "Yes"
          : "No",
      ],
    );

  const csv =
    "\uFEFF" +
    [
      heading,
      ...rows,
    ]
      .map(
        (row) =>
          row
            .map(
              csvCell,
            )
            .join(","),
      )
      .join("\r\n");

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8",
      },
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      "a",
    );

  anchor.href =
    url;

  anchor.download =
    `feasta-provider-earnings-${statement.period.month}.csv`;

  document.body.appendChild(
    anchor,
  );

  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(
    url,
  );
}

function csvCell(
  value:
    string,
): string {
  const formulaSafe =
    /^[=+\-@]/u.test(
      value.trimStart(),
    )
      ? `'${value}`
      : value;

  return `"${formulaSafe.replaceAll(
    '"',
    '""',
  )}"`;
}

function decimalPhp(
  centavos:
    number,
): string {
  return (
    centavos /
    100
  ).toFixed(
    2,
  );
}

function formatCentavos(
  value:
    number,
): string {
  return new Intl.NumberFormat(
    "en-PH",
    {
      style:
        "currency",

      currency:
        "PHP",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  ).format(
    value /
      100,
  );
}

function formatDateTime(
  value:
    string,
): string {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",

      timeZone:
        "Asia/Manila",
    },
  ).format(
    date,
  );
}

function formatLabel(
  value:
    string,
): string {
  return value
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/gu,
      (character) =>
        character.toUpperCase(),
    );
}
