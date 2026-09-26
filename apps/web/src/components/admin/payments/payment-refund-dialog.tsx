"use client";

import {
  useRef,
  useState,
} from "react";

import {
  feastaToast,
} from "@/components/feedback/toast";
import {
  ConfirmationDialog,
} from "@/components/shared/confirmation-dialog";
import {
  createRefundIdempotencyKey,
  requestAdminPaymentRefund,
} from "@/lib/admin/payments/admin-payment-client";
import type {
  AdminPayment,
  AdminPaymentRefundResult,
} from "@/lib/admin/payments/admin-payment-types";

type PaymentRefundDialogProps = {
  payment: AdminPayment | null;
  open: boolean;

  onOpenChange: (
    open: boolean,
  ) => void;

  onRefundRequested: (
    payment: AdminPayment,
    result: AdminPaymentRefundResult,
  ) => void;
};

function PaymentRefundDialog({
  payment,
  open,
  onOpenChange,
  onRefundRequested,
}: PaymentRefundDialogProps) {
  const [reason, setReason] =
    useState("");

  const [error, setError] =
    useState<string>();

  const [submitting, setSubmitting] =
    useState(false);

  const idempotencyKey =
    useRef<string | null>(null);

  const normalizedReason = reason
    .trim()
    .replace(/\s+/g, " ");

  const reasonIsValid =
    normalizedReason.length >= 5 &&
    normalizedReason.length <= 500;

  const handleOpenChange = (
    nextOpen: boolean,
  ) => {
    if (submitting) {
      return;
    }

    if (!nextOpen) {
      resetForm();
    }

    onOpenChange(nextOpen);
  };

  const requestRefund = async () => {
    if (
      !payment ||
      !payment.refundEligibility
        .eligible ||
      !reasonIsValid ||
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      idempotencyKey.current ??=
        createRefundIdempotencyKey(
          payment.paymentId,
        );

      const result =
        await requestAdminPaymentRefund({
          paymentId:
            payment.paymentId,
          reason: normalizedReason,
          idempotencyKey:
            idempotencyKey.current,
        });

      feastaToast.success(
        result.idempotentReplay
          ? "The existing refund request was recovered successfully."
          : "Refund requested. Waiting for PayMongo confirmation.",
      );

      resetForm();
      onOpenChange(false);

      onRefundRequested(
        payment,
        result,
      );
    } catch (caughtError: unknown) {
      const message =
        errorMessage(caughtError);

      setError(message);
      feastaToast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setReason("");
    setError(undefined);
    idempotencyKey.current = null;
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={
        handleOpenChange
      }
      title="Request payment refund"
      description={
        payment
          ? `Request a full refund of ${payment.formattedAmount} for transaction ${payment.paymentId}.`
          : "Request a full payment refund."
      }
      confirmLabel="Request refund"
      cancelLabel="Keep payment"
      loadingLabel="Requesting refund"
      destructive
      loading={submitting}
      confirmDisabled={
        !payment ||
        !payment.refundEligibility
          .eligible ||
        !reasonIsValid
      }
      onConfirm={requestRefund}
    >
      <div className="grid min-w-0 gap-4">
        <div
          className="rounded-lg border border-warning bg-warning-subtle p-4"
          role="note"
        >
          <p className="font-bold text-warning">
            Full refund through PayMongo
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            FEASTA will submit this
            request to PayMongo. The
            payment will only become
            refunded after a verified
            webhook confirms it.
          </p>
        </div>

        <label
          className="grid min-w-0 gap-2"
          htmlFor="payment-refund-reason"
        >
          <span className="text-sm font-bold">
            Refund reason
          </span>

          <textarea
            id="payment-refund-reason"
            value={reason}
            rows={5}
            minLength={5}
            maxLength={500}
            required
            disabled={submitting}
            aria-invalid={
              reason.length > 0 &&
              !reasonIsValid
            }
            aria-describedby={
              error
                ? "payment-refund-help payment-refund-error"
                : "payment-refund-help"
            }
            placeholder="Explain why this payment should be refunded."
            className={[
              "min-h-32 w-full resize-y rounded-lg border bg-card px-4 py-3",
              "text-base text-card-foreground",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:bg-disabled",
              reason.length > 0 &&
              !reasonIsValid
                ? "border-destructive"
                : "border-input",
            ].join(" ")}
            onChange={(event) => {
              setReason(
                event.currentTarget.value,
              );

              if (error) {
                setError(undefined);
              }
            }}
          />
        </label>

        <div className="flex min-w-0 items-start justify-between gap-3">
          <p
            id="payment-refund-help"
            className="text-sm text-muted-foreground"
          >
            Enter between 5 and 500
            characters.
          </p>

          <p className="shrink-0 text-sm text-muted-foreground">
            {reason.length}/500
          </p>
        </div>

        {error ? (
          <p
            id="payment-refund-error"
            className="rounded-lg border border-destructive bg-destructive-subtle p-3 text-sm font-semibold text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </ConfirmationDialog>
  );
}

function errorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "The refund request could not be completed.";
}

export {
  PaymentRefundDialog,
  type PaymentRefundDialogProps,
};