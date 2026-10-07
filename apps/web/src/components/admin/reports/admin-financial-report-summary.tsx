import type {AdminFinancialReport} from "@/lib/admin/reports/admin-financial-report-types";

export function AdminFinancialReportSummary({report}: {
  report: AdminFinancialReport | undefined;
  fallbackExplanation: string;
}) {
  if (!report) {
    return <section className="rounded-card border border-border bg-card p-5">
      <h2 className="text-xl font-black">FEASTA Revenue</h2>
      <p className="mt-2 text-sm text-muted-foreground">Fee totals are unavailable for this report. Generate a new report to try again.</p>
    </section>;
  }
  const ledger = report.ledger;
  const hasVat = ledger.platformVatAccruedInCentavos !== 0 || ledger.platformVatReversedInCentavos !== 0;
  const issues = ledger.malformedRecordCount + report.providerEarnings.malformedRecordCount + report.settlementPayouts.malformedRecordCount + report.gatewayFees.invalidCount;
  return <section aria-labelledby="financial-report-heading" className="grid gap-4">
    <div>
      <h2 id="financial-report-heading" className="text-xl font-black">FEASTA revenue and provider payouts</h2>
      <p className="mt-1 text-sm text-muted-foreground">Fees and refunds recorded during {report.period.label}. FEASTA Revenue is the platform and service fee after completed refunds.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <FinancialCard label="Total customer payments" amount={ledger.grossCollectedInCentavos} />
      <FinancialCard label="Completed refunds" amount={ledger.completedRefundsInCentavos} />
      <FinancialCard label="Customer payments after refunds" amount={ledger.customerCashMovementInCentavos} />
      <FinancialCard label="FEASTA fees before refunds" amount={ledger.commissionAccruedInCentavos} />
      <FinancialCard label="Refunded FEASTA fees" amount={ledger.commissionReversedInCentavos} />
      <FinancialCard label="FEASTA Revenue" amount={ledger.commissionNetMovementInCentavos} />
    </div>
    <p className="text-xs text-muted-foreground">FEASTA Revenue is before payment processing costs.</p>
    {hasVat ? <div className="grid gap-4 sm:grid-cols-2">
      <FinancialCard label="Tax on FEASTA fees" amount={ledger.platformVatAccruedInCentavos} />
      <FinancialCard label="Refunded tax on FEASTA fees" amount={ledger.platformVatReversedInCentavos} />
    </div> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <FinancialCard label="Provider earnings pending" amount={report.providerEarnings.pendingAmountInCentavos} />
      <FinancialCard label="Provider earnings available" amount={report.providerEarnings.availableAmountInCentavos} />
      <FinancialCard label="Provider payouts completed" amount={report.settlementPayouts.paidOutAmountInCentavos} />
    </div>
    <p className="text-xs text-muted-foreground">Earnings shown were created during this period and use their current status. Payouts use the date they were paid.</p>
    {issues > 0 ? <p role="status" className="rounded-card border border-warning/40 bg-warning/10 p-4 text-sm">{issues} payment records need review. Some amounts may be missing from these totals. Review payment issues on the Payments page.</p> : null}
  </section>;
}

function FinancialCard({label, amount}: {label: string; amount: number}) {
  return <article className="rounded-card border border-border bg-card p-5 shadow-card">
    <p className="text-sm font-semibold text-muted-foreground">{label}</p>
    <p className="mt-2 text-2xl font-black">{new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(amount / 100)}</p>
  </article>;
}
