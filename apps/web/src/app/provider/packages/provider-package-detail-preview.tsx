"use client";

import type {ReactNode} from "react";
import {ImageGallery} from "@/components/customer/discovery/image-gallery";
import {PackagePaymentTerms} from "@/components/shared/package-payment-terms";
import {PriceDisplay} from "@/components/shared/price-display";
import {StatusBadge, humanize} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {DialogClose, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {CATERING_PACKAGE_SERVICE_TIERS, cateringPackageServiceTierDescription, cateringPackageServiceTierLabel} from "@/lib/catering/catering-service-tier";
import {packageStartingPrice} from "@/lib/catering/package-offer-configuration";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";

export function ProviderPackageDetailPreview({item, serviceCategoryLabel}: {
  item: ProviderPackage;
  serviceCategoryLabel?: string;
}) {
  const images = item.imageUrls?.filter(Boolean).length
    ? item.imageUrls.filter(Boolean) : item.imageUrl ? [item.imageUrl] : [];
  const tiers = CATERING_PACKAGE_SERVICE_TIERS.filter((tier) => item.serviceOptions[tier]);
  const groups = [
    {label: "Food inclusions", items: item.foodInclusions},
    {label: "Decoration inclusions", items: item.decorInclusions},
    {label: "Furniture inclusions", items: item.furnitureInclusions},
    {label: "Service inclusions", items: item.serviceInclusions},
  ].filter((group) => group.items.length > 0);

  return <>
    <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-16 sm:pl-6">
      <DialogTitle className="break-words [overflow-wrap:anywhere]">{item.name}</DialogTitle>
      <DialogDescription className="text-sm">Published package details — view only</DialogDescription>
    </DialogHeader>
    <div role="region" aria-label="Package details" tabIndex={0}
      className="grid min-h-0 min-w-0 gap-5 overflow-y-auto overscroll-contain px-5 py-5 text-sm [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
      <PreviewSection title="Package overview">
        <StatusBadge status={item.status} />
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ["Event type", humanize(item.eventType)],
            ["Service category", serviceCategoryLabel || (item.serviceCategoryCode ? humanize(item.serviceCategoryCode) : "Not specified")],
            ["Minimum guests", item.minimumGuests],
            ["Maximum guests", item.maximumGuests],
          ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
          <div className="min-w-0"><dt className="text-muted-foreground">Starting package price</dt><dd><PriceDisplay amount={packageStartingPrice(item.serviceOptions) ?? item.price} /></dd></div>
        </dl>
        <div><h4 className="font-semibold">Description</h4><p className="whitespace-pre-line text-muted-foreground">{item.description || "No package description provided."}</p></div>
      </PreviewSection>
      <PreviewSection title="Package photos">
        {images.length ? <ImageGallery label="Package photos" images={images.map((url, index) => ({url, title: index === 0 ? `${item.name} cover` : `${item.name} additional image ${index + 1}`}))} /> : <Empty>No package images uploaded.</Empty>}
      </PreviewSection>
      <PreviewSection title="Catering service tiers & prices">
        {tiers.length ? <div className="grid gap-3 sm:grid-cols-2">
          {tiers.map((tier) => {
            const option = item.serviceOptions[tier]!;
            return <section key={tier} aria-label={cateringPackageServiceTierLabel(tier)} className="grid min-w-0 content-start gap-2 rounded-xl border border-border bg-muted/20 p-4">
              <h4 className="font-semibold">{cateringPackageServiceTierLabel(tier)}</h4>
              <PriceDisplay amount={option.price} />
              <p className="text-muted-foreground">{cateringPackageServiceTierDescription(tier)}</p>
              <h5 className="font-semibold">Included services</h5>
              {option.includedServices.length ? <InclusionList items={option.includedServices} /> : <Empty>No tier-specific services listed.</Empty>}
            </section>;
          })}
        </div> : <Empty>No service tiers configured for this package. The saved package price is shown above.</Empty>}
      </PreviewSection>
      <PreviewSection title="Package inclusions">
        {groups.length ? <div className="grid gap-3 sm:grid-cols-2">{groups.map((group) => <div key={group.label} className="min-w-0"><h4 className="mb-1 font-semibold">{group.label}</h4><InclusionList items={group.items} /></div>)}</div> : <Empty>No package inclusions have been listed.</Empty>}
      </PreviewSection>
      <PreviewSection title="Theme options">
        {item.themeOptions.length ? <div className="grid gap-3">{item.themeOptions.map((theme) => <section key={theme.id} aria-label={theme.name} className="grid min-w-0 gap-2 rounded-xl border border-border p-4">
          <h4 className="font-semibold">{theme.name}</h4>
          {theme.description ? <p className="whitespace-pre-line text-muted-foreground">{theme.description}</p> : null}
          {theme.imageUrls.length ? <ImageGallery label={`${theme.name} images`} images={theme.imageUrls.map((url, index) => ({url, title: `${theme.name} image ${index + 1}`}))} /> : <Empty>No theme images uploaded.</Empty>}
        </section>)}</div> : <Empty>No theme options configured.</Empty>}
      </PreviewSection>
      <PreviewSection title="Payment terms">
        {item.paymentPolicy ? <PackagePaymentTerms source={item} /> : <Empty>No payment policy configured for this legacy package.</Empty>}
      </PreviewSection>
    </div>
    <div className="flex shrink-0 justify-end border-t border-border px-5 py-3 sm:px-6">
      <DialogClose asChild><Button variant="secondary">Close</Button></DialogClose>
    </div>
  </>;
}

function PreviewSection({title, children}: {title: string; children: ReactNode}) {
  return <section aria-label={title} className="grid min-w-0 gap-3"><h3 className="font-bold text-primary-strong">{title}</h3>{children}</section>;
}
function InclusionList({items}: {items: readonly string[]}) {
  return <ul className="ml-5 list-disc space-y-1 text-muted-foreground">{items.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul>;
}
function Empty({children}: {children: ReactNode}) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
