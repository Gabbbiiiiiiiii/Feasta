import {
  ArrowRight,
  CreditCard,
  Landmark,
  Wallet,
} from "lucide-react";

import {cn} from "@/lib/utils";

const FLOW_STAGES = [
  {
    title: "1. Customer payment",
    description:
      "Records what the customer paid and any completed refunds.",
    tag: "Checkout & refunds",
    Icon: CreditCard,
    iconBoxClass: "bg-primary-tint text-primary",
    accentBorderClass: "border-t-primary/40",
  },
  {
    title: "2. Provider earnings",
    description:
      "The provider’s share after commission and applicable withholding. Eligibility does not mean money was transferred.",
    tag: "Net after commission",
    Icon: Wallet,
    iconBoxClass: "bg-primary-tint-strong text-primary-strong",
    accentBorderClass: "border-t-primary/70",
  },
  {
    title: "3. Provider transfer",
    description:
      "Money is recorded as paid out only after the gateway confirms a matching transfer.",
    tag: "Gateway confirmed",
    Icon: Landmark,
    iconBoxClass: "bg-primary text-primary-foreground",
    accentBorderClass: "border-t-primary",
  },
] as const;

export function PaymentFlowOverview({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  return (
    <section
      aria-label="Understanding payments and payouts"
      className={cn(
        "min-w-0",
        embedded
          ? "pt-2"
          : "rounded-card border border-border bg-card p-5 shadow-card",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-link">
            Settlement lifecycle
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-primary-strong">
            Payments, earnings and transfers
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            A customer payment can be confirmed while the provider is still
            waiting to receive their earnings.
          </p>
        </div>
      </div>

      <ol className="mt-4 grid gap-4 md:grid-cols-3 md:gap-5">
        {FLOW_STAGES.map(
          (
            {
              title,
              description,
              tag,
              Icon,
              iconBoxClass,
              accentBorderClass,
            },
            index,
          ) => {
            const isLast = index === FLOW_STAGES.length - 1;

            return (
              <li
                key={title}
                className={cn(
                  "relative flex min-w-0 flex-col justify-between rounded-xl border border-border border-t-2 bg-card p-4 shadow-xs transition-colors duration-fast hover:border-primary/40",
                  accentBorderClass,
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl",
                      iconBoxClass,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <p className="min-w-0 text-sm font-bold leading-snug text-foreground">
                    {title}
                  </p>
                </div>

                <p className="mt-3 flex-1 text-xs leading-5 text-muted-foreground">
                  {description}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tag}
                  </span>
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-primary/50"
                  />
                </div>

                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-4 top-1/2 z-10 hidden size-7 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-primary shadow-xs md:grid"
                  >
                    <ArrowRight className="size-3.5" />
                  </span>
                ) : null}
              </li>
            );
          },
        )}
      </ol>
    </section>
  );
}
