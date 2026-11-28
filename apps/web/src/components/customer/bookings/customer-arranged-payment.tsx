"use client";

import {useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {ArrangedPaymentTerms} from "@/components/shared/arranged-payment-terms";
import type {ArrangedPaymentView} from "@/lib/payments/arranged-payment-view";
import {respondToArrangedPayment} from "@/lib/payments/arranged-payment-client";

export function CustomerArrangedPayment({offer, requestId, pendingRequest, onChange}: {
  offer: ArrangedPaymentView;
  requestId: string;
  pendingRequest: boolean;
  onChange?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const [response, setResponse] = useState<"accepted" | "declined" | null>(null);
  const [busyAction, setBusyAction] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");
  const [renderedAt] = useState(() => Date.now());
  const status = response ?? offer.status;
  const active = status === "offered" && pendingRequest && Date.parse(offer.initialDueAt) > renderedAt;
  const busy = busyAction !== null;

  if (!active && status !== "accepted" && !response) return null;

  async function respond(accept: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusyAction(accept ? "accept" : "decline");
    setError("");
    try {
      await respondToArrangedPayment(requestId, {
        action: accept ? "acceptArrangement" : "declineArrangement",
        offerId: offer.id,
      });
      setResponse(accept ? "accepted" : "declined");
      if (onChange) await onChange();
      else router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to respond to this payment offer.");
    } finally {
      pending.current = false;
      setBusyAction(null);
    }
  }

  return (
    <section
      className="grid gap-3 rounded-xl border border-primary/25 bg-primary-tint/30 p-4"
      aria-label="Arranged payment offer"
    >
      <h3 className="text-sm font-bold">
        {status === "accepted"
          ? "Arranged payment accepted"
          : status === "declined"
            ? "Arranged payment declined"
            : "Arranged payment offer"}
      </h3>
      {status !== "declined" ? <ArrangedPaymentTerms offer={offer} /> : (
        <p className="text-xs leading-5 text-muted-foreground">
          You declined this offer. Your booking request remains pending with the caterer.
        </p>
      )}
      {active ? (
        <>
          <p className="text-xs leading-5 text-muted-foreground">
            Accepting locks in these payment terms so you can pay through FEASTA. Your booking is confirmed once the first payment clears. Standard cancellation terms still apply.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              loading={busyAction === "decline"}
              loadingLabel="Declining…"
              onClick={() => void respond(false)}
            >
              Decline offer
            </Button>
            <Button
              type="button"
              disabled={busy}
              loading={busyAction === "accept"}
              loadingLabel="Accepting…"
              onClick={() => void respond(true)}
            >
              Accept payment terms
            </Button>
          </div>
        </>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
