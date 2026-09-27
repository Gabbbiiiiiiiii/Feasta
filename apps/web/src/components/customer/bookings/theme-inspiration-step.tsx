"use client";

import {Check, Palette} from "lucide-react";

import {Button} from "@/components/ui/button";
import {VisualStyleImageCarousel} from "@/components/customer/packages/visual-style-image-carousel";
import type {CustomerThemePreferenceDraft} from "@/lib/customer/bookings/customer-theme-preference";
import type {PackageThemeOption} from "@/lib/catering/package-offer-configuration";

type CateringServiceTier = "drop_off" | "buffet_setup" | "full_service";

export function ThemeInspirationStep({themes, serviceTier, selectedThemeId, onThemeChange, value, onChange, onBack, onContinue}: {
  themes: readonly PackageThemeOption[];
  serviceTier: CateringServiceTier | null;
  selectedThemeId: string | null;
  onThemeChange: (themeId: string | null) => void;
  value: CustomerThemePreferenceDraft;
  onChange: (value: CustomerThemePreferenceDraft) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const setupBased = serviceTier === "buffet_setup" || serviceTier === "full_service";
  const styleRequired = setupBased && themes.length > 0;
  const selectedStyle = selectedThemeId ? themes.find((style) => style.id === selectedThemeId) ?? null : null;
  const canContinue = !styleRequired || selectedStyle !== null;

  function selectStyle(style: PackageThemeOption) {
    onThemeChange(style.id);
    onChange({...value, mode: "preset", themeName: style.name, description: style.description, referenceSetupId: null});
  }

  return (
    <section aria-labelledby="visual-style-title" className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7">
      <div className="max-w-3xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">Step 3 of 5</p>
        <h2 id="visual-style-title" className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl">Visual style</h2>
        <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">Choose the visual style you want for setup-based catering. Each option includes provider reference photos showing different angles of the tables, buffet setup, and decor.</p>
      </div>

      <div className="mt-7">
        <section className="rounded-[20px] border border-feasta-border-soft p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong"><Palette aria-hidden="true" className="size-5" /></span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">Visual styles</p>
              <h3 className="mt-1 text-lg font-extrabold text-foreground">Choose the setup look included with your service level.</h3>
              <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">Visual styles do not add a separate charge.</p>
            </div>
          </div>

          {serviceTier === "drop_off" ? (
            <div className="mt-5 rounded-[16px] border border-dashed border-feasta-border-strong bg-feasta-canvas p-5">
              <p className="text-sm font-extrabold text-foreground">Visual style selection is not needed for Drop-Off Catering.</p>
              <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">Drop-Off Catering does not include setup-based styling.</p>
            </div>
          ) : setupBased && themes.length > 0 ? (
            <>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {themes.map((style) => {
                  const selected = selectedThemeId === style.id;
                  return (
                    <article key={style.id} className={["overflow-hidden rounded-[20px] border transition", selected ? "border-primary bg-secondary/50 ring-2 ring-primary/15" : "border-feasta-border-soft bg-feasta-canvas hover:border-primary/30"].join(" ")}>
                      <VisualStyleImageCarousel imageUrls={style.imageUrls} styleName={style.name} />
                      <button type="button" aria-pressed={selected} onClick={() => selectStyle(style)} className="block w-full p-5 text-left">
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0 break-words text-base font-extrabold text-foreground">{style.name}</span>
                          <span className={["inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.07em]", selected ? "bg-primary text-primary-foreground" : "bg-secondary text-primary-strong"].join(" ")}>
                            {selected ? <Check aria-hidden="true" className="size-3" /> : null}
                            {selected ? "Selected" : "Included"}
                          </span>
                        </span>
                        <span className="mt-3 block break-words text-sm leading-6 text-feasta-text-secondary">{style.description || "Visual style from this provider."}</span>
                        <span className="mt-3 block text-xs font-semibold text-feasta-text-tertiary">{style.imageUrls.length} reference {style.imageUrls.length === 1 ? "photo" : "photos"}</span>
                      </button>
                    </article>
                  );
                })}
              </div>
              {selectedStyle === null ? (
                <p className="mt-4 text-xs font-semibold text-warning">Choose one included visual style to continue.</p>
              ) : (
                <p className="mt-4 rounded-[14px] border border-feasta-border-soft bg-secondary/40 px-4 py-3 text-xs font-semibold text-primary-strong">{selectedStyle.name} is included with your selected catering service level.</p>
              )}
            </>
          ) : (
            <div className="mt-5 rounded-[16px] border border-dashed border-feasta-border-strong bg-feasta-canvas p-5">
              <p className="text-sm font-extrabold text-foreground">No visual styles are currently published.</p>
              <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">You can continue without choosing a visual style.</p>
            </div>
          )}
        </section>
      </div>

      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-feasta-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="secondary" onClick={onBack} className="min-h-12 rounded-full px-5">Back</Button>
        <Button type="button" disabled={!canContinue} onClick={onContinue} className="min-h-12 rounded-full px-5">Continue to service customization</Button>
      </div>
    </section>
  );
}
