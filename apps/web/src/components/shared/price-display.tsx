import {cn} from "@/lib/utils";

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function PriceDisplay({
  amount,
  originalPrice,
  discountPercent,
  suffix,
  unknownLabel = "Price unavailable",
  className,
}: {
  amount?: number | null;
  originalPrice?: number | null;
  discountPercent?: number | null;
  suffix?: string;
  unknownLabel?: string;
  className?: string;
}) {
  if (amount == null || !Number.isFinite(amount) || amount < 0) {
    return <span className={cn("text-sm text-muted-foreground", className)}>{unknownLabel}</span>;
  }
  const current = phpFormatter.format(amount);
  const hasOriginal = originalPrice != null && Number.isFinite(originalPrice) && originalPrice > amount;
  const semantics = [
    `Price: ${current}`,
    suffix,
    hasOriginal ? `originally ${phpFormatter.format(originalPrice)}` : undefined,
    discountPercent && discountPercent > 0 ? `${discountPercent}% discount` : undefined,
  ].filter(Boolean).join(", ");
  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1", className)} aria-label={semantics}>
      <span className="break-all text-xl font-bold text-primary-strong" aria-hidden="true">{current}</span>
      {hasOriginal ? <del className="text-sm text-muted-foreground" aria-hidden="true">{phpFormatter.format(originalPrice)}</del> : null}
      {discountPercent && discountPercent > 0 ? (
        <span className="rounded-pill bg-success-subtle px-2 py-0.5 text-sm font-bold text-success" aria-hidden="true">{discountPercent}% off</span>
      ) : null}
      {suffix ? <span className="text-sm text-muted-foreground" aria-hidden="true">{suffix}</span> : null}
    </span>
  );
}

export {PriceDisplay, phpFormatter};
