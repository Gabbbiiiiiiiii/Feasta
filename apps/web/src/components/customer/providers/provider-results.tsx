import {SearchX, Store} from "lucide-react";
import Link from "next/link";

import {Button} from "@/components/ui/button";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
} from "@/lib/customer/providers/provider-types";

import {ProviderCard} from "./provider-card";

export function ProviderResults({
  page,
  filters,
}: {
  page: ProviderDiscoveryPage;
  filters: ProviderDiscoveryFilters;
}) {
  const filtered = filters.search.length > 0 ||
    filters.serviceType !== "all" ||
    filters.category !== "all";
  if (page.providers.length === 0) {
    return (
      <section
        className="grid min-h-64 place-items-center rounded-xl border border-[#E8C9BE] bg-white px-5 py-8 text-center shadow-[0_4px_18px_rgba(92,45,29,0.05)]"
        aria-label="Provider results"
      >
        <div className="grid max-w-md justify-items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-[#FFF0E9] text-[#B23A16]">
            {filtered
              ? <SearchX aria-hidden="true" className="size-6" />
              : <Store aria-hidden="true" className="size-6" />}
          </span>
          <div>
            <h2 className="text-lg font-black text-[#2E1C17]">
              {filtered ? "No matching results" : "No providers found"}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-[#78645D]">
              {filtered
                ? "Try a broader search, another service type, or clear your filters."
                : "Approved local event professionals will appear here when they are available."}
            </p>
          </div>
          {filtered ? (
            <Button asChild variant="secondary" size="compact" className="border-[#DDBCB1] text-[#9C3515]">
              <Link href="/customer/providers">Clear filters</Link>
            </Button>
          ) : null}
        </div>
      </section>
    );
  }
  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="provider-results-title">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#B23A16]">Local professionals</p>
        <h2 id="provider-results-title" className="mt-1 text-xl font-black text-[#2E1C17]">
          Approved event services
        </h2>
      </header>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {page.providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </section>
  );
}
