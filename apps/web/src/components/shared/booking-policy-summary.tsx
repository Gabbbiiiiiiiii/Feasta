import type {BookingPolicyPresentation} from "@/lib/payments/booking-policy-v3-presentation";
const money = (value: number) => new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(value / 100);
const time = (value: string) => new Intl.DateTimeFormat("en-PH", {timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true}).format(new Date(value));
export function BookingPolicySummary({policy, audience = "customer"}: {policy?: BookingPolicyPresentation | null; audience?: "customer" | "provider" | "admin"}) {
  if (!policy) return null;
  return <section className="my-3 rounded-xl border p-4" aria-label="Booking payment policy">
    <h3 className="font-semibold">{policy.readyToComplete && audience === "provider" ? "Ready to Complete" : policy.label}</h3>
    {policy.state === "hold" && <p>Your payment was started before the deadline. We’re waiting for final payment confirmation.</p>}
    {["due", "grace_period", "upcoming"].includes(policy.state) && policy.remainingAmountInCentavos != null && policy.remainingAmountInCentavos > 0 && <>
      <p>Remaining balance: {money(policy.remainingAmountInCentavos)}</p><p>Becomes due: {time(policy.dueAt)}</p>
      <p>Pay by {time(policy.deadlineAt)} to keep your booking confirmed.</p></>}
    {policy.allocation && <><p>Remaining balance was not paid by the final payment deadline.</p>
      <p>Payment deadline: {time(policy.deadlineAt)}</p>
      {audience !== "provider" && <><p>Paid deposit: {money(policy.allocation.deposit)}</p>
        <p>{audience === "customer" ? "Refund to you" : "Customer refund (70%)"}: {money(policy.allocation.customerRefund)}</p></>}
      <p>Reservation compensation{audience === "admin" ? " (20%)" : ""}: {money(policy.allocation.providerCompensation)}</p>
      {audience === "provider" ? <p>This amount compensates for the event schedule reserved before the Customer’s payment-default cancellation.</p>
        : <p>FEASTA cancellation/platform fee{audience === "admin" ? " (10%)" : ""}: {money(policy.allocation.fee)}</p>}
      <p>Refund status: {policy.allocation.refundStatus}</p></>}
  </section>;
}
