import type {
  AdminFinancialReport,
} from "@/lib/admin/reports/admin-financial-report-types";

export function AdminFinancialReportSummary({
  report,
  fallbackExplanation,
}: {
  report:
    AdminFinancialReport | undefined;

  fallbackExplanation:
    string;
}) {
  if (!report) {
    return (
      <section
        aria-labelledby="financial-report-heading"
        className="rounded-card border border-border bg-card p-5 shadow-card"
      >
        <h2
          id="financial-report-heading"
          className="text-lg font-bold"
        >
          Financial Report
        </h2>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This legacy report snapshot does not contain the trusted financial projection.
        </p>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {fallbackExplanation}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="financial-report-heading"
      className="grid gap-4"
    >
      <div>
        <h2
          id="financial-report-heading"
          className="text-xl font-black"
        >
          Financial Report
        </h2>

        <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
          Trusted financial movements for {report.period.label}. Financial movements are period-based
          and are kept separate from operational booking filters.
        </p>
      </div>

      <div
        aria-label="Customer financial movements"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <FinancialCard
          label="Customer gross collected"
          value={formatCentavos(
            report.ledger
              .grossCollectedInCentavos,
          )}
        />

        <FinancialCard
          label="Completed refunds"
          value={formatCentavos(
            report.ledger
              .completedRefundsInCentavos,
          )}
        />

        <FinancialCard
          label="Customer cash movement"
          value={formatCentavos(
            report.ledger
              .customerCashMovementInCentavos,
          )}
          strong
        />
      </div>

      <article className="rounded-card border border-border bg-card p-5 shadow-card">
        <h3 className="font-bold">
          FEASTA commission and VAT movements
        </h3>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Accruals and completed refund reversals are reported as separate immutable period movements.
        </p>

        <dl
          aria-label="Commission movements"
          className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          <FinancialDetail
            label="Commission accrued"
            value={formatCentavos(
              report.ledger
                .commissionAccruedInCentavos,
            )}
          />

          <FinancialDetail
            label="Commission reversed"
            value={formatCentavos(
              report.ledger
                .commissionReversedInCentavos,
            )}
          />

          <FinancialDetail
            label="Commission net movement"
            value={formatCentavos(
              report.ledger
                .commissionNetMovementInCentavos,
            )}
            strong
          />

          <FinancialDetail
            label="FEASTA VAT accrued"
            value={formatCentavos(
              report.ledger
                .platformVatAccruedInCentavos,
            )}
          />

          <FinancialDetail
            label="FEASTA VAT reversed"
            value={formatCentavos(
              report.ledger
                .platformVatReversedInCentavos,
            )}
          />

          <FinancialDetail
            label="FEASTA VAT net movement"
            value={formatCentavos(
              report.ledger
                .platformVatNetMovementInCentavos,
            )}
          />
        </dl>
      </article>

      <article className="rounded-card border border-border bg-card p-5 shadow-card">
        <h3 className="font-bold">
          Provider financial movements
        </h3>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Provider VAT is informational and remains separate from Provider earning and payout truth.
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FinancialDetail
            label="Provider VAT accrued"
            value={formatCentavos(
              report.ledger
                .providerVatAccruedInCentavos,
            )}
          />

          <FinancialDetail
            label="Provider VAT reversed"
            value={formatCentavos(
              report.ledger
                .providerVatReversedInCentavos,
            )}
          />

          <FinancialDetail
            label="Provider earning reversals"
            value={formatCentavos(
              report.providerEarnings
                .reversedAmountInCentavos,
            )}
          />

          <FinancialDetail
            label="Net Provider earnings"
            value={formatCentavos(
              report.providerEarnings
                .netEarningInCentavos,
            )}
            strong
          />

          <FinancialDetail
            label="Provider earnings pending"
            value={formatCentavos(
              report.providerEarnings
                .pendingAmountInCentavos,
            )}
          />

          <FinancialDetail
            label="Provider earnings available"
            value={formatCentavos(
              report.providerEarnings
                .availableAmountInCentavos,
            )}
          />

          <FinancialDetail
            label="Provider earning paid bucket"
            value={formatCentavos(
              report.providerEarnings
                .paidAmountInCentavos,
            )}
          />

          <FinancialDetail
            label="Confirmed settlement paid out"
            value={formatCentavos(
              report.settlementPayouts
                .paidOutAmountInCentavos,
            )}
            strong
          />
        </dl>

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Provider earning rows represent earnings created in this reporting period shown at their
          current earning state. Confirmed settlement payouts are separately bounded by payout date.
        </p>
      </article>

      <article className="rounded-card border border-border bg-card p-5 shadow-card">
        <h3 className="font-bold">
          Gateway processing-fee evidence
        </h3>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FinancialDetail
            label="Evidence completeness"
            value={humanize(
              report.gatewayFees
                .evidenceCompleteness,
            )}
          />

          <FinancialDetail
            label="Observed fee evidence"
            value={formatCentavos(
              report.gatewayFees
                .observedFeeInCentavos,
            )}
          />

          <FinancialDetail
            label="Observed payments"
            value={String(
              report.gatewayFees
                .observedCount,
            )}
          />

          <FinancialDetail
            label="Unavailable / invalid"
            value={`${report.gatewayFees.unavailableCount} / ${report.gatewayFees.invalidCount}`}
          />
        </dl>

        <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-bold">
            Net FEASTA platform revenue: Not derived automatically
          </p>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {report.gatewayFeeNotice}
          </p>
        </div>
      </article>

      {(report.ledger.malformedRecordCount > 0 ||
        report.providerEarnings.malformedRecordCount > 0 ||
        report.settlementPayouts.malformedRecordCount > 0 ||
        report.gatewayFees.invalidCount > 0) ? (
        <article
          role="status"
          className="rounded-card border border-warning/40 bg-warning/10 p-5"
        >
          <h3 className="font-bold">
            Finance records require review
          </h3>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Malformed ledger: {report.ledger.malformedRecordCount}. Malformed Provider earnings:{" "}
            {report.providerEarnings.malformedRecordCount}. Malformed settlement payouts:{" "}
            {report.settlementPayouts.malformedRecordCount}. Invalid gateway-fee evidence:{" "}
            {report.gatewayFees.invalidCount}.
          </p>
        </article>
      ) : null}

      <div className="rounded-card border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
        <p>{report.scopeNotice}</p>
        <p className="mt-2">{report.recordNotice}</p>
      </div>
    </section>
  );
}

function FinancialCard({
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
    <article className="rounded-card border border-border bg-card p-5 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <p
        className={
          `mt-2 ${
            strong
              ? "text-2xl font-black text-primary-strong"
              : "text-xl font-black"
          }`
        }
      >
        {value}
      </p>
    </article>
  );
}

function FinancialDetail({
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
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>

      <dd
        className={
          `mt-1 ${
            strong
              ? "font-black text-primary-strong"
              : "font-bold"
          }`
        }
      >
        {value}
      </dd>
    </div>
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

function humanize(
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