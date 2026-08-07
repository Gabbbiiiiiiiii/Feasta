import {ArrowRight} from "lucide-react";
import Link from "next/link";

import {ProviderCard} from "@/components/customer/providers/provider-card";
import {ApplicationEmptyState} from "@/components/feedback/application-states";
import {Button} from "@/components/ui/button";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";

export function MarketplaceProviderSection({providers}: {providers: readonly PublicProvider[]}) {
  return (
    <section className="grid gap-4" aria-labelledby="marketplace-providers-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-primary-strong">Provider discovery</p>
          <h2 id="marketplace-providers-title" className="mt-1 text-2xl font-black sm:text-3xl">Explore approved providers</h2>
          <p className="mt-1 text-sm text-muted-foreground">Public businesses currently approved to operate on FEASTA.</p>
        </div>
        <Button asChild variant="secondary" size="compact">
          <Link href="/customer/providers">View all providers<ArrowRight aria-hidden="true" /></Link>
        </Button>
      </div>
      {providers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
        </div>
      ) : (
        <div className="rounded-card border border-border bg-card shadow-card">
          <ApplicationEmptyState kind="providers" />
        </div>
      )}
    </section>
  );
}
