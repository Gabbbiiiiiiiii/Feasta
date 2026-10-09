"use client";

import {
  CircleCheckBig,
  Clock3,
  CreditCard,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import type {ReactNode} from "react";

import {StatusBadge, humanize} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import type {
  CustomerPaymentReturnDetails,
  CustomerPaymentReturnKind,
} from "@/lib/customer/payments/customer-payment-types";
import {cn} from "@/lib/utils";

type CustomerPaymentReturnState =
  | "loading"
  | "ready"
  | "unavailable"
  | "error";

type CustomerPaymentReturnPanelProps = {
  kind: CustomerPaymentReturnKind;
  state: CustomerPaymentReturnState;
  payment: CustomerPaymentReturnDetails | null;
  refreshing: boolean;
  onRefresh: () => void;
  onRetryCheckout: (
    payment: CustomerPaymentReturnDetails,
  ) => void;
};

function CustomerPaymentReturnPanel({
  kind,
  state,
  payment,
  refreshing,
  onRefresh,
  onRetryCheckout,
}: CustomerPaymentReturnPanelProps) {
  if (kind === "invalid") {
    return (
      <ReturnShell tone="warning" role="alert">
        <ReturnHeading
          icon={<TriangleAlert className="size-6" />}
          title="We could not verify this payment return"
          description="The return link was incomplete or invalid. No payment or booking record was changed."
        />
        <ReturnNavigation />
      </ReturnShell>
    );
  }

  if (state === "loading") {
    return (
      <ReturnShell tone="info" role="status">
        <ReturnHeading
          icon={<Clock3 className="size-6" />}
          title="Checking your payment"
          description="Loading the latest trusted payment and provider-request status."
        />
      </ReturnShell>
    );
  }

  if (state === "unavailable") {
    return (
      <ReturnShell tone="warning" role="alert">
        <ReturnHeading
          icon={<TriangleAlert className="size-6" />}
          title="Payment details are unavailable"
          description="We could not safely match this return to one of your payments. No payment or booking record was changed."
        />
        <ReturnNavigation />
      </ReturnShell>
    );
  }

  if (state === "error" || !payment) {
    return (
      <ReturnShell tone="warning" role="alert">
        <ReturnHeading
          icon={<TriangleAlert className="size-6" />}
          title="Payment status could not be loaded"
          description="Your records were not changed. Recheck the trusted status when you are ready."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            variant="secondary"
            size="compact"
            loading={refreshing}
            loadingLabel="Rechecking payment"
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Recheck payment
          </Button>
          <ReturnNavigation />
        </div>
      </ReturnShell>
    );
  }

  const presentation = returnPresentation(kind, payment.paymentStatus);

  return (
    <ReturnShell tone={presentation.tone} role="status">
      <ReturnHeading
        icon={presentation.icon}
        title={presentation.title}
        description={presentation.description}
      />

      <div className="grid min-w-0 gap-4 rounded-xl border border-border/80 bg-card/80 p-4 sm:p-5">
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="break-words text-lg font-black tracking-tight">
              {payment.providerName}
            </p>
            <p className="mt-1 break-words text-sm font-bold text-primary-strong">
              {payment.serviceLabel}
            </p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {payment.categoryLabel}
            </p>
            <p className="mt-1 break-words text-xs font-semibold text-muted-foreground">
              {payment.bookingLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <StatusBadge
              status={payment.paymentStatus}
              label={`Payment: ${humanize(payment.paymentStatus)}`}
            />
            <StatusBadge
              status={payment.providerRequestStatus}
              label={`Request: ${humanize(payment.providerRequestStatus)}`}
            />
          </div>
        </header>

        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          <ReturnDetail
            label="Request amount"
            value={payment.requestAmountFormatted}
          />
          <ReturnDetail
            label="Down payment"
            value={payment.downPaymentAmountFormatted}
          />
        </dl>

        <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:flex-wrap">
          <Button
            variant="secondary"
            size="compact"
            loading={refreshing}
            loadingLabel="Rechecking payment"
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Recheck payment
          </Button>
          {payment.canStartCheckout ? (
            <Button
              size="compact"
              onClick={() => onRetryCheckout(payment)}
            >
              <CreditCard aria-hidden="true" className="size-4" />
              Retry secure checkout
            </Button>
          ) : null}
          <Button asChild variant="secondary" size="compact">
            <Link href={payment.bookingDetailsPath}>
              View booking details
            </Link>
          </Button>
          <Button asChild variant="ghost" size="compact">
            <Link href="/customer/bookings">All bookings</Link>
          </Button>
          <Button asChild variant="ghost" size="compact">
            <Link href="/customer/payments">All payments</Link>
          </Button>
        </div>
      </div>
    </ReturnShell>
  );
}

function ReturnShell({
  tone,
  role,
  children,
}: {
  tone: "success" | "info" | "warning";
  role: "status" | "alert";
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "grid min-w-0 gap-4 rounded-card border p-4 shadow-card sm:p-6",
        tone === "success" && "border-success/20 bg-success-subtle",
        tone === "info" && "border-info/20 bg-info-subtle",
        tone === "warning" && "border-warning/25 bg-warning-subtle",
      )}
      aria-labelledby="customer-payment-return-title"
      aria-live="polite"
      role={role}
    >
      {children}
    </section>
  );
}

function ReturnHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <header className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-card text-primary-strong shadow-sm">
        {icon}
      </span>
      <div className="min-w-0">
        <h2
          id="customer-payment-return-title"
          className="break-words text-xl font-black tracking-tight"
        >
          {title}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </header>
  );
}

function ReturnDetail({label, value}: {label: string; value: string}) {
  return (
    <div className="min-w-0 bg-card p-3.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-black tabular-nums">{value}</dd>
    </div>
  );
}

function ReturnNavigation() {
  return (
    <nav className="flex flex-col gap-3 sm:flex-row sm:flex-wrap" aria-label="Payment return navigation">
      <Button asChild variant="secondary" size="compact">
        <Link href="/customer/payments">View payments</Link>
      </Button>
      <Button asChild variant="ghost" size="compact">
        <Link href="/customer/bookings">View bookings</Link>
      </Button>
    </nav>
  );
}

function returnPresentation(
  kind: Exclude<CustomerPaymentReturnKind, "invalid">,
  paymentStatus: CustomerPaymentReturnDetails["paymentStatus"],
): {
  tone: "success" | "info" | "warning";
  icon: ReactNode;
  title: string;
  description: string;
} {
  if (paymentStatus === "paid") {
    return {
      tone: "success",
      icon: <CircleCheckBig className="size-6" />,
      title: "Payment confirmed",
      description:
        "FEASTA's trusted payment record confirms this provider-request payment.",
    };
  }

  if (kind === "cancelled") {
    return {
      tone: "warning",
      icon: <TriangleAlert className="size-6" />,
      title: "Checkout was not completed",
      description:
        "The return did not change your payment. The trusted status below shows whether this provider request is still payable.",
    };
  }

  if (
    paymentStatus === "pending" ||
    paymentStatus === "processing"
  ) {
    return {
      tone: "info",
      icon: <Clock3 className="size-6" />,
      title: "Payment verification in progress",
      description:
        "PayMongo returned you to FEASTA, but only the trusted backend confirmation can mark this payment as paid.",
    };
  }

  return {
    tone: "warning",
    icon: <TriangleAlert className="size-6" />,
    title:
      paymentStatus === "refunded"
        ? "Payment was refunded"
        : "Payment is not confirmed",
    description:
      "The trusted payment record is shown below. Recheck it before attempting another checkout.",
  };
}

export {
  CustomerPaymentReturnPanel,
  type CustomerPaymentReturnPanelProps,
  type CustomerPaymentReturnState,
};
