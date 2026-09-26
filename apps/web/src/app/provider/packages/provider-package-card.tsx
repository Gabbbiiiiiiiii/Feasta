import {Archive, Edit3, Send, Users} from "lucide-react";
import {Button} from "@/components/ui/button";
import {ImagePlaceholder} from "@/components/shared/image-placeholder";
import {PriceDisplay} from "@/components/shared/price-display";
import {StatusBadge, humanize} from "@/components/shared/status-badge";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";

export function ProviderPackageCard({item, onEdit, onPublish, onArchive}: {
  item: ProviderPackage;
  onEdit: React.MouseEventHandler<HTMLButtonElement>;
  onPublish: () => void;
  onArchive: () => void;
}) {
  const cover = item.imageUrls?.[0] || item.imageUrl;
  return <article aria-label={item.name} className="min-w-0 self-start overflow-hidden rounded-card border border-border bg-card shadow-card">
    <div className="relative h-48 overflow-hidden bg-muted">
      {cover ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt={item.name} loading="lazy" className="absolute inset-0 size-full object-contain" />
      </> : <ImagePlaceholder className="h-full min-h-0 rounded-none" label="No package image" />}
      <div className="absolute right-2 top-2"><StatusBadge status={item.status} /></div>
    </div>
    <div className="grid content-start gap-2 p-3">
      <h2 className="line-clamp-2 break-words text-base font-bold" title={item.name}>{item.name}</h2>
      <p className="text-xs font-semibold uppercase text-primary-strong">{humanize(item.eventType)}</p>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Users aria-hidden="true" className="size-4 shrink-0" />{item.minimumGuests}–{item.maximumGuests} guests</p>
      <PriceDisplay amount={item.price} />
      <p className="text-xs text-muted-foreground">
        {item.paymentPolicy ===
        "full_payment"
          ? "Full payment required"
          : item.paymentPolicy ===
            "deposit_then_balance"
            ? `${item.depositPercentage}% minimum payment · Balance due ${item.balanceDueDaysBeforeEvent} days before event`
            : `Legacy payment terms · ${item.downPaymentPercentage}% down payment`}
      </p>
    </div>
    {item.status !== "archived" ? <div className="flex flex-wrap items-center gap-1 border-t border-border p-2">
      {item.status === "draft" ? <>
        <Button id={`provider-package-edit-${item.id}`} variant="secondary" size="compact" className="mr-auto" aria-label={`Edit ${item.name}`} onClick={onEdit}><Edit3 aria-hidden="true" className="size-4" />Edit</Button>
        <Button variant="ghost" size="icon" aria-label={`Publish ${item.name}`} title="Publish package" onClick={onPublish}><Send aria-hidden="true" className="size-4" /></Button>
      </> : null}
      <Button variant="ghost" size="icon" aria-label={`Archive ${item.name}`} title="Archive package" onClick={onArchive}><Archive aria-hidden="true" className="size-4" /></Button>
    </div> : null}
  </article>;
}
