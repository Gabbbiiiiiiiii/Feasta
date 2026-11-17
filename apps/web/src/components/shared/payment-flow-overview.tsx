import type {PaymentDemoEvidence} from "@/lib/payments/payment-demo-evidence";

export function PaymentFlowOverview({evidence}: {evidence?: PaymentDemoEvidence | null}) {
  return <section aria-label="Understanding payments and payouts" className="rounded-card border border-border bg-card p-5 shadow-card">
    <h2 className="text-lg font-bold text-primary-strong">Payments, earnings and transfers</h2>
    <p className="mt-1 text-sm text-muted-foreground">A customer payment can be confirmed while the provider is still waiting to receive their earnings.</p>
    <ol className="mt-4 grid gap-3 md:grid-cols-3">
      {[
        ["1. Customer payment", "Records what the customer paid and any completed refunds."],
        ["2. Provider earnings", "The provider’s share after commission and applicable withholding. Eligibility does not mean money was transferred."],
        ["3. Provider transfer", "Money is recorded as paid out only after the gateway confirms a matching transfer."],
      ].map(([title, description]) => <li key={title} className="rounded-xl border border-border bg-muted/20 p-3">
        <p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </li>)}
    </ol>
    {evidence !== undefined && <div className="mt-4 rounded-xl border border-primary/20 bg-secondary/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-primary-strong">Separate capstone test demonstration</p>
      <p className="mt-1 text-sm font-semibold">{evidence ? "PayMongo simulator transfer confirmed" : "Gateway test results are recorded separately"}</p>
      <p className="mt-1 text-sm text-muted-foreground">{evidence
        ? `${new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(evidence.amountInCentavos / 100)} in simulated funds. Confirmed in the saved test receipt; no real money moved and no provider earnings were marked paid.`
        : "An isolated test transfer does not complete a provider payout or change the payment and earnings records below. No confirmed test receipt is loaded on this server."}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Provider-linked transfers require an eligible PayMongo platform account and a verified provider link. The separate simulator test does not establish that link.</p>
      {evidence ? <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-primary-strong">View test evidence</summary>
        <dl className="mt-2 grid gap-2 break-all"><div><dt className="font-bold">Gateway transfer ID</dt><dd>{evidence.transferId}</dd></div>
          <div><dt className="font-bold">Gateway reference</dt><dd>{evidence.gatewayReference}</dd></div></dl>
      </details> : null}
    </div>}
  </section>;
}
