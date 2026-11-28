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
  return <section aria-label="Package & Customization" className="grid min-w-0 gap-3 text-sm [overflow-wrap:anywhere]">
    <div className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-base font-bold text-foreground">{request.package?.name ?? "Selected package"}</p>
        {snapshot?.tier ? (
          <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
            {snapshot.tier}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
        <PriceDisplay
          amount={snapshot?.price}
          unknownLabel="Package subtotal not recorded"
          className="text-xs font-medium text-muted-foreground [&>span]:break-normal [&>span]:whitespace-nowrap [&>span]:text-xs [&>span]:font-medium [&>span]:text-muted-foreground"
        />
        <span aria-hidden="true">·</span>
        <span>
          {snapshot?.pricingModel ?? "Pricing model not recorded"}
          <span aria-hidden="true"> · </span>
          {request.event.guestCount?.toLocaleString("en-PH") ?? "Unrecorded"} guests
        </span>
      </div>
      {snapshot?.theme ? (
        <p className="text-xs text-muted-foreground">
          Selected theme: <span className="font-medium text-foreground">{snapshot.theme.name}</span>
        </p>
      ) : null}
    </div>
    <div className="grid min-w-0 gap-3">
      <button type="button" aria-expanded={expanded} aria-controls={panelId} data-print-hidden="" onClick={() => setExpanded(value => !value)}
        className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden">
        <span>{expanded ? "Hide package details" : "View full package details"}</span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
      </button>
      <div id={panelId} hidden={!expanded} data-print-expand="" className="min-w-0">
        <div className="grid min-w-0 gap-4 rounded-xl border border-border/80 bg-muted/20 p-3.5">
          {snapshot?.theme ? <section aria-label="Selected theme" className="grid min-w-0 gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected theme</h4>
            {snapshot.theme.images[0] ? <Image src={snapshot.theme.images[0]} alt={`${snapshot.theme.name} — saved theme image`} width={640} height={360} unoptimized className="h-auto max-h-40 w-full rounded-lg object-contain" /> : null}
            {snapshot.theme.description ? <p className="whitespace-pre-line text-muted-foreground">{snapshot.theme.description}</p> : null}
          </section> : <p className="text-xs text-muted-foreground">Theme details were not recorded for this booking.</p>}
          <section aria-label="Selected dishes" className="grid min-w-0 gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected dishes</h4>
            {snapshot?.foodChoices.length ? <div className="divide-y divide-border rounded-lg border border-border bg-card px-3">{snapshot.foodChoices.map((group, index) => <div key={`${group.title}-${index}`} className="grid min-w-0 gap-2 py-3"><h5 className="font-medium">{group.title}</h5><ul className="flex min-w-0 flex-wrap gap-1.5">{group.dishes.map((dish, dishIndex) => <li key={`${dish}-${dishIndex}`} className="max-w-full rounded-md bg-muted/50 px-2 py-1 text-xs">{dish}</li>)}</ul></div>)}</div>
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
