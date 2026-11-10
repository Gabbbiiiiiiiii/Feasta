"use client";

import {useId, useState} from "react";
import {Check, ChevronDown} from "lucide-react";
import Image from "next/image";
import {PriceDisplay} from "@/components/shared/price-display";
import type {ProviderRequestListItem} from "@/lib/provider/requests/provider-request-types";

export function ProviderRequestPackageDetails({request}: {request: ProviderRequestListItem}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const snapshot = request.packageSnapshot;
  return <section aria-label="Package & Customization" className="grid min-w-0 gap-5 border-t border-border pt-5 text-sm [overflow-wrap:anywhere]">
    <div className="grid min-w-0 gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Package &amp; Customization</h3>
      <p className="min-w-0 text-base font-semibold">{request.package?.name ?? "Selected package"}</p>
      {snapshot?.tier ? <p className="font-medium text-primary">{snapshot.tier}</p> : null}
      <div className="grid min-w-0 gap-2 rounded-lg bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">Saved package subtotal</p>
        <PriceDisplay amount={snapshot?.price} unknownLabel="Package subtotal not recorded" className="[&>span]:break-normal [&>span]:whitespace-nowrap" />
        <p className="text-xs text-muted-foreground">{snapshot?.pricingModel ?? "Pricing model not recorded"}<span aria-hidden="true"> · </span>{request.event.guestCount?.toLocaleString("en-PH") ?? "Unrecorded"} guests</p>
        <p className="text-xs text-muted-foreground">Booking-time package amount. Payment requirements are shown below.</p>
      </div>
      {snapshot?.theme ? <p className="text-muted-foreground">Selected theme: <span className="font-medium text-foreground">{snapshot.theme.name}</span></p> : null}
    </div>
    <div className="grid min-w-0 gap-3">
      <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}
        className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left font-medium text-primary hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>{expanded ? "Hide package details" : "View full package details"}</span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
      </button>
      <div id={panelId} hidden={!expanded} className="min-w-0">
        <div className="grid min-w-0 gap-4 border-t border-border pt-4">
          {snapshot?.theme ? <section aria-label="Selected theme" className="grid min-w-0 gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected theme</h4>
            {snapshot.theme.images[0] ? <Image src={snapshot.theme.images[0]} alt={`${snapshot.theme.name} — saved theme image`} width={640} height={360} unoptimized className="h-auto max-h-40 w-full rounded-lg object-contain" /> : null}
            {snapshot.theme.description ? <p className="whitespace-pre-line text-muted-foreground">{snapshot.theme.description}</p> : null}
          </section> : <p className="text-xs text-muted-foreground">Theme details were not recorded for this booking.</p>}
          <section aria-label="Selected dishes" className="grid min-w-0 gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected dishes</h4>
            {snapshot?.foodChoices.length ? <div className="divide-y divide-border rounded-lg border border-border px-3">{snapshot.foodChoices.map((group, index) => <div key={`${group.title}-${index}`} className="grid min-w-0 gap-2 py-3"><h5 className="font-medium">{group.title}</h5><ul className="flex min-w-0 flex-wrap gap-1.5">{group.dishes.map((dish, dishIndex) => <li key={`${dish}-${dishIndex}`} className="max-w-full rounded-md bg-muted/50 px-2 py-1 text-xs">{dish}</li>)}</ul></div>)}</div>
              : <p className="text-xs text-muted-foreground">Dish selections were not recorded in the available booking snapshot.</p>}
          </section>
          <div className="text-xs text-muted-foreground"><p>Read-only booking snapshot</p><p>Package reference: {request.package?.id ?? "Not recorded"}</p></div>
          <PackageInclusions request={request} />
        </div>
      </div>
    </div>
  </section>;
}

/** Legacy requests retain their summary and expand in the same drawer. */
export function SavedPackageLink({request}: {request: ProviderRequestListItem}) {
  return <details className="min-w-0">
    <summary className="cursor-pointer text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{request.package?.name ?? "Selected package"}</summary>
    <div className="mt-3 grid min-w-0 gap-3 text-sm"><p className="text-xs text-muted-foreground">Read-only booking snapshot. Package reference: {request.package?.id ?? "Not recorded"}</p><PackageInclusions request={request} /></div>
  </details>;
}

function PackageInclusions({request}: {request: ProviderRequestListItem}) {
  return request.packageSnapshot?.inclusions.length ? <div className="grid min-w-0 gap-3">{request.packageSnapshot.inclusions.map(group => <details key={group.title} open={group.items.length <= 5} className="min-w-0 rounded-lg border border-border px-3 py-2">
    <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{group.title}<span className="ml-2 text-xs font-normal text-muted-foreground">({group.items.length})</span></summary>
    <ul className="mt-2 grid gap-1.5">{group.items.map((item, index) => <li key={`${item}-${index}`} className="flex min-w-0 items-start gap-2 text-muted-foreground"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0">{item}</span></li>)}</ul>
  </details>)}</div> : <p className="text-xs text-muted-foreground">Additional package inclusions were not recorded.</p>;
}
