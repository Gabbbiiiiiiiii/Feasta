import {notFound} from "next/navigation";

import {ProviderProfile} from "@/components/customer/providers/provider-profile";
import {getOptionalAccountContext} from "@/lib/auth/session";
import {getCustomerFavoriteProviderIds} from "@/lib/customer/favorites/customer-favorite-service";
import {getPublicProviderDetail} from "@/lib/customer/providers/provider-detail-service";
import {
  parseMarketplaceReturnHref,
  providerProfileHref,
} from "@/lib/customer/providers/provider-query";

export default async function PublicProviderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{providerId: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{providerId}, query, account] = await Promise.all([
    params,
    searchParams,
    getOptionalAccountContext(),
  ]);
  const detail = await getPublicProviderDetail(providerId);
  if (!detail) notFound();
  const backHref = parseMarketplaceReturnHref(query.returnTo);
  const authenticatedCustomer = account?.role === "customer" &&
    account.emailVerified;
  const favoriteProviderIds = authenticatedCustomer
    ? await getCustomerFavoriteProviderIds(account.uid, [providerId])
    : new Set<string>();

  return (
    <ProviderProfile
      detail={detail}
      backHref={backHref}
      favoriteState={{
        authenticated: authenticatedCustomer,
        favorited: favoriteProviderIds.has(providerId),
        loginReturnTo: providerProfileHref(providerId, backHref),
      }}
    />
  );
}
