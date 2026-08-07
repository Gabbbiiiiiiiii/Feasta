import {Camera, CakeSlice, Car, Flower2, MapPinned, Mic2, PartyPopper, Utensils} from "lucide-react";
import Link from "next/link";

import {PROVIDER_CATEGORY_OPTIONS} from "@/lib/customer/providers/provider-catalog";

const icons = [Utensils, CakeSlice, PartyPopper, Camera, Mic2, Flower2, Car, MapPinned] as const;

export function ProviderCategoryGrid() {
  return (
    <section className="grid gap-4" aria-labelledby="marketplace-categories-title">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-primary-strong">Browse by category</p>
        <h2 id="marketplace-categories-title" className="mt-1 text-2xl font-black sm:text-3xl">Services for every part of your event</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {PROVIDER_CATEGORY_OPTIONS.map((category, index) => {
          const Icon = icons[index % icons.length]!;
          return (
            <Link key={category.value} href={`/customer/providers?category=${encodeURIComponent(category.value)}`} className="group flex min-h-28 min-w-0 flex-col justify-between gap-3 rounded-card border border-border bg-card p-4 shadow-card transition-colors hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Icon aria-hidden="true" className="size-6 text-primary-strong" />
              <span className="break-words text-sm font-bold sm:text-base">{category.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
