"use client";
import type {CustomerPaymentChoice} from "@feasta/shared-types";
import {customerBookingPaymentPresentation, formatCustomerBalanceDeadline} from "@/lib/customer/bookings/customer-booking-payment-presentation";
import {CreditCard} from "lucide-react";
import {formatCurrency} from "./booking-formatters";
import {Button} from "@/components/ui/button";
import type {CustomerBookingDetails} from "@/lib/customer/bookings/customer-booking-types";
import {canStartCustomerBookingPayment, isCustomerBookingPaymentProcessing} from "@/lib/customer/bookings/customer-booking-payment";

export function CustomerBookingPaymentAction({
  request,
  bookingId,
  paymentRequestId,
  paymentRequestChoice,
  onPay,
}: {
  request: CustomerBookingDetails["providerRequests"][number];
  bookingId: string;
  paymentRequestId: string | null;
  paymentRequestChoice: CustomerPaymentChoice | null;
  onPay: (
    providerRequestId: string,
    paymentChoice: CustomerPaymentChoice,
  ) => void;
}) {
  if (isCustomerBookingPaymentProcessing(request)) {
    return (
      <div
        className="rounded-xl border border-info/20 bg-info-subtle p-3.5"
        role="status"
      >
        <p className="text-sm font-bold text-info">Payment processing</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Your payment is being confirmed. You cannot start another payment yet.
        </p>
      </div>
    );
  }

  if (!canStartCustomerBookingPayment(request, bookingId)) return undefined;

  const presentation = customerBookingPaymentPresentation(request);
  const requestLoading =
    paymentRequestId === request.providerRequestId;

  const onlyFullPayment = request.checkoutOptions.length === 1 &&
    request.checkoutOptions[0]?.choice === "full";

  return (
    <div className="grid gap-2 border-t border-border pt-4">
      {onlyFullPayment ? (
        <p className="text-sm font-bold">Full payment required</p>
      ) : null}
      {onlyFullPayment && request.initialPaymentExplanation ? (
        <p className="text-xs leading-5 text-muted-foreground">{customerPaymentExplanation(request.initialPaymentExplanation)}</p>
      ) : null}
      {presentation.hasBothInitialOptions ? (
        <p className="text-sm font-bold">Payment options</p>
      ) : null}
      {request.checkoutOptions.length > 1 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Choose a deposit or pay the entire service price now.
        </p>
      ) : null}
      {request.checkoutOptions.map((option) => <section key={option.choice} aria-label={option.choice === "minimum" ? "Pay deposit" : option.choice === "full" ? "Pay in full" : "Pay remaining balance"} className="grid gap-3 rounded-xl border border-border bg-muted/25 p-4">
        <h4 className="text-sm font-bold">{option.choice === "minimum" ? "Pay deposit" : option.choice === "full" ? "Pay in full" : "Pay remaining balance"}</h4>
        <p className="text-lg font-bold">{formatCurrency(option.amount)}{option.choice === "minimum" ? " now" : ""}</p>
        {option.choice === "minimum" ? <div className="grid gap-1 text-xs text-muted-foreground">
          <p>{Math.round(request.amount * request.downPaymentPercentage) === Math.round(option.amount * 100)
            ? String(request.downPaymentPercentage) + "% of the service price"
            : "Includes the deposit and any services payable upfront."}</p>
          <p>Remaining after payment: {formatCurrency(presentation.prospectiveBalance ?? 0)}</p>
          {request.remainingBalanceDueAt ? <p>Balance due: {formatCustomerBalanceDeadline(request.remainingBalanceDueAt)}</p> : null}
        </div> : option.choice === "full" ? <p className="text-xs text-muted-foreground">Pay the entire service price now. No remaining balance after this payment.</p> : null}
        <Button
        key={option.choice}
        fullWidth
        loading={
          requestLoading &&
          paymentRequestChoice === option.choice
        }
        loadingLabel="Preparing secure checkout…"
        disabled={paymentRequestId !== null}
        onClick={() => void onPay(request.providerRequestId, option.choice)}
      >
        <CreditCard aria-hidden="true" className="size-5" />
        Pay {option.choice === "remaining_balance" ? "balance " : option.choice === "minimum" ? "deposit " : option.choice === "full" && !onlyFullPayment ? "full " : ""}{formatCurrency(option.amount)}
      </Button></section>)}
      <p className="text-xs leading-5 text-muted-foreground">
        You&apos;ll continue to PayMongo. FEASTA will update your booking after the payment is confirmed.
      </p>
    </div>
  );
}


/** Reword the saved explanation without reading a clock or changing its acceptance-time meaning. */
function customerPaymentExplanation(explanation: string): string {
  const shortNotice = /^Full payment is required because fewer than (\d+) (days?|hours?) remained before the event when this booking was accepted\.$/u.exec(explanation);
  if (shortNotice) {
    return `Because your event was less than ${shortNotice[1]} ${shortNotice[2]} away when this booking was accepted, the full amount must be paid to continue.`;
  }
  return explanation === "Full payment is required for this booking under its saved payment policy."
    ? "The full amount must be paid to continue with this booking."
    : explanation;
}
