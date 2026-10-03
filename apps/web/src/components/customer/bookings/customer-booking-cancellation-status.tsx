"use client";

import {RefreshCcw, ShieldCheck} from "lucide-react";
import {useCallback, useEffect, useState} from "react";

import {boundedText, formatBookingDateTime} from "@/components/customer/bookings/booking-formatters";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {
  getCustomerProviderRequestCancellationStatus,
  type CustomerCancellationProjection,
} from "@/lib/customer/bookings/customer-cancellation-client";
import {
  cancellationStatusPresentation,
  formatTrustedRefundAmount,
  refundStatusPresentation,
} from "@/lib/customer/bookings/customer-cancellation-presentation";

type CustomerBookingCancellationStatusProps = {
  providerRequestId: string;
  providerName: string;
  refreshToken?: number;
};

type CancellationLoadState =
  | {kind: "loading"}
  | {kind: "ready"; cancellation: CustomerCancellationProjection | null}
  | {kind: "error"; message: string};

function CustomerBookingCancellationStatus({
  providerRequestId,
  providerName,
  refreshToken = 0,
}: CustomerBookingCancellationStatusProps) {
  const [state, setState] = useState<CancellationLoadState>({kind: "loading"});
  const safeProviderName = boundedText(providerName, "this Provider", 80);

  const loadStatus = useCallback(async (showLoading: boolean) => {
    if (showLoading) setState({kind: "loading"});

    try {
      const result = await getCustomerProviderRequestCancellationStatus(providerRequestId);
      setState({kind: "ready", cancellation: result.cancellation});
    } catch (error: unknown) {
      setState({
        kind: "error",
        message: safeStatusErrorMessage(error),
      });
    }
  }, [providerRequestId]);

  useEffect(() => {
    let active = true;

    void getCustomerProviderRequestCancellationStatus(providerRequestId)
      .then((result) => {
        if (active) setState({kind: "ready", cancellation: result.cancellation});
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          kind: "error",
          message: safeStatusErrorMessage(error),
        });
      });

    return () => {
      active = false;
    };
  }, [providerRequestId, refreshToken]);

  if (state.kind === "loading") {
    return (
      <section aria-label={`Cancellation and refund status for ${safeProviderName}`} className="rounded-xl border border-border bg-muted/25 p-3.5" role="status">
        <p className="text-sm font-bold">Cancellation and refund status</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Loading trusted status…</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section aria-label={`Cancellation and refund status for ${safeProviderName}`} className="grid gap-3 rounded-xl border border-warning/25 bg-warning-subtle p-3.5" role="alert">
        <div>
          <p className="text-sm font-bold text-warning">Cancellation status unavailable</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{state.message}</p>
        </div>
        <Button variant="secondary" size="compact" className="w-fit" onClick={() => void loadStatus(true)}>
          <RefreshCcw aria-hidden="true" className="size-4" />
          Try again
        </Button>
      </section>
    );
  }

  if (!state.cancellation) {
    return (
      <section aria-label={`Cancellation and refund status for ${safeProviderName}`} className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-muted/25 p-3.5" role="status">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-bold">No cancellation request</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">No cancellation or refund workflow is recorded for this Provider service.</p>
        </div>
      </section>
    );
  }

  const cancellation = state.cancellation;
  const status = cancellationStatusPresentation(cancellation);
  const refund = refundStatusPresentation(cancellation);

  return (
    <section aria-label={`Cancellation and refund status for ${safeProviderName}`} className="grid min-w-0 gap-3 rounded-xl border border-info/20 bg-info-subtle p-3.5" role="status">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-info">This Provider service only</p>
          <h4 className="mt-1 break-words text-sm font-black">{status.title}</h4>
        </div>
        <StatusBadge status={cancellation.status} label={status.title} />
      </div>
      <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
        <p>{status.description}</p>
        <p className="font-semibold text-foreground">Next step: {status.nextStep}</p>
      </div>
      <div className="rounded-lg border border-info/15 bg-card/75 p-3">
        <p className="text-sm font-bold">{refund.title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{refund.description}</p>
        {refund.amountInCentavos !== null ? (
          <p className="mt-2 text-lg font-black tabular-nums">{formatTrustedRefundAmount(refund.amountInCentavos)}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-info/15 pt-2.5 text-xs text-muted-foreground">
        <span>Updated {formatBookingDateTime(cancellation.updatedAt)}</span>
        <Button variant="secondary" size="compact" onClick={() => void loadStatus(true)}>
          <RefreshCcw aria-hidden="true" className="size-4" />
          Refresh status
        </Button>
      </div>
    </section>
  );
}

function safeStatusErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.name === "CustomerCancellationClientError" &&
    error.message.trim().length > 0 &&
    error.message.length <= 240
  ) {
    return error.message;
  }

  return "Cancellation status is temporarily unavailable. Please try again or contact FEASTA support.";
}

export {CustomerBookingCancellationStatus, type CustomerBookingCancellationStatusProps};
