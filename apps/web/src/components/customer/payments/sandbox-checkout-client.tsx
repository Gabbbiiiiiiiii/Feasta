"use client";

import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FlaskConical,
  Lock,
  Smartphone,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import {useState} from "react";

import {Button} from "@/components/ui/button";
import {
  completeCustomerSandboxCheckout,
  type SandboxMockPaymentMethod,
} from "@/lib/customer/payments/customer-payment-client";
import {cn} from "@/lib/utils";

type SandboxCheckoutClientProps = {
  paymentId: string;
  checkoutSessionId: string;
  bookingId: string;
  bookingCode: string;
  providerName: string;
  serviceLabel: string;
  paymentChoiceLabel: string;
  amountFormatted: string;
  paymentStatus: string;
  providerShareFormatted: string | null;
  platformFeeFormatted: string | null;
};

const PAYMENT_METHODS: ReadonlyArray<{
  id: SandboxMockPaymentMethod;
  label: string;
  description: string;
  badge: string;
}> = [
  {
    id: "gcash",
    label: "GCash (Sandbox)",
    description: "Simulated instant e-wallet authorization",
    badge: "E-Wallet",
  },
  {
    id: "paymaya",
    label: "Maya (Sandbox)",
    description: "Simulated instant Maya wallet confirmation",
    badge: "E-Wallet",
  },
  {
    id: "card",
    label: "Test Card •••• 4242",
    description: "Simulated Visa debit/credit authorization",
    badge: "Card",
  },
];

