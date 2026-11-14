import {packageV2PublicationEnabled} from "@/lib/provider/provider-package-v2-client";
import {ProviderPackageDetailPreview} from "./provider-package-detail-preview";
import {PackagePaymentTerms} from "@/components/shared/package-payment-terms";
import {Archive, Edit3, Eye, Send, Users} from "lucide-react";
import {Button} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {ImagePlaceholder} from "@/components/shared/image-placeholder";
import {PriceDisplay} from "@/components/shared/price-display";
import {StatusBadge, humanize} from "@/components/shared/status-badge";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";
import {ProviderPackageRecovery} from "./provider-package-recovery";

export function ProviderPackageCard({item, serviceCategoryLabel, onEdit, onPublish, onArchive, onRecovered}: {
  item: ProviderPackage;
  serviceCategoryLabel?: string;
  onEdit: React.MouseEventHandler<HTMLButtonElement>;
  onPublish: () => void;
  onArchive: () => void;
  onRecovered?: () => void | Promise<void>;
}) {
  const cover = item.imageUrls?.[0] || item.imageUrl;
  const individual = (item.offerStructure ?? item.v2?.offerStructure) === "individual";
  const publicationBlocked = individual || (item.v2 ?
    item.v2.publicationReady !== true || !packageV2PublicationEnabled : Boolean(item.pricingModel));
  return <article aria-label={item.name} className="flex min-w-0 flex-col self-start overflow-hidden rounded-card border border-border bg-card shadow-card sm:flex-row">
    <div className="relative h-28 shrink-0 overflow-hidden bg-muted sm:h-auto sm:w-28">
      {cover ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt={item.name} loading="lazy" className="absolute inset-0 size-full object-contain" />
      </> : <ImagePlaceholder className="h-full min-h-0 rounded-none" label="No package image" />}

    </div>
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="grid content-start gap-1 p-2.5">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h2 className="min-w-0 line-clamp-1 break-words text-sm font-bold sm:text-base" title={item.name}>{item.name}</h2>
        <StatusBadge status={item.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold uppercase text-primary-strong">{item.v2?.occasionScope === "all" ? "Fits All Occasions" : item.v2 ? item.v2.occasionIds.map(humanize).join(", ") : humanize(item.eventType)}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Users aria-hidden="true" className="size-3.5 shrink-0" />{item.minimumGuests}–{item.maximumGuests} guests</p>
      </div>
      <PriceDisplay amount={item.price} />
      {item.pricingModel ? <p className="text-xs text-muted-foreground">{item.pricingModel === "per_pax" ? "PHP per person" : "Fixed package price"}</p> : null}
      {individual ? <p className="text-xs text-muted-foreground">Individual Food publication requires a supported serving-price contract.</p> : !item.v2 && item.pricingModel ? <p className="text-xs text-muted-foreground">This draft has no saved V2 contract. Edit to review and retain its details. Conversion requires a reviewed recovery; saving this draft does not upgrade it. Keep the original until recovery is approved.</p> : null}
      {item.status === "draft" && item.v2 && !individual && item.v2.publicationReady !== true ? <p className="text-xs text-muted-foreground">Edit and save a complete V2 contract before publishing.</p> : null}
      <PackagePaymentTerms source={item} />
    </div>
    {item.status !== "archived" ? <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-border p-1.5">
      {item.status === "draft" ? <>
        <Button id={`provider-package-edit-${item.id}`} variant="secondary" size="compact" className="mr-auto" aria-label={`Edit ${item.name}`} onClick={onEdit}><Edit3 aria-hidden="true" className="size-4" />Edit</Button>
        {!item.v2 && item.offerStructure === "fixed" && item.pricingModel ? <ProviderPackageRecovery packageId={item.id} onRecovered={onRecovered}/> : null}
        <Button variant="ghost" size="icon" aria-label={`Publish ${item.name}`} title={individual ? "Individual Food publication is unsupported" : !item.v2 && item.pricingModel ? "Review V2 recovery before publishing" : "Publish package"} disabled={publicationBlocked} onClick={onPublish}><Send aria-hidden="true" className="size-4" /></Button>
      </> : null}
      {item.status === "published" ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary" size="compact" aria-label={`View ${item.name}`}>
              <Eye aria-hidden="true" className="size-4" />
              View
            </Button>
          </DialogTrigger>
          <DialogContent className="flex max-h-[88dvh] min-w-0 max-w-4xl flex-col gap-0 overflow-hidden p-0">
            <ProviderPackageDetailPreview item={item} serviceCategoryLabel={serviceCategoryLabel} />
          </DialogContent>
        </Dialog>
      ) : null}
      <Button variant="ghost" size="icon" aria-label={`Archive ${item.name}`} title="Archive package" onClick={onArchive}><Archive aria-hidden="true" className="size-4" /></Button>
    </div> : null}
    </div>
  </article>;
}
