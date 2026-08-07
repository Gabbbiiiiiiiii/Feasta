import {ArrowRight, Sparkles} from "lucide-react";
import Link from "next/link";
import {Suspense} from "react";

import {MarketplaceHomeLoading} from "@/components/customer/discovery/marketplace-home-loading";
import {MarketplacePackageSection} from "@/components/customer/discovery/marketplace-package-section";
import {MarketplaceProviderSection} from "@/components/customer/discovery/marketplace-provider-section";
import {MarketplaceSearch} from "@/components/customer/discovery/marketplace-search";
import {ProviderCategoryGrid} from "@/components/customer/discovery/provider-category-grid";
import {ApplicationErrorState} from "@/components/feedback/application-states";
import {Button} from "@/components/ui/button";
import {requireRole} from "@/lib/auth/session";
import {getCustomerMarketplaceHome} from "@/lib/customer/discovery/marketplace-home-service";

export default async function CustomerPage() {
  const user = await requireRole(["customer"]);
  return (
    <div className="grid min-w-0 gap-10 lg:gap-12">
      <MarketplaceHero email={user.email} />
      <Suspense fallback={<MarketplaceHomeLoading />}>
        <MarketplaceContent />
      </Suspense>
    </div>
  );
}

async function MarketplaceContent() {
  let marketplace;
  try {
    marketplace = await getCustomerMarketplaceHome();
  } catch {
    return (
      <ApplicationErrorState
        kind="load"
        description="The provider marketplace could not be loaded. Please try again."
      />
    );
  }
  return (
    <>
      <ProviderCategoryGrid />
      <MarketplaceProviderSection providers={marketplace.providers} />
      <MarketplacePackageSection packages={marketplace.packages} />
    </>
  );
}

function MarketplaceHero({email}: {email: string | null}) {
  return (
    <header className="relative isolate overflow-hidden rounded-card bg-primary px-5 py-8 text-primary-foreground shadow-floating sm:px-8 sm:py-10 lg:px-12 lg:py-14">
      <div className="absolute -right-24 -top-24 -z-10 size-72 rounded-full bg-card/10" />
      <div className="absolute -bottom-32 left-1/3 -z-10 size-80 rounded-full bg-card/10" />
      <div className="grid max-w-4xl gap-6">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
            <Sparkles aria-hidden="true" className="size-4" />FEASTA marketplace
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            Bring your next celebration together
          </h1>
          <p className="mt-3 max-w-2xl text-base text-primary-foreground/85 sm:text-lg">
            {email ? `Welcome back, ${email}. ` : ""}Find approved providers and published packages using real FEASTA marketplace records.
          </p>
        </div>
        <MarketplaceSearch />
        <Button asChild variant="secondary" size="compact" className="w-full sm:w-fit">
          <Link href="/customer/providers">Browse the full directory<ArrowRight aria-hidden="true" /></Link>
        </Button>
      </div>
    </header>
  );
}
