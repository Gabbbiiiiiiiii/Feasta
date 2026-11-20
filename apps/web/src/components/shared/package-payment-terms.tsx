"use client";

import {CircleDollarSign} from "lucide-react";
import {useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";

type PackagePaymentTermsSource = {
  paymentPolicy?: "full_payment" | "deposit_then_balance" | null;
  depositPercentage?: number | null;
  balanceDueDaysBeforeEvent?: number | null;
};

type PaymentTermsModel = {
  deposit: boolean;
  timing: string;
  depositDetail: string;
};

function paymentTermsModel(source: PackagePaymentTermsSource): PaymentTermsModel | null {
  const deposit = source.paymentPolicy === "deposit_then_balance";
  if (!deposit && source.paymentPolicy !== "full_payment") return null;
  const days = source.balanceDueDaysBeforeEvent;
  return {
    deposit,
    timing: days != null && days !== 1 ? String(days) + " days" : "24 hours",
    depositDetail: source.depositPercentage != null
      ? "Pay " + String(source.depositPercentage) + "% first, then the remaining balance"
      : "Pay a deposit first, then the remaining balance",
  };
}

function PaymentTermsDetails({model}: {model: PaymentTermsModel}) {
  if (!model.deposit) {
    return <p className="text-muted-foreground">100% due after booking acceptance</p>;
  }
  return (
    <dl className="grid gap-1.5 text-muted-foreground">
      <div className="grid gap-0.5">
        <dt className="font-semibold text-foreground">Deposit</dt>
        <dd className="leading-5">{model.depositDetail}</dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="font-semibold text-foreground">Balance due</dt>
        <dd className="leading-5">Remaining balance is due {model.timing} before the event</dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="font-semibold text-foreground">Short notice</dt>
        <dd className="leading-5">Under 72 hours: full payment required</dd>
      </div>
    </dl>
  );
}

/** Normal package terms, independent of a booking's checkout eligibility. Version 2 uses the canonical 24-hour deadline. */
export function PackagePaymentTerms({source}: {source: PackagePaymentTermsSource}) {
  const model = paymentTermsModel(source);
  if (!model) return null;

  return (
    <div
      className="grid gap-2 rounded-xl border border-primary/15 bg-secondary p-3 text-xs"
      aria-label="Payment terms"
    >
      <span className="w-fit rounded-full border border-border bg-white px-2.5 py-1 font-semibold text-primary-strong">
        {model.deposit ? "Deposit + balance" : "Full payment"}
      </span>
      <PaymentTermsDetails model={model} />
    </div>
  );
}

/** Compact marketplace-card hint: policy chip + payment-info control with portal popover above the card. */
export function PackagePaymentTermsCardHint({source}: {source: PackagePaymentTermsSource}) {
  const model = paymentTermsModel(source);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoverOpenRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cancelClose = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      hoverOpenRef.current = false;
      setOpen(false);
    }, 140);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hoverOpenRef.current = false;
        setOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      hoverOpenRef.current = false;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !panelRef.current) return;
    const panel = panelRef.current;
    const reposition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 24);
      const height = panel.offsetHeight || 0;
      let left = rect.right - width;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      let top = rect.top - height - 10;
      if (top < 12) top = Math.min(rect.bottom + 10, window.innerHeight - height - 12);
      panel.style.width = `${width}px`;
      panel.style.left = `${left}px`;
      panel.style.top = `${Math.max(12, top)}px`;
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  if (!model) return null;

  return (
    <div
      ref={rootRef}
      className="relative z-10 mt-2 flex max-w-full flex-wrap items-center gap-2"
      onMouseEnter={() => {
        cancelClose();
        hoverOpenRef.current = true;
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <span className="inline-flex h-6 w-fit items-center rounded-full border border-border bg-muted px-2.5 text-xs font-semibold leading-none text-primary-strong">
        {model.deposit ? "Deposit + balance" : "Full payment"}
      </span>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-transparent bg-primary px-2.5 text-xs font-semibold leading-none text-primary-foreground shadow-[0_4px_10px_rgba(9,59,38,0.18)] transition-[transform,filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98]"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          cancelClose();
          if (hoverOpenRef.current) return;
          setOpen((current) => !current);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <CircleDollarSign aria-hidden="true" className="size-3" />
        Payment info
      </button>
      {mounted && open
        ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Payment terms"
            className="fixed z-[120] rounded-xl border border-primary/15 bg-white p-3 text-xs shadow-[0_16px_36px_rgba(9,59,38,0.18)]"
            style={{top: 0, left: 0}}
            onMouseEnter={() => {
              cancelClose();
              hoverOpenRef.current = true;
            }}
            onMouseLeave={scheduleClose}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <PaymentTermsDetails model={model} />
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
