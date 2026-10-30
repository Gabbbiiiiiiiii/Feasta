"use client";

import {useEffect, useId} from "react";
import {Check, Crown, Palette, UtensilsCrossed} from "lucide-react";

import {VisualStyleImageCarousel} from "@/components/customer/packages/visual-style-image-carousel";
import {PriceDisplay} from "@/components/shared/price-display";
import {Textarea} from "@/components/ui/textarea";
import {
  cateringPackageServiceTierDescription,
  cateringPackageServiceTierLabel,
  type CateringPackageServiceTier,
} from "@/lib/catering/catering-service-tier";
import type {PackageServiceOptions, PackageThemeOption} from "@/lib/catering/package-offer-configuration";
import type {BookingThemeInspiration} from "@/lib/customer/bookings/booking-customization-selection";
import {
  PROVIDER_SETUP_EVENT_TYPE_LABELS,
  type ProviderSetup,
} from "@/lib/provider/provider-setup-gallery";

export function BookingOfferSelection({
  availableTiers,
  serviceOptions,
  pricingModel,
  themesApplicable,
  hasThemeOptions,
  serviceTier,
  packageThemeId,
  availableThemes,
  themeInspiration,
  publishedSetups,
  error,
  onServiceTierChange,
  onPackageThemeChange,
  onThemeInspirationChange,
}: {
  availableTiers: readonly CateringPackageServiceTier[];
  serviceOptions: PackageServiceOptions | undefined;
  pricingModel?: "per_pax" | "per_bundle";
  themesApplicable: boolean;
  hasThemeOptions: boolean;
  serviceTier: CateringPackageServiceTier | null;
  packageThemeId: string | null;
  availableThemes: readonly PackageThemeOption[];
  themeInspiration: BookingThemeInspiration;
  publishedSetups?: readonly ProviderSetup[];
  error: string | null;
  onServiceTierChange: (tier: CateringPackageServiceTier) => void;
  onPackageThemeChange: (themeId: string | null) => void;
  onThemeInspirationChange: (value: BookingThemeInspiration) => void;
}) {
  const errorId = useId();
  // Decoration only: never infer a premium rank from incomplete prices.
  const pricedTiers = availableTiers.flatMap((tier) => {
    const price = serviceOptions?.[tier]?.price;
    return typeof price === "number" && Number.isFinite(price) && price >= 0
      ? [{tier, price}]
      : [];
  });
  const highestPrice = Math.max(...pricedTiers.map(({price}) => price));
  const highestTiers = pricedTiers.filter(({price}) => price === highestPrice);
  const premiumTier = pricedTiers.length === availableTiers.length && highestTiers.length === 1
    ? highestTiers[0]?.tier ?? null
    : null;
  useEffect(() => {
    if (!publishedSetups || !themeInspiration.referenceSetupId) return;
    if (publishedSetups.some((setup) => setup.id === themeInspiration.referenceSetupId)) return;
    onThemeInspirationChange({...themeInspiration, referenceSetupId: null});
  }, [onThemeInspirationChange, publishedSetups, themeInspiration]);

  return (
    <div className="grid min-w-0 gap-5 [overflow-wrap:anywhere]">
      <section aria-labelledby={availableTiers.length > 0 ? "service-tier-title" : undefined}>
        {availableTiers.length === 0 ? (
          <p className="text-sm leading-6 text-feasta-text-secondary">
            This package does not publish separate catering service levels. You can continue with the published package.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <UtensilsCrossed aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <h3 id="service-tier-title" className="text-base font-extrabold text-foreground">Service level</h3>
              <span className="text-xs font-semibold text-feasta-text-secondary">Required</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
              Choose one. Prices and inclusions are published by the provider; the final booking amount is confirmed later.
            </p>
            <div role="radiogroup" aria-labelledby="service-tier-title" aria-required="true"
              aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
              className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
              {availableTiers.map((tier) => {
                const option = serviceOptions?.[tier];
                const tierInclusions = [...new Set([...(option?.includedServices ?? []), ...(option?.decorInclusions ?? []), ...(option?.furnitureInclusions ?? []), ...(option?.equipmentInclusions ?? [])])];
                const selected = serviceTier === tier;
                const premium = premiumTier === tier;
                const tierId = `${errorId}-${tier}`;
                return (
                  <label key={tier} className={[
                    "flex min-w-0 cursor-pointer flex-col rounded-[18px] border p-4 transition-[border-color,background-color,box-shadow] focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
                    premium
                      ? "relative isolate bg-linear-to-br from-white/95 to-feasta-surface-muted/85 backdrop-blur-sm shadow-[inset_0_1px_0_rgb(255_255_255/0.95),0_9px_26px_rgb(9_59_38/0.105)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-24 before:rounded-t-[17px] before:bg-linear-to-br before:from-white/90 before:via-white/40 before:to-transparent after:pointer-events-none after:absolute after:inset-x-2 after:top-px after:h-px after:bg-linear-to-r after:from-transparent after:via-white after:to-transparent"
                      : "",
                    premium
                      ? selected
                        ? "border-primary via-primary-tint-strong/70"
                        : "border-primary/50 via-primary-tint/75 hover:border-primary/70"
                      : selected
                        ? "border-primary bg-secondary/50 ring-1 ring-primary/20"
                        : "border-feasta-border-soft bg-feasta-canvas hover:border-primary/40",
                  ].join(" ")}>
                    <input type="radio" name="catering-service-tier" value={tier}
                      aria-label={cateringPackageServiceTierLabel(tier)} checked={selected}
                      aria-describedby={`${premium ? `${tierId}-premium ` : ""}${tierId}-description${option ? ` ${tierId}-price` : ""}${option?.includedServices.length ? ` ${tierId}-inclusions` : ""}`}
                      onChange={() => onServiceTierChange(tier)} className="sr-only" />
                    <span className="flex min-h-6 flex-wrap items-center justify-between gap-2">
                      <SelectionIndicator selected={selected} />
                      {premium ? <span id={`${tierId}-premium`} className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-white/85 px-2 py-1 text-[10px] font-extrabold leading-4 text-primary-strong shadow-[inset_0_1px_0_rgb(255_255_255/0.95),0_1px_4px_rgb(9_59_38/0.1)] backdrop-blur-sm">
                        <Crown aria-hidden="true" className="size-3 shrink-0" />
                        Premium Tier
                      </span> : null}
                    </span>
                    <span className="mt-2 block text-base font-extrabold text-foreground">{cateringPackageServiceTierLabel(tier)}</span>
                    <span id={`${tierId}-description`} className="mt-1 block text-xs leading-5 text-feasta-text-secondary">{cateringPackageServiceTierDescription(tier)}</span>
                    {option ? <span id={`${tierId}-price`} className="mt-3 block border-t border-feasta-divider pt-3">
                      <PriceDisplay amount={option.price} />
                    </span> : null}
                    {pricingModel ? <span className="text-xs">{pricingModel === "per_pax" ? "per guest" : "fixed bundle"}</span> : null}
                    {tierInclusions.length > 0 ? (
                      <ul id={`${tierId}-inclusions`} className="mt-3 grid gap-1.5">
                        {tierInclusions.map((service) => <li key={service} className="flex min-w-0 items-start gap-2 text-xs leading-5 text-feasta-text-secondary">
                          <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          <span>{service}</span>
                        </li>)}
                      </ul>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </>
        )}
        {error ? <p id={errorId} role="alert" className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
      </section>

      {hasThemeOptions ? (
        <section
          aria-labelledby="visual-style-title"
          className="min-w-0 border-t border-feasta-divider pt-5"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
              <Palette aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                Visual style
              </p>
              <h3 id="visual-style-title" className="mt-1 text-lg font-extrabold text-foreground">
                Theme inspiration
              </h3>
              <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                Visual styles apply to Buffet Setup and Full-Service Catering. They do not add a separate charge.
              </p>
            </div>
          </div>

          {serviceTier === "drop_off" ? (
            <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">
              Visual style selection is not used for Drop-Off Catering.
            </p>
          ) : themesApplicable ? (
            <>
              <div
                role="radiogroup"
                aria-labelledby="visual-style-title"
                className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3"
              >
                <label className={[
                  "block min-w-0 cursor-pointer rounded-[18px] border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
                  packageThemeId === null
                    ? "border-primary bg-secondary/50 ring-2 ring-primary/15"
                    : "border-feasta-border-soft bg-feasta-canvas",
                ].join(" ")}>
                  <input
                    type="radio"
                    name="package-theme"
                    value=""
                    checked={packageThemeId === null}
                    onChange={() => onPackageThemeChange(null)}
                    className="sr-only"
                  />
                  <SelectionIndicator selected={packageThemeId === null} />
                  <span className="mt-2 block text-base font-extrabold text-foreground">No visual style</span>
                  <span className="mt-1 block text-sm leading-6 text-feasta-text-secondary">
                    A visual style is optional for this service level.
                  </span>
                </label>
                {availableThemes.map((theme) => {
                  const selected = packageThemeId === theme.id;
                  return (
                    <article
                      key={theme.id}
                      className={[
                        "min-w-0 overflow-hidden rounded-[18px] border transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
                        selected
                          ? "border-primary bg-secondary/50 ring-2 ring-primary/15"
                          : "border-feasta-border-soft bg-feasta-canvas",
                      ].join(" ")}
                    >
                      <VisualStyleImageCarousel
                        imageUrls={theme.imageUrls}
                        styleName={theme.name}
                      />
                      <label className="block cursor-pointer p-4">
                        <input
                          type="radio"
                          name="package-theme"
                          value={theme.id}
                          checked={selected}
                          onChange={() => onPackageThemeChange(theme.id)}
                          className="sr-only"
                        />
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0 break-words text-base font-extrabold text-foreground">
                            {theme.name}
                          </span>
                          <SelectionIndicator selected={selected} />
                        </span>
                        <span className="mt-2 block break-words text-sm leading-6 text-feasta-text-secondary">
                          {theme.description || "Visual style from this provider."}
                        </span>
                      </label>
                    </article>
                  );
                })}
              </div>
              <div className="mt-5">
                <label htmlFor="theme-inspiration-notes" className="text-sm font-bold text-foreground">
                  Visual notes
                </label>
                <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                  Saved on this device only, not sent to providers. These notes do not change the package price.
                </p>
                <Textarea
                  id="theme-inspiration-notes"
                  value={themeInspiration.notes}
                  maxLength={1000}
                  onChange={(event) => onThemeInspirationChange({
                    ...themeInspiration,
                    notes: event.currentTarget.value,
                  })}
                  rows={3}
                  className="mt-2 min-h-24"
                />
                {publishedSetups ? (
                  <fieldset className="mt-5">
                    <legend className="text-sm font-bold text-foreground">Setup inspiration</legend>
                    <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                      Choose a published setup as a visual reference. This stays on this device and does not change the package price.
                    </p>
                    {publishedSetups.length === 0 ? (
                      <p className="mt-3 text-sm text-feasta-text-secondary">This provider has no published setups yet.</p>
                    ) : (
                      <div className="mt-3 grid gap-3">
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[14px] border border-feasta-border-soft bg-feasta-canvas px-3 py-2">
                          <input
                            type="radio"
                            name="reference-setup"
                            checked={themeInspiration.referenceSetupId === null}
                            onChange={() => onThemeInspirationChange({...themeInspiration, referenceSetupId: null})}
                          />
                          <span className="text-sm font-bold text-foreground">No setup inspiration</span>
                        </label>
                        {publishedSetups.map((setup) => (
                          <label key={setup.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[14px] border border-feasta-border-soft bg-white px-3 py-2">
                            <input
                              type="radio"
                              name="reference-setup"
                              value={setup.id}
                              checked={themeInspiration.referenceSetupId === setup.id}
                              onChange={() => onThemeInspirationChange({...themeInspiration, referenceSetupId: setup.id})}
                            />
                            {setup.imageUrls[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={setup.imageUrls[0]} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                            ) : (
                              <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-dashed border-feasta-border-strong px-1 text-center text-[10px] font-semibold text-feasta-text-secondary">No photo</span>
                            )}
                            <span className="min-w-0">
                              <span className="block break-words text-sm font-bold text-foreground">{setup.title}</span>
                              <span className="block text-xs text-feasta-text-secondary">{PROVIDER_SETUP_EVENT_TYPE_LABELS[setup.eventType]}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                ) : themeInspiration.referenceSetupId ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-[14px] border border-feasta-border-soft bg-feasta-canvas p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-feasta-text-secondary">
                      Saved setup reference <span className="font-bold text-foreground">{themeInspiration.referenceSetupId}</span> is stored on this device only.
                    </p>
                    <button
                      type="button"
                      onClick={() => onThemeInspirationChange({
                        ...themeInspiration,
                        referenceSetupId: null,
                      })}
                      className="min-h-11 rounded-full px-3 text-sm font-bold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Clear setup reference
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">
              Choose Buffet Setup or Full-Service Catering to see this package&apos;s visual styles.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function SelectionIndicator({selected}: {selected: boolean}) {
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-primary-strong">
    <span className={[
      "grid size-5 shrink-0 place-items-center rounded-full border",
      selected ? "border-primary bg-primary text-primary-foreground" : "border-feasta-border-strong bg-white",
    ].join(" ")}>
      {selected ? <Check className="size-3.5" /> : null}
    </span>
    {selected ? "Selected" : "Select"}
  </span>;
}
