"use client";

import {useMemo, useState} from "react";

import {Button} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {requestMockProviderWithdrawal} from "@/lib/provider/payments/provider-payout-client";
import type {MockProviderWithdrawalResult} from "@/lib/provider/payments/provider-mock-withdrawal-types";

type AmountMode = "full" | "custom";
type DestinationType = "gcash" | "bank";
type Step = "amount" | "destination" | "review" | "success";

type ProviderMockWithdrawDialogProps = {
  open: boolean;
  availableAmountInCentavos: number;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => Promise<void> | void;
};

export function ProviderMockWithdrawDialog({
  open,
  availableAmountInCentavos,
  onOpenChange,
  onCompleted,
}: ProviderMockWithdrawDialogProps) {
  const [step, setStep] = useState<Step>("amount");
  const [amountMode, setAmountMode] = useState<AmountMode>("full");
  const [customPesos, setCustomPesos] = useState("");
  const [destinationType, setDestinationType] =
    useState<DestinationType>("gcash");
  const [accountName, setAccountName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] =
    useState<MockProviderWithdrawalResult | null>(null);

  const availablePesos = availableAmountInCentavos / 100;

  const amountInCentavos = useMemo(() => {
    if (amountMode === "full") {
      return availableAmountInCentavos;
    }

    const parsed = Number(customPesos);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.round(parsed * 100);
  }, [amountMode, availableAmountInCentavos, customPesos]);

  const reset = () => {
    setStep("amount");
    setAmountMode("full");
    setCustomPesos("");
    setDestinationType("gcash");
    setAccountName("");
    setMobileNumber("");
    setBankName("");
    setAccountNumber("");
    setSubmitting(false);
    setError(null);
    setResult(null);
  };

  const close = (nextOpen: boolean) => {
    if (!nextOpen && submitting) {
      return;
    }

    onOpenChange(nextOpen);
    if (!nextOpen) {
      reset();
    }
  };

  const validateAmount = (): string | null => {
    if (availableAmountInCentavos <= 0) {
      return "There are no available earnings to withdraw.";
    }

    if (!Number.isSafeInteger(amountInCentavos) || amountInCentavos <= 0) {
      return "Enter a withdrawal amount greater than zero.";
    }

    if (amountInCentavos > availableAmountInCentavos) {
      return "Withdrawal amount cannot exceed available earnings.";
    }

    return null;
  };

  const validateDestination = (): string | null => {
    if (accountName.trim().length < 2) {
      return "Enter the account name.";
    }

    if (destinationType === "gcash") {
      const digits = mobileNumber.replace(/\D/gu, "");
      const normalized =
        digits.startsWith("63") && digits.length === 12
          ? `0${digits.slice(2)}`
          : digits;

      if (!/^09\d{9}$/u.test(normalized)) {
        return "Enter a valid GCash mobile number.";
      }

      return null;
    }

    if (bankName.trim().length < 2) {
      return "Enter the bank name.";
    }

    if (!/^\d{8,20}$/u.test(accountNumber.replace(/[\s-]/gu, ""))) {
      return "Enter a valid bank account number.";
    }

    return null;
  };

  const goDestination = () => {
    const amountError = validateAmount();
    if (amountError) {
      setError(amountError);
      return;
    }

    setError(null);
    setStep("destination");
  };

  const goReview = () => {
    const destinationError = validateDestination();
    if (destinationError) {
      setError(destinationError);
      return;
    }

    setError(null);
    setStep("review");
  };

  const submit = async () => {
    const amountError = validateAmount();
    if (amountError) {
      setError(amountError);
      setStep("amount");
      return;
    }

    const destinationError = validateDestination();
    if (destinationError) {
      setError(destinationError);
      setStep("destination");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await requestMockProviderWithdrawal({
        clientRequestId:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        amountInCentavos,
        destinationType,
        accountName: accountName.trim(),
        ...(destinationType === "gcash"
          ? {mobileNumber: mobileNumber.trim()}
          : {
              bankName: bankName.trim(),
              accountNumber: accountNumber.replace(/[\s-]/gu, ""),
            }),
      });

      setResult(response);
      setStep("success");
      await onCompleted();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The withdrawal could not be completed.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "success" ? "Withdrawal recorded" : "Withdraw earnings"}
          </DialogTitle>
          <DialogDescription>
            {step === "success"
              ? "This was a simulated payout. Available earnings were deducted and paid-out totals were updated."
              : "Simulated cash-out for demo use. Destination details are used once and stored only in masked form."}
          </DialogDescription>
        </DialogHeader>

        <div
          className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-sm text-muted-foreground"
          role="status"
        >
          Mock payout mode — no real GCash or bank transfer is sent.
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {step === "amount" ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Available: <strong>{formatCentavos(availableAmountInCentavos)}</strong>
            </p>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-semibold">Amount</legend>
              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <input
                  type="radio"
                  name="withdraw-amount-mode"
                  checked={amountMode === "full"}
                  onChange={() => setAmountMode("full")}
                  className="mt-1"
                  aria-label="Withdraw all available earnings"
                />
                <span>
                  <span className="block font-medium">Withdraw all</span>
                  <span className="text-sm text-muted-foreground">
                    {formatCentavos(availableAmountInCentavos)}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <input
                  type="radio"
                  name="withdraw-amount-mode"
                  checked={amountMode === "custom"}
                  onChange={() => setAmountMode("custom")}
                  className="mt-1"
                  aria-label="Custom amount"
                />
                <span className="grid w-full gap-2">
                  <span className="block font-medium" aria-hidden="true">
                    Custom amount
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step="0.01"
                    max={availablePesos}
                    disabled={amountMode !== "custom"}
                    value={customPesos}
                    onChange={(event) => setCustomPesos(event.target.value)}
                    placeholder="0.00"
                    aria-label="Custom withdrawal amount in pesos"
                  />
                </span>
              </label>
            </fieldset>
          </div>
        ) : null}

        {step === "destination" ? (
          <div className="grid gap-4">
            <fieldset className="grid gap-3">
              <legend className="text-sm font-semibold">Destination</legend>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={destinationType === "gcash" ? "default" : "secondary"}
                  onClick={() => setDestinationType("gcash")}
                >
                  GCash
                </Button>
                <Button
                  type="button"
                  variant={destinationType === "bank" ? "default" : "secondary"}
                  onClick={() => setDestinationType("bank")}
                >
                  Bank transfer
                </Button>
              </div>
            </fieldset>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="mock-withdraw-account-name">
                Account name
              </label>
              <Input
                id="mock-withdraw-account-name"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                autoComplete="name"
              />
            </div>

            {destinationType === "gcash" ? (
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="mock-withdraw-mobile">
                  GCash mobile number
                </label>
                <Input
                  id="mock-withdraw-mobile"
                  value={mobileNumber}
                  onChange={(event) => setMobileNumber(event.target.value)}
                  placeholder="09XXXXXXXXX"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="mock-withdraw-bank">
                    Bank name
                  </label>
                  <Input
                    id="mock-withdraw-bank"
                    value={bankName}
                    onChange={(event) => setBankName(event.target.value)}
                    placeholder="BDO, BPI, Metrobank..."
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="mock-withdraw-account-number">
                    Account number
                  </label>
                  <Input
                    id="mock-withdraw-account-number"
                    value={accountNumber}
                    onChange={(event) => setAccountNumber(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>
              </>
            )}
          </div>
        ) : null}

        {step === "review" ? (
          <dl className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm">
            <ReviewRow label="Amount" value={formatCentavos(amountInCentavos)} />
            <ReviewRow
              label="Method"
              value={destinationType === "gcash" ? "GCash" : "Bank transfer"}
            />
            <ReviewRow label="Account name" value={accountName.trim()} />
            {destinationType === "gcash" ? (
              <ReviewRow label="Mobile number" value={mobileNumber.trim()} />
            ) : (
              <>
                <ReviewRow label="Bank" value={bankName.trim()} />
                <ReviewRow label="Account number" value={accountNumber.trim()} />
              </>
            )}
            <ReviewRow
              label="Available after"
              value={formatCentavos(availableAmountInCentavos - amountInCentavos)}
            />
          </dl>
        ) : null}

        {step === "success" && result ? (
          <dl className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm">
            <ReviewRow label="Reference" value={result.withdrawalId} />
            <ReviewRow label="Amount" value={formatCentavos(result.amountInCentavos)} />
            <ReviewRow
              label="Method"
              value={result.destination.type === "gcash" ? "GCash" : "Bank transfer"}
            />
            <ReviewRow label="Account name" value={result.destination.accountName} />
            {result.destination.type === "gcash" ? (
              <ReviewRow
                label="Mobile"
                value={result.destination.mobileMasked ?? "—"}
              />
            ) : (
              <>
                <ReviewRow
                  label="Bank"
                  value={result.destination.bankName ?? "—"}
                />
                <ReviewRow
                  label="Account"
                  value={result.destination.accountNumberMasked ?? "—"}
                />
              </>
            )}
          </dl>
        ) : null}

        <DialogFooter>
          {step === "amount" ? (
            <>
              <Button type="button" variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={goDestination}>
                Continue
              </Button>
            </>
          ) : null}

          {step === "destination" ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setStep("amount")}>
                Back
              </Button>
              <Button type="button" onClick={goReview}>
                Continue
              </Button>
            </>
          ) : null}

          {step === "review" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => setStep("destination")}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Processing..." : "Confirm withdrawal"}
              </Button>
            </>
          ) : null}

          {step === "success" ? (
            <Button type="button" onClick={() => close(false)}>
              Done
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] break-words text-right font-medium">{value}</dd>
    </div>
  );
}

function formatCentavos(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
