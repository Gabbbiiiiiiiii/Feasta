"use client";

import {useEffect} from "react";
import {Check, Palette, UtensilsCrossed} from "lucide-react";

import {VisualStyleImageCarousel} from "@/components/customer/packages/visual-style-image-carousel";
import {PriceDisplay} from "@/components/shared/price-display";
import {Textarea} from "@/components/ui/textarea";
import {
  cateringPackageServiceTierDescription,
  cateringPackageServiceTierLabel,
  type CateringPackageServiceTier,
} from "@/lib/catering/catering-service-tier";
import type {PackageThemeOption} from "@/lib/catering/package-offer-configuration";
import type {BookingThemeInspiration} from "@/lib/customer/bookings/booking-customization-selection";
import {
  PROVIDER_SETUP_EVENT_TYPE_LABELS,
  type ProviderSetup,
} from "@/lib/provider/provider-setup-gallery";

export function BookingOfferSelection({
  availableTiers,
  serviceOptions,
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
  serviceOptions: Partial<Record<CateringPackageServiceTier, {price: number; includedServices: readonly string[]}>> | undefined;
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
  useEffect(() => {
    if (!publishedSetups || !themeInspiration.referenceSetupId) return;
    if (publishedSetups.some((setup) => setup.id === themeInspiration.referenceSetupId)) return;
    onThemeInspirationChange({...themeInspiration, referenceSetupId: null});
  }, [onThemeInspirationChange, publishedSetups, themeInspiration]);

  return (
    <div className="grid gap-6">
      <section
        aria-labelledby="service-tier-title"
        className="rounded-[20px] border border-feasta-border-soft p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
            <UtensilsCrossed aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Service level
            </p>
            <h3 id="service-tier-title" className="mt-1 text-lg font-extrabold text-foreground">
              Choose how this package is served
            </h3>
            <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
              Prices shown here are the provider&apos;s published amounts. FEASTA confirms the booking amount later.
            </p>
          </div>
        </div>

        {availableTiers.length === 0 ? (
          <p className="mt-5 rounded-[16px] border border-dashed border-feasta-border-strong bg-feasta-canvas p-5 text-sm leading-6 text-feasta-text-secondary">
            This package does not publish separate catering service levels. You can continue with the published package.
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-labelledby="service-tier-title"
            aria-invalid={error ? true : undefined}
            className="mt-5 grid gap-3"
          >
            {availableTiers.map((tier) => {
              const option = serviceOptions?.[tier];
              const selected = serviceTier === tier;
              return (
                <label
                  key={tier}
                  className={[
                    "block cursor-pointer rounded-[18px] border p-4 transition",
                    selected
                      ? "border-primary bg-secondary/50 ring-2 ring-primary/15"
                      : "border-feasta-border-soft bg-feasta-canvas hover:border-primary/30",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="catering-service-tier"
                    value={tier}
                    checked={selected}
                    onChange={() => onServiceTierChange(tier)}
                    className="sr-only"
                  />
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-base font-extrabold text-foreground">
                        {cateringPackageServiceTierLabel(tier)}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-feasta-text-secondary">
                        {cateringPackageServiceTierDescription(tier)}
                      </span>
                    </span>
                    <span className={[
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.07em]",
                      selected ? "bg-primary text-primary-foreground" : "bg-white text-feasta-text-secondary",
                    ].join(" ")}>
                      {selected ? <Check aria-hidden="true" className="size-3" /> : null}
                      {selected ? "Selected" : "Choose"}
                    </span>
                  </span>
                  {option ? (
                    <span className="mt-4 block border-t border-feasta-divider pt-3">
                      <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                        Displayed service price
                      </span>
                      <PriceDisplay amount={option.price} className="mt-1" />
                    </span>
                  ) : null}
                  {option && option.includedServices.length > 0 ? (
                    <ul className="mt-3 grid gap-1.5">
                      {option.includedServices.map((service) => (
                        <li key={service} className="text-sm text-feasta-text-secondary">
                          {service}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
      </section>

      {hasThemeOptions ? (
        <section
          aria-labelledby="visual-style-title"
          className="rounded-[20px] border border-feasta-border-soft p-4 sm:p-5"
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
            <p className="mt-5 rounded-[16px] border border-dashed border-feasta-border-strong bg-feasta-canvas p-5 text-sm leading-6 text-feasta-text-secondary">
              Visual style selection is not used for Drop-Off Catering.
            </p>
          ) : themesApplicable ? (
            <>
              <div
                role="radiogroup"
                aria-labelledby="visual-style-title"
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <label className={[
                  "block cursor-pointer rounded-[18px] border p-4",
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
                  <span className="block text-base font-extrabold text-foreground">No visual style</span>
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
                        "overflow-hidden rounded-[18px] border",
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
                          <span className={[
                            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.07em]",
                            selected ? "bg-primary text-primary-foreground" : "bg-white text-feasta-text-secondary",
                          ].join(" ")}>
                            {selected ? <Check aria-hidden="true" className="size-3" /> : null}
                            {selected ? "Selected" : "Optional"}
                          </span>
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
                  These notes stay in your booking draft on this device. They do not change the package price.
                </p>
                <Textarea
                  id="theme-inspiration-notes"
                  value={themeInspiration.notes}
                  maxLength={1000}
                  onChange={(event) => onThemeInspirationChange({
                    ...themeInspiration,
                    notes: event.currentTarget.value,
                  })}
                  className="mt-3 min-h-24"
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
            <p className="mt-5 rounded-[16px] border border-dashed border-feasta-border-strong bg-feasta-canvas p-5 text-sm leading-6 text-feasta-text-secondary">
              Choose Buffet Setup or Full-Service Catering to see this package&apos;s visual styles.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
