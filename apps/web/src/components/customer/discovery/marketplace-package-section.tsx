import {Box, CalendarDays} from "lucide-react";

import {PriceDisplay} from "@/components/shared/price-display";
import {humanizeProviderValue} from "@/lib/customer/providers/provider-catalog";
import type {PublicPackage} from "@/lib/customer/discovery/marketplace-types";

export function MarketplacePackageSection({packages}: {packages: readonly PublicPackage[]}) {
  if (packages.length === 0) return null;
  return (
    <section className="grid gap-4" aria-labelledby="marketplace-packages-title">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-primary-strong">Published packages</p>
        <h2 id="marketplace-packages-title" className="mt-1 text-2xl font-black sm:text-3xl">Packages available from approved providers</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {packages.map((packageRecord) => (
          <article key={packageRecord.id} className="grid min-w-0 content-start gap-4 rounded-card border border-border bg-card p-5 shadow-card">
            <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary-strong"><Box aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0">
              <h3 className="break-words text-lg font-black">{packageRecord.name}</h3>
              <p className="mt-1 break-words text-sm text-muted-foreground">{packageRecord.providerName}</p>
            </div>
            {packageRecord.description ? <p className="line-clamp-3 break-words text-sm text-muted-foreground">{packageRecord.description}</p> : null}
            {packageRecord.eventType ? (
              <p className="flex items-center gap-2 text-sm"><CalendarDays aria-hidden="true" className="size-4 text-primary-strong" />{humanizeProviderValue(packageRecord.eventType)} events</p>
            ) : null}
            <PriceDisplay amount={packageRecord.price} />
          </article>
        ))}
      </div>
    </section>
  );
}
