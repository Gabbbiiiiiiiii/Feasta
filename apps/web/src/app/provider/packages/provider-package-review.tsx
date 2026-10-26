import type {ReactNode} from "react";
import type {CatalogImageDraft} from "@/lib/provider/catalog-media";
import type {PackageServiceOptions} from "@/lib/catering/package-offer-configuration";
import {cateringPackageServiceTierLabel, type CateringPackageServiceTier} from "@/lib/catering/catering-service-tier";
import {parsePackageDishes} from "@/lib/provider/package-food-inclusions";
import type {ProviderPackageOfferDraft} from "./provider-package-offer-builder";

const php = (amount: number) => "PHP " + amount.toLocaleString("en-PH", {minimumFractionDigits: 2, maximumFractionDigits: 2});

function ReviewSection({title, children}: {title: string; children: ReactNode}) {
  return <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4"><h5 className="text-sm font-bold text-primary-strong">{title}</h5>{children}</section>;
}

function Inclusions({text}: {text: string}) {
  const items = text.split(/\r?\n/u).filter((item) => item.trim());
  return items.length ? <ul className="list-inside list-disc space-y-1 text-sm">{items.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">None added</p>;
}

export function ProviderPackageReview({name, description, eventType, serviceCategory, pricingModel,
  minimumGuests, maximumGuests, serviceOptions, food, decor, furniture, services, offerDraft,
  images, paymentPolicy, depositPercentage}: {
  name: string; description: string; eventType: string; serviceCategory: string;
  pricingModel: "per_pax" | "per_bundle" | "legacy"; minimumGuests: string; maximumGuests: string;
  serviceOptions: PackageServiceOptions; food: string[]; decor: string; furniture: string; services: string;
  offerDraft: ProviderPackageOfferDraft; images: CatalogImageDraft[];
  paymentPolicy: string; depositPercentage: string;
}) {
  const dishes = parsePackageDishes(food);
  const groups = Array.from(new Set(dishes.map((dish) => dish.category)));
  return (
    <section aria-label="Package review" className="grid gap-4">
      {pricingModel !== "legacy" ? <p role="note" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Draft only: this pricing model cannot be published or booked until customer compatibility is verified.</p> : null}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <ReviewSection title="Package details"><h4 className="break-words font-bold">{name}</h4><p className="text-sm capitalize">{eventType.replaceAll("_", " ")} · {serviceCategory}</p><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{description || "No description added"}</p></ReviewSection>
        <ReviewSection title="Pricing model & capacity"><p className="font-semibold">{pricingModel === "per_pax" ? "Per Pax" : pricingModel === "per_bundle" ? "Per Bundle" : "Legacy fixed price"}</p><p className="text-sm">{minimumGuests}–{maximumGuests} guests</p><p className="text-sm text-muted-foreground">{pricingModel === "per_pax" ? "Each service-tier price is per person." : "One fixed package price within the guest range."}</p></ReviewSection>
      </div>
      <ReviewSection title="Service tiers & pricing">{Object.keys(serviceOptions).length === 0 ? <p className="text-sm text-muted-foreground">No service tiers enabled</p> : null}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(serviceOptions).map(([tier, option]) => <article key={tier} className="rounded-lg bg-muted/40 p-3"><h6 className="text-sm font-semibold">{cateringPackageServiceTierLabel(tier as CateringPackageServiceTier)}</h6><p className="mt-1 font-bold">{php(option.price)} <span className="text-xs font-normal">{pricingModel === "per_pax" ? "per person" : "fixed package"}</span></p><Inclusions text={option.includedServices.join("\n")} /></article>)}</div></ReviewSection>
      <ReviewSection title="Food inclusions">{groups.length ? <div className="grid gap-3 sm:grid-cols-2">{groups.map((category) => <div key={category}><h6 className="text-sm font-semibold">{category || "Uncategorized"}</h6><Inclusions text={dishes.filter((dish) => dish.category === category).map((dish) => dish.name).join("\n")} /></div>)}</div> : <p className="text-sm text-muted-foreground">No dishes added</p>}</ReviewSection>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <ReviewSection title="Shared package inclusions"><h6 className="text-xs font-bold">Decorations</h6><Inclusions text={decor} /><h6 className="text-xs font-bold">Furniture</h6><Inclusions text={furniture} /><h6 className="text-xs font-bold">Services</h6><Inclusions text={services} /></ReviewSection>
        <ReviewSection title="Themes">{offerDraft.themeOptions.length ? offerDraft.themeOptions.map((theme) => <article key={theme.id} className="space-y-1 border-b pb-2 last:border-0"><h6 className="break-words text-sm font-semibold">{theme.name}</h6><p className="break-words text-sm text-muted-foreground">{theme.description || "No description"}</p><p className="text-xs text-muted-foreground">{theme.images.length} reference images</p></article>) : <p className="text-sm text-muted-foreground">None added</p>}</ReviewSection>
      </div>
      <ReviewSection title="Images">{images.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{images.map((image, index) => (
        // Local previews and existing provider-owned assets use the same image workflow.
        // eslint-disable-next-line @next/next/no-img-element
        <figure key={image.id} className="min-w-0 space-y-1"><img src={image.url} alt={"Package image " + (index + 1)} className="aspect-[4/3] w-full rounded-lg border bg-muted object-contain" /><figcaption className="text-xs text-muted-foreground">{index === 0 ? "Cover image" : `Image ${index + 1}`}</figcaption></figure>
      ))}</div> : <p className="text-sm text-muted-foreground">No images added</p>}</ReviewSection>
      <ReviewSection title="Payment terms"><p className="text-sm font-semibold">{paymentPolicy === "full_payment" ? "Full Payment (100%)" : "Deposit " + depositPercentage + "% + Remaining Balance"}</p><p className="text-sm text-muted-foreground">{paymentPolicy === "full_payment" ? "The full amount is due after booking acceptance." : "Remaining balance is due 24 hours before the scheduled event start."}</p></ReviewSection>
    </section>
  );
}
