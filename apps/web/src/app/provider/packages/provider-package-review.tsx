import type {ReactNode} from "react";
import type {FoodChoiceGroupV2} from "@feasta/shared-types/provider-package-v2";
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
  minimumGuests, maximumGuests, maxDropOffOrderQuantity, serviceOptions, food, foodChoiceGroups, decor, furniture, services, offerDraft,
  images, paymentPolicy, fullPaymentAllowed, depositPercentage, canPublish = false, editingPublished = false}: {
  name: string; description: string; eventType: string; serviceCategory: string;
  pricingModel: "per_pax" | "per_bundle" | "legacy"; minimumGuests: string; maximumGuests: string;
  maxDropOffOrderQuantity?: number;
  serviceOptions: PackageServiceOptions; food: string[]; foodChoiceGroups: FoodChoiceGroupV2[]; decor: string; furniture: string; services: string;
  offerDraft: ProviderPackageOfferDraft; images: CatalogImageDraft[];
  paymentPolicy: string; fullPaymentAllowed?: boolean; depositPercentage: string;
  canPublish?: boolean;
  editingPublished?: boolean;
}) {
  const dishes = parsePackageDishes(food);
  const groups = Array.from(new Set(dishes.map((dish) => dish.category)));
  return (
    <section aria-label="Package review" className="grid gap-4">
      <p
        role="note"
        className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground"
      >
        {editingPublished
          ? "Review your updated package details below. Saving changes immediately updates your live published package for new bookings. Existing bookings keep their original package details."
          : canPublish
            ? "Review your package details below. Save as Draft to keep this package private for later, or Publish Package to make it visible and bookable by customers."
            : "Review your package details below. Save as Draft to keep this package private until it is ready to publish."}
      </p>
      <ReviewSection title="Package details">
        <div className="space-y-1">
          <h4 className="break-words font-bold">{name}</h4>
          <p className="text-sm capitalize">{eventType.replaceAll("_", " ")} · {serviceCategory}</p>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{description || "No description added"}</p>
      </ReviewSection>
      <ReviewSection title="Pricing, capacity & service tiers">
        <dl className={`grid gap-3 border-b border-border pb-3 text-sm ${typeof maxDropOffOrderQuantity === "number" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <div className="space-y-0.5">
            <dt className="text-xs font-medium text-muted-foreground">Pricing model</dt>
            <dd className="font-semibold text-foreground">{pricingModel === "per_pax" ? "Per Pax" : pricingModel === "per_bundle" ? "Per Bundle" : "Legacy fixed price"}</dd>
            <dd className="text-xs text-muted-foreground">{pricingModel === "per_pax" ? "Each service-tier price is per person." : "One fixed package price within the guest range."}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-xs font-medium text-muted-foreground">Guest capacity</dt>
            <dd className="font-semibold text-foreground">{minimumGuests}–{maximumGuests} guests</dd>
          </div>
          {typeof maxDropOffOrderQuantity === "number" ? (
            <div className="space-y-0.5">
              <dt className="text-xs font-medium text-muted-foreground">Max quantity per order (Drop-Off)</dt>
              <dd className="font-semibold text-foreground">{maxDropOffOrderQuantity === 1 ? "1 package" : `Up to ${maxDropOffOrderQuantity} packages`}</dd>
            </div>
          ) : null}
        </dl>
        {Object.keys(serviceOptions).length === 0 ? <p className="text-sm text-muted-foreground">No service tiers enabled</p> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(serviceOptions).map(([tier, option]) => (
              <article key={tier} className="rounded-lg bg-muted/40 p-3">
                <h6 className="text-sm font-semibold">{cateringPackageServiceTierLabel(tier as CateringPackageServiceTier)}</h6>
                <p className="mt-1 font-bold">{php(option.price)} <span className="text-xs font-normal">{pricingModel === "per_pax" ? "per person" : "fixed package"}</span></p>
                <Inclusions text={option.includedServices.join("\n")} />
                {([
                  ["Decorations", "decorInclusionsText"],
                  ["Furniture", "furnitureInclusionsText"],
                  ["Equipment", "equipmentInclusionsText"],
                ] as const).map(([label, field]) => offerDraft.serviceOptions[tier as CateringPackageServiceTier]?.[field] ? (
                  <div className="mt-2" key={field}>
                    <h6 className="text-xs font-semibold">{label}</h6>
                    <Inclusions text={offerDraft.serviceOptions[tier as CateringPackageServiceTier][field]} />
                  </div>
                ) : null)}
              </article>
            ))}
          </div>
        )}
      </ReviewSection>
      <ReviewSection title="Food inclusions">{groups.length ? <div className="grid gap-3 sm:grid-cols-2">{groups.map((category) => <div key={category}><h6 className="text-sm font-semibold">{category || "Uncategorized"}</h6><Inclusions text={dishes.filter((dish) => dish.category === category).map((dish) => dish.name).join("\n")} /></div>)}</div> : <p className="text-sm text-muted-foreground">No dishes added</p>}</ReviewSection>
      {foodChoiceGroups.length ? <ReviewSection title="Customer-selectable food groups">
        <p className="text-xs text-muted-foreground">
          Customers can select dishes from these groups when booking an
          eligible published V2 package. Each group follows its configured
          selection count.
        </p>
        {foodChoiceGroups.map((group) => <div key={group.id} className="space-y-1 rounded-lg border p-3">
          <h6 className="font-semibold">{group.title || "Untitled choice group"} — choose {group.selectionCount}</h6>
          <ul className="list-inside list-disc text-sm">{group.options.map((option) => <li key={option.id}>{option.name || "Incomplete dish"}</li>)}</ul>
        </div>)}
      </ReviewSection> : null}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <ReviewSection title="Shared package inclusions"><h6 className="text-xs font-bold">Decorations</h6><Inclusions text={decor} /><h6 className="text-xs font-bold">Furniture</h6><Inclusions text={furniture} /><h6 className="text-xs font-bold">Services</h6><Inclusions text={services} /></ReviewSection>
        <ReviewSection title="Themes">{offerDraft.themeOptions.length ? offerDraft.themeOptions.map((theme) => <article key={theme.id} className="space-y-1 border-b pb-2 last:border-0"><h6 className="break-words text-sm font-semibold">{theme.name}</h6><p className="break-words text-sm text-muted-foreground">{theme.description || "No description"}</p><p className="text-xs text-muted-foreground">{theme.images.length} reference images</p></article>) : <p className="text-sm text-muted-foreground">None added</p>}</ReviewSection>
      </div>
      <ReviewSection title="Images">{images.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{images.map((image, index) => (
        // Local previews and existing provider-owned assets use the same image workflow.
        // eslint-disable-next-line @next/next/no-img-element
        <figure key={image.id} className="min-w-0 space-y-1"><img src={image.url} alt={"Package image " + (index + 1)} className="aspect-[4/3] w-full rounded-lg border bg-muted object-contain" /><figcaption className="text-xs text-muted-foreground">{index === 0 ? "Cover image" : `Image ${index + 1}`}</figcaption></figure>
      ))}</div> : <p className="text-sm text-muted-foreground">No images added</p>}</ReviewSection>
      <ReviewSection title="Payment terms"><p className="text-sm font-semibold">{paymentPolicy === "full_payment" ? "Full Payment (100%)" : fullPaymentAllowed !== false ? "Full Payment or Down Payment (" + depositPercentage + "% + Remaining Balance)" : "Down Payment (" + depositPercentage + "% + Remaining Balance)"}</p><p className="text-sm text-muted-foreground">{paymentPolicy === "full_payment" ? "The full amount is due after booking acceptance." : fullPaymentAllowed !== false ? "Customers can pay in full upfront or pay the down payment first with the remaining balance due 24 hours before the scheduled event start." : "Remaining balance is due 24 hours before the scheduled event start. Short-notice bookings under 72 hours still require full payment."}</p></ReviewSection>
    </section>
  );
}