export function SandboxCheckoutClient({
  paymentId,
  checkoutSessionId,
  bookingId,
  bookingCode,
  providerName,
  serviceLabel,
  paymentChoiceLabel,
  amountFormatted,
  paymentStatus,
  providerShareFormatted,
  platformFeeFormatted,
}: SandboxCheckoutClientProps) {
  const [selectedMethod, setSelectedMethod] =
    useState<SandboxMockPaymentMethod>("gcash");
  const [submittingOutcome, setSubmittingOutcome] = useState<
    "paid" | "failed" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedSimulated, setFailedSimulated] = useState(
    paymentStatus === "failed",
  );

  const isAlreadyPaid =
    paymentStatus === "paid" ||
    paymentStatus === "partially_refunded" ||
    paymentStatus === "refunded";

  const canAct =
    !isAlreadyPaid &&
    ["pending", "processing", "failed"].includes(paymentStatus);

  async function handleOutcome(outcome: "paid" | "failed") {
    if (submittingOutcome !== null || !canAct) return;
    setSubmittingOutcome(outcome);
    setErrorMessage(null);

    try {
      await completeCustomerSandboxCheckout({
        paymentId,
        outcome,
        paymentMethod: selectedMethod,
      });

      if (outcome === "paid") {
        window.location.assign(
          `/customer/payments?payment=success&ref=${encodeURIComponent(paymentId)}`,
        );
        return;
      }

      setFailedSimulated(true);
      setSubmittingOutcome(null);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "We couldn't complete this sandbox payment. Please try again.",
      );
      setSubmittingOutcome(null);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/customer/bookings/${bookingId}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to booking
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-subtle px-3 py-1 text-xs font-semibold text-warning">
          <FlaskConical aria-hidden="true" className="size-3.5" />
          Sandbox Test Mode · No Real Charge
        </span>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          FEASTA Sandbox Checkout
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
          Complete your test payment
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          PayMongo live/test checkout is currently switched to FEASTA Sandbox Mode.
          Authorizing here executes the exact FEASTA payment confirmation,
          direct-to-provider split ledger, and booking update without charging real funds.
        </p>
      </section>

      {isAlreadyPaid ? (
        <section
          className="grid gap-4 rounded-2xl border border-success/30 bg-success-subtle p-6"
          role="status"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-6 shrink-0 text-success"
            />
            <div className="grid gap-1">
              <h2 className="text-base font-bold text-foreground">
                This payment is already settled
              </h2>
              <p className="text-sm text-muted-foreground">
                {amountFormatted} for {serviceLabel} ({providerName}) has already been recorded.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/customer/bookings/${bookingId}`}
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              View booking details
            </Link>
            <Link
              href={`/customer/payments?payment=success&ref=${encodeURIComponent(paymentId)}`}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"
            >
              View payment confirmation
            </Link>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)]">
          <section className="grid content-start gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div>
              <h2 className="text-base font-bold text-foreground">
                1. Choose a simulated payment method
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Pick any option below to test the checkout experience.
              </p>
            </div>

            <div
              className="grid gap-3"
              role="radiogroup"
              aria-label="Simulated payment method"
            >
              {PAYMENT_METHODS.map((method) => {
                const selected = selectedMethod === method.id;
                const Icon = method.id === "card"
                  ? CreditCard
                  : method.id === "gcash"
                    ? Smartphone
                    : Wallet;
                return (
                  <button
                    key={method.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={submittingOutcome !== null}
                    onClick={() => setSelectedMethod(method.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon aria-hidden="true" className="size-5" />
                      </div>
                      <div className="grid gap-0.5">
                        <span className="text-sm font-bold text-foreground">
                          {method.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {method.description}
                        </span>
                      </div>
                    </div>
                    <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {method.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            {failedSimulated ? (
              <div
                className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
                role="alert"
              >
                <XCircle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-destructive"
                />
                <div className="grid gap-1">
                  <p className="text-sm font-bold text-foreground">
                    Simulated payment declined
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    FEASTA recorded this payment attempt as failed while keeping your
                    booking active. You can authorize a successful test payment below
                    or return to your booking.
                  </p>
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <div
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}

            <div className="grid gap-3 border-t border-border pt-4">
              <Button
                fullWidth
                disabled={!canAct || submittingOutcome !== null}
                loading={submittingOutcome === "paid"}
                loadingLabel="Authorizing test payment…"
                onClick={() => void handleOutcome("paid")}
              >
                <Lock aria-hidden="true" className="size-4" />
                Authorize test payment ({amountFormatted})
              </Button>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={
                    !canAct ||
                    submittingOutcome !== null ||
                    failedSimulated
                  }
                  loading={submittingOutcome === "failed"}
                  loadingLabel="Simulating failure…"
                  onClick={() => void handleOutcome("failed")}
                >
                  Simulate failed payment
                </Button>

                <Link
                  href={`/customer/payments?payment=cancelled&ref=${encodeURIComponent(paymentId)}`}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  Cancel &amp; return
                </Link>
              </div>
            </div>
          </section>

          <aside className="grid content-start gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Payment summary
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Booking {bookingCode}
              </p>
            </div>

            <dl className="grid gap-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Provider</dt>
                <dd className="text-right font-semibold text-foreground">
                  {providerName}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Service</dt>
                <dd className="text-right font-semibold text-foreground">
                  {serviceLabel}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Payment type</dt>
                <dd className="text-right font-semibold text-foreground">
                  {paymentChoiceLabel}
                </dd>
              </div>
            </dl>

            <div className="grid gap-2.5 border-t border-border pt-4 text-sm">
              {providerShareFormatted && platformFeeFormatted ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Direct to {providerName}
                    </span>
                    <span className="font-semibold text-foreground">
                      {providerShareFormatted}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      FEASTA service fee
                    </span>
                    <span className="font-semibold text-foreground">
                      {platformFeeFormatted}
                    </span>
                  </div>
                </>
              ) : null}

              <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                <span className="font-bold text-foreground">Total due now</span>
                <span className="text-lg font-bold text-primary">
                  {amountFormatted}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3.5 text-xs leading-5 text-muted-foreground">
              <p className="font-semibold text-foreground">
                Direct-to-provider split simulation
              </p>
              <p className="mt-1">
                Upon authorization, FEASTA records the provider share directly
                for {providerName} and books only FEASTA&apos;s service fee to
                platform commission—matching live gateway accounting.
              </p>
              <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground/80">
                Session: {checkoutSessionId}
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
