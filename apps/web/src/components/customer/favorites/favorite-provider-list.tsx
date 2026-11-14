import {Heart} from "lucide-react";
import Link from "next/link";

import {ProviderCard} from "@/components/customer/providers/provider-card";
import {Button} from "@/components/ui/button";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";

export function FavoriteProviderList({
  providers,
}: {
  providers: readonly PublicProvider[];
}) {
  if (providers.length === 0) {
    return (
      <section
        aria-labelledby="favorites-empty-title"
        className="grid min-h-72 place-items-center rounded-card border border-border bg-card px-5 py-10 text-center shadow-card"
      >
        <div className="grid max-w-md justify-items-center gap-3">
          <span className="grid size-12 place-items-center rounded-[12px] bg-secondary text-primary-strong">
            <Heart aria-hidden="true" className="size-6" />
          </span>
          <div>
            <h2 id="favorites-empty-title" className="text-xl font-black">
              No favorite providers yet
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Save providers while browsing the marketplace and they will
              appear here.
            </p>
          </div>
          <Button asChild size="compact" className="rounded-[10px]">
            <Link href="/customer/providers">Explore providers</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="favorite-provider-results" className="grid gap-4">
      <h2 id="favorite-provider-results" className="sr-only">
        Saved provider results
      </h2>
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            favoriteState={{authenticated: true, favorited: true}}
          />
        ))}
      </div>
    </section>
  );
}
