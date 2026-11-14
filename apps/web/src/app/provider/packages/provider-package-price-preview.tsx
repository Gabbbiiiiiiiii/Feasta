"use client";

import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {cateringPackageServiceTierLabel, type CateringPackageServiceTier} from "@/lib/catering/catering-service-tier";
import {formatPackageCentavos, packageMoneyCentavos, packagePreviewSubtotal} from "@/lib/provider/package-pricing-preview";
import type {ProviderPackageOfferDraft} from "./provider-package-offer-builder";

export function ProviderPackagePricePreview({name, pricingModel, minimumGuests, maximumGuests, guestCount,
  onGuestCountChange, validatedGuestCount, selectedTier, onTierChange, offerDraft}: {
  name: string; pricingModel: "per_pax" | "per_bundle" | "legacy";
  minimumGuests: string; maximumGuests: string; guestCount: string;
  onGuestCountChange: (value: string) => void; validatedGuestCount: number | null;
  selectedTier: string; onTierChange: (value: string) => void; offerDraft: ProviderPackageOfferDraft;
}) {
  const enabled = Object.entries(offerDraft.serviceOptions).filter(([, option]) => option.enabled);
  const activeTier = enabled.find(([tier]) => tier === selectedTier);
  const option = activeTier?.[1];
  const subtotal = option ? packagePreviewSubtotal({pricingModel, unitPrice: option.price,
    guestCount: validatedGuestCount, priceError: option.inputError}) : null;
  const unitCents = option ? packageMoneyCentavos(option.price) : null;
  return (
    <aside aria-label="Live package summary" className="grid gap-3 rounded-xl border bg-card p-3 text-sm">
      <div><strong className="break-words">{name || "Untitled package"}</strong>
        <p className="text-xs text-muted-foreground">{pricingModel === "per_pax" ? "Prices are charged per person." : "One fixed price covers the package's guest range."}</p>
        <p className="text-xs text-muted-foreground">Capacity: {minimumGuests || "—"}–{maximumGuests || "—"} guests</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1 text-xs font-semibold">Preview service tier
          <Select value={activeTier?.[0] ?? ""} onChange={(event) => onTierChange(event.target.value)}>
            <option value="">Choose a service tier</option>
            {enabled.map(([tier]) => <option key={tier} value={tier}>{cateringPackageServiceTierLabel(tier as CateringPackageServiceTier)}</option>)}
          </Select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold">Preview guest count
          <Input type="text" inputMode="numeric" value={guestCount} aria-invalid={guestCount !== "" && validatedGuestCount === null}
            onChange={(event) => onGuestCountChange(event.target.value)} />
        </label>
      </div>
      {guestCount !== "" && validatedGuestCount === null ? <p role="alert" className="text-xs text-destructive">Enter a whole guest count within the valid package capacity.</p> : null}
      {subtotal === null || unitCents === null ? <p className="text-muted-foreground">Enter a price and guest count to preview the total.</p> : (
        <p role="status" aria-live="polite" className="font-semibold">
          {formatPackageCentavos(unitCents)}{pricingModel === "per_pax" ? " × " + validatedGuestCount + " guests" : " fixed package"}
          {" = "}{formatPackageCentavos(subtotal)} estimated subtotal
        </p>
      )}
    </aside>
  );
}
