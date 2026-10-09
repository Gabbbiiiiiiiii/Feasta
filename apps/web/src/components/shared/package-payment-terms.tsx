type PackagePaymentTermsSource = {
  paymentPolicy?: "full_payment" | "deposit_then_balance" | null;
  depositPercentage?: number | null;
  balanceDueDaysBeforeEvent?: number | null;
};

/** Normal package terms, independent of a booking's checkout eligibility. Version 2 uses the canonical 24-hour deadline. */
export function PackagePaymentTerms({source}: {source: PackagePaymentTermsSource}) {
  const deposit = source.paymentPolicy === "deposit_then_balance";
  if (!deposit && source.paymentPolicy !== "full_payment") return null;
  const days = source.balanceDueDaysBeforeEvent;
  const timing = days != null && days !== 1 ? String(days) + " days" : "24 hours";
  return <div className="grid gap-1 text-xs text-muted-foreground" aria-label="Payment terms">
    <span className="w-fit rounded-full border border-border bg-muted px-2.5 py-1 font-semibold text-primary-strong">{deposit ? "Deposit + balance" : "Full payment"}</span>
    {deposit ? <>
      <p>{source.depositPercentage != null ? String(source.depositPercentage) + "% deposit + remaining balance" : "Deposit + remaining balance"}</p>
      <p>Balance due {timing} before event</p>
    </> : <p>100% due after booking acceptance</p>}
  </div>;
}
