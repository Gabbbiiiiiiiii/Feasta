"use client";

import {SlidersHorizontal} from "lucide-react";
import {useId, useRef, useState, type FormEvent} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {respondToArrangedPayment} from "@/lib/payments/arranged-payment-client";
import type {ProviderRequestListItem} from "@/lib/provider/requests/provider-request-types";
import {ArrangedPaymentTerms} from "@/components/shared/arranged-payment-terms";

const HOUR_MS = 3_600_000;
const currency = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const manilaDisplay = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function toManilaInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 8 * HOUR_MS).toISOString().slice(0, 16);
}

function parseManilaInputMs(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return Number.NaN;
  const date = new Date(value + ":00+08:00");
  if (!Number.isFinite(date.getTime())) return Number.NaN;
  return new Date(date.getTime() + 8 * HOUR_MS).toISOString().slice(0, 16) === value
    ? date.getTime()
    : Number.NaN;
}

export function ProviderArrangedPayment({request, onSaved, disabled, embedded = false}: {
  request: ProviderRequestListItem;
  onSaved?: () => void | Promise<void>;
  disabled: boolean;
  embedded?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [initial, setInitial] = useState("");
  const [balance, setBalance] = useState("");
  const [busyAction, setBusyAction] = useState<"offer" | "withdraw" | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const fieldPrefix = useId();
  const amountId = `${fieldPrefix}-amount`;
  const amountHintId = `${fieldPrefix}-amount-hint`;
  const initialId = `${fieldPrefix}-initial`;
  const initialHintId = `${fieldPrefix}-initial-hint`;
  const balanceId = `${fieldPrefix}-balance`;
  const balanceHintId = `${fieldPrefix}-balance-hint`;

  const offer = request.arrangedPayment;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const offerInitialMs = offer ? Date.parse(offer.initialDueAt) : Number.NaN;
  const offered = request.status === "pending" && offer?.status === "offered" && offerInitialMs > nowMs;
  const expiredOffer = request.status === "pending" && offer?.status === "offered" && offerInitialMs <= nowMs;
  const cutoffIso = request.arrangedBalanceCutoffAt ?? null;
  const cutoffMs = cutoffIso ? Date.parse(cutoffIso) : Number.NaN;
  const cutoffInputMax = toManilaInputValue(cutoffIso);
  const cutoffFormatted = Number.isFinite(cutoffMs) ? manilaDisplay.format(new Date(cutoffMs)) : null;

  const gross = Math.round(request.amount * 100);
  const trimmedAmount = amount.trim();
  const upfront = /^\d+(?:\.\d{1,2})?$/u.test(trimmedAmount) ? Math.round(Number(trimmedAmount) * 100) : Number.NaN;
  const amountValid = Number.isSafeInteger(upfront) && upfront >= 100 && gross - upfront >= 100;
  const remainingPreview = amountValid ? gross - upfront : null;

  const initialMs = parseManilaInputMs(initial);
  const balanceMs = parseManilaInputMs(balance);
  const initialInFuture = Number.isFinite(initialMs) && initialMs > nowMs;
  const balanceAfterInitial = Number.isFinite(initialMs) && Number.isFinite(balanceMs) && balanceMs > initialMs;
  const balanceWithinCutoff = !Number.isFinite(cutoffMs) || (Number.isFinite(balanceMs) && balanceMs <= cutoffMs);

  const amountValidationMessage = trimmedAmount && !amountValid
    ? `Enter a first payment from ₱1.00 up to ${currency.format(Math.max(0, gross - 100) / 100)} so at least ₱1.00 remains for the balance.`
    : null;
  const initialValidationMessage = initial && !initialInFuture
    ? "Choose a first payment deadline in the future (Manila time)."
    : null;
  const balanceValidationMessage = balance && Number.isFinite(initialMs) && !balanceAfterInitial
    ? "Remaining balance due date must be later than the first payment deadline."
    : balance && !balanceWithinCutoff && cutoffFormatted
      ? `Remaining balance must be due on or before ${cutoffFormatted} (48 hours before the event).`
      : null;

  const valid = amountValid && initialInFuture && balanceAfterInitial && balanceWithinCutoff;
  const busy = busyAction !== null;

  if (!request.canOfferArrangedPayment && offer?.status !== "accepted") return null;

  function openEditor() {
    setNowMs(Date.now());
    setError("");
    if (offered && offer) {
      setAmount((offer.upfrontInCentavos / 100).toFixed(offer.upfrontInCentavos % 100 === 0 ? 0 : 2));
      setInitial(toManilaInputValue(offer.initialDueAt));
      setBalance(toManilaInputValue(offer.balanceDueAt));
    } else if (!balance && cutoffInputMax) {
      setBalance(cutoffInputMax);
    }
    setEditing(true);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending.current || disabled) return;
    await save("offer", {
      action: "offerArrangement",
      upfrontInCentavos: upfront,
      initialDueAt: initial,
      balanceDueAt: balance,
    });
  }

  async function save(kind: "offer" | "withdraw", response: Parameters<typeof respondToArrangedPayment>[1]) {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusyAction(kind);
    setError("");
    try {
      await respondToArrangedPayment(request.id, response);
      setEditing(false);
      await onSaved?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save the payment offer.");
    } finally {
      pending.current = false;
      setBusyAction(null);
    }
  }

  const printableTerms = offer?.status === "accepted" || offered;
  const compactButtonOnly =
    embedded &&
    !editing &&
    !printableTerms &&
    !expiredOffer &&
    offer?.status !== "declined" &&
    offer?.status !== "withdrawn";

  if (compactButtonOnly) {
    return (
      <section
        data-print-hidden=""
        className="grid gap-2 print:hidden"
        aria-label="Arranged payment"
      >
        <Button
          type="button"
          variant="secondary"
          fullWidth
          className="min-h-10 rounded-xl font-semibold"
          disabled={busy || disabled}
          onClick={openEditor}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Offer arranged payment
        </Button>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </section>
    );
  }

  return (
    <section
      data-print-hidden={printableTerms ? undefined : ""}
      data-print-card={printableTerms ? "" : undefined}
      className={
        embedded
          ? `grid gap-3 rounded-xl border border-border/80 bg-muted/20 p-4${printableTerms ? "" : " print:hidden"}`
          : `grid gap-3 rounded-card border border-border bg-card p-4 sm:p-5${printableTerms ? "" : " print:hidden"}`
      }
      aria-label="Arranged payment"
    >
      {offer?.status === "accepted" ? (
        <>
          <h3 className="text-sm font-semibold">Arranged payment accepted</h3>
          <ArrangedPaymentTerms offer={offer} />
        </>
      ) : (
        <>
          {offered && offer ? (
            <>
              <h3 className="text-sm font-semibold">Awaiting customer response</h3>
              <ArrangedPaymentTerms offer={offer} />
            </>
          ) : (
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">Arranged payment</h3>
              <p className="text-xs leading-5 text-muted-foreground">
                Offer custom first-payment and remaining-balance terms for this request only. Other customers still see your package’s standard terms.
              </p>
            </div>
          )}

          {expiredOffer ? (
            <p role="status" className="rounded-lg border border-warning/25 bg-warning-subtle px-3 py-2 text-xs text-warning">
              Your previous arranged payment offer expired without a response. Send a new offer or accept with standard terms.
            </p>
          ) : null}
          {offer?.status === "declined" ? (
            <p role="status" className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              The customer declined your arranged payment offer. You can send a revised offer or accept with standard terms.
            </p>
          ) : null}
          {offer?.status === "withdrawn" ? (
            <p role="status" className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              You withdrew the previous arranged payment offer.
            </p>
          ) : null}

          {editing ? (
            <form data-print-hidden="" className="grid gap-3 print:hidden" onSubmit={send}>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <span className="text-muted-foreground">Booking total</span>
                <span className="font-semibold tabular-nums">{currency.format(gross / 100)}</span>
              </div>

              <div className="grid gap-1 text-sm">
                <label htmlFor={amountId} className="font-medium">First payment (PHP)</label>
                <Input
                  id={amountId}
                  aria-describedby={remainingPreview !== null || amountValidationMessage ? amountHintId : undefined}
                  aria-invalid={Boolean(amountValidationMessage)}
                  inputMode="decimal"
                  placeholder="e.g. 5000"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  disabled={busy}
                />
                {remainingPreview !== null ? (
                  <p id={amountHintId} className="text-xs text-muted-foreground">
                    Remaining balance: <strong className="text-foreground tabular-nums">{currency.format(remainingPreview / 100)}</strong>
                  </p>
                ) : amountValidationMessage ? (
                  <p id={amountHintId} role="alert" className="text-xs text-destructive">{amountValidationMessage}</p>
                ) : null}
              </div>

              <div className="grid gap-1 text-sm">
                <label htmlFor={initialId} className="font-medium">First payment deadline (Manila time)</label>
                <Input
                  id={initialId}
                  aria-describedby={initialValidationMessage ? initialHintId : undefined}
                  aria-invalid={Boolean(initialValidationMessage)}
                  type="datetime-local"
                  max={cutoffInputMax || undefined}
                  value={initial}
                  onChange={(event) => setInitial(event.target.value)}
                  required
                  disabled={busy}
                />
                {initialValidationMessage ? (
                  <p id={initialHintId} role="alert" className="text-xs text-destructive">{initialValidationMessage}</p>
                ) : null}
              </div>

              <div className="grid gap-1 text-sm">
                <label htmlFor={balanceId} className="font-medium">Remaining balance due (Manila time)</label>
                <Input
                  id={balanceId}
                  aria-describedby={balanceValidationMessage || cutoffFormatted ? balanceHintId : undefined}
                  aria-invalid={Boolean(balanceValidationMessage)}
                  type="datetime-local"
                  min={initial || undefined}
                  max={cutoffInputMax || undefined}
                  value={balance}
                  onChange={(event) => setBalance(event.target.value)}
                  required
                  disabled={busy}
                />
                {balanceValidationMessage ? (
                  <p id={balanceHintId} role="alert" className="text-xs text-destructive">{balanceValidationMessage}</p>
                ) : cutoffFormatted ? (
                  <p id={balanceHintId} className="text-xs text-muted-foreground">
                    Latest allowed: {cutoffFormatted} (48 hours before the event).
                  </p>
                ) : null}
              </div>

              <p className="text-xs leading-5 text-muted-foreground">
                Leave at least ₱1.00 for each payment. The customer must accept these terms and pay through FEASTA before the booking is confirmed.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!valid || disabled || busy}
                  loading={busyAction === "offer"}
                  loadingLabel="Sending offer…"
                >
                  Send payment offer
                </Button>
              </div>
            </form>
          ) : (
            <div data-print-hidden="" className="flex flex-wrap gap-2 print:hidden">
              <Button type="button" variant="secondary" disabled={busy || disabled} onClick={openEditor}>
                {offered ? "Replace offer" : "Offer arranged payment"}
              </Button>
              {offered && offer ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || disabled}
                  loading={busyAction === "withdraw"}
                  loadingLabel="Withdrawing…"
                  onClick={() => void save("withdraw", {action: "withdrawArrangement", offerId: offer.id})}
                >
                  Withdraw offer
                </Button>
              ) : null}
            </div>
          )}
        </>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
