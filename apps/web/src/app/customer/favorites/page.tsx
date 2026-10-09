import type {Metadata} from "next";

import {FavoriteProviderList} from "@/components/customer/favorites/favorite-provider-list";
import {
  requireCustomer,
  requireVerifiedEmail,
} from "@/lib/auth/session";
import {
  getCustomerFavoriteProviders,
} from "@/lib/customer/favorites/customer-favorite-service";

export const metadata: Metadata = {
  title: {absolute: "Favorites | FEASTA Marketplace"},
  description: "Review event-service providers saved to your FEASTA favorites.",
};

export default async function CustomerFavoritesPage() {
  const account = requireVerifiedEmail(await requireCustomer());
  const providers = await getCustomerFavoriteProviders(account.uid);

  return (
    <div className="grid min-w-0 gap-6">
      <header className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-primary-strong">
          FEASTA Marketplace
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
          Your favorite providers
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          Keep the event-service providers you&apos;re considering in one place.
        </p>
      </header>

      <FavoriteProviderList providers={providers} />
    </div>
  );
}
