"use client";

import {CalendarDays, Clock3, CreditCard, PackageOpen, UserRound} from "lucide-react";

import {DetailDrawer} from "@/components/data";
import {SectionLoading} from "@/components/feedback/application-states";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import type {ProviderPaymentDetail} from "@/lib/provider/payments/provider-payment-types";

type ProviderPaymentDetailDrawerProps = {
  detail: ProviderPaymentDetail | null;
  open: boolean;
  loading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
};

export function ProviderPaymentDetailDrawer({
  detail,
  open,
  loading,
  error,
  onOpenChange,
  onRetry,
}: ProviderPaymentDetailDrawerProps) {
  const payment = detail?.payment ?? null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Payment details"
      description="Review the customer payment activity recorded for this booking request."
    >
      {loading ? (
        <SectionLoading label="Loading payment details" />
      ) : error ? (
        <div
          className="grid gap-4 rounded-card border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <div>
            <p className="font-semibold">Payment details are unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="secondary" size="compact" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : payment && detail ? (
        <div className="grid gap-6">
          <DrawerSection title="Payment status">
            <StatusRow label="Payment" status={payment.status} />
            {payment.refundStatus ? (
              <StatusRow
                label="Refund"
                status={payment.refundStatus}
                statusLabel={refundStatusLabel(payment.refundStatus)}
              />
            ) : null}
            <StatusRow label="Provider request" status={detail.providerRequestStatus} />
            <StatusRow label="Main event" status={detail.mainEventStatus} />
          </DrawerSection>

          <DrawerSection title="References">
            <DetailRow label="Payment ID" value={payment.paymentId} />
            <DetailRow label="Provider Request ID" value={payment.providerRequestId} />
            <DetailRow label="Main Event ID" value={payment.mainEventId} />
          </DrawerSection>

          <DrawerSection title="Customer">
            <DetailRow
              icon={<UserRound className="size-4" />}
              label="Customer"
              value={payment.customerDisplayName}
            />
          </DrawerSection>

          <DrawerSection title="Event">
            <DetailRow
              icon={<CalendarDays className="size-4" />}
              label="Event"
              value={formatLabel(payment.eventType)}
            />
            <DetailRow
              icon={<CalendarDays className="size-4" />}
              label="Event date"
              value={formatDate(payment.eventDate)}
            />
            <DetailRow
              icon={<Clock3 className="size-4" />}
              label="Event time"
              value={payment.eventTime ?? "Not provided"}
            />
          </DrawerSection>

          <DrawerSection title="Service">
            <DetailRow
              icon={<PackageOpen className="size-4" />}
              label="Service / package"
              value={payment.serviceSummary}
            />
          </DrawerSection>

          <DrawerSection title="Payment">
            <DetailRow
              icon={<CreditCard className="size-4" />}
              label="Amount"
              value={formatCentavos(payment.amountInCentavos)}
            />
            <DetailRow label="Currency" value={payment.currency} />
            <DetailRow label="Payment type" value={formatPaymentType(payment.paymentType)} />
          </DrawerSection>

          <DrawerSection title="Activity">
            <DetailRow label="Created" value={formatDateTime(payment.createdAt)} />
            <DetailRow label="Updated" value={formatDateTime(payment.updatedAt)} />
            <DetailRow label="Paid" value={formatDateTime(payment.paidAt)} />
            <DetailRow label="Failed" value={formatDateTime(payment.failedAt)} />
            <DetailRow label="Expired" value={formatDateTime(payment.expiredAt)} />
            <DetailRow label="Refunded" value={formatDateTime(payment.refundedAt)} />
          </DrawerSection>
        </div>
      ) : null}
    </DetailDrawer>
  );
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      {icon ? <span className="mt-0.5 text-muted-foreground">{icon}</span> : null}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  status,
  statusLabel,
}: {
  label: string;
  status: string;
  statusLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <StatusBadge status={status} label={statusLabel} />
    </div>
  );
}

function refundStatusLabel(status: NonNullable<ProviderPaymentDetail["payment"]["refundStatus"]>) {
  if (status === "requested") return "Refund pending";
  if (status === "processing") return "Refund processing";
  return "Refund completed";
}

function formatPaymentType(type: ProviderPaymentDetail["payment"]["paymentType"]): string {
  const labels = {
    provider_down_payment: "Provider request down payment",
    provider_balance: "Provider request balance payment",
    refund: "Refund",
    adjustment: "Payment adjustment",
  } as const;

  return labels[type];
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatCentavos(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatDate(value: string): string {
  return formatDateValue(value, {dateStyle: "long"});
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not available";
  return formatDateValue(value, {dateStyle: "medium", timeStyle: "short"});
}

function formatDateValue(
  value: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone: "Asia/Manila",
  }).format(date);
}
