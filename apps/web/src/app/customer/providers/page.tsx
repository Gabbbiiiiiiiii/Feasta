import {ProviderDirectoryShell} from "@/components/customer/providers/provider-directory-shell";
import {ProviderPagination} from "@/components/customer/providers/provider-pagination";
import {ProviderResults} from "@/components/customer/providers/provider-results";
import {ProviderEventContextPanel} from "@/components/customer/providers/provider-event-context-panel";
import {getOptionalAccountContext} from "@/lib/auth/session";
import {getCustomerFavoriteProviderIds} from "@/lib/customer/favorites/customer-favorite-service";
import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";
import {parseProviderDiscoveryFilters} from "@/lib/customer/providers/provider-query";

type CustomerProvidersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerProvidersPage({
  searchParams,
}: CustomerProvidersPageProps) {
  const filters = parseProviderDiscoveryFilters(await searchParams);
  const [page, account] = await Promise.all([
    getPublicProviderPage(filters),
    getOptionalAccountContext(),
  ]);
  const authenticatedCustomer = account?.role === "customer" &&
    account.emailVerified;
  const favoriteProviderIds = authenticatedCustomer
    ? await getCustomerFavoriteProviderIds(
      account.uid,
      page.providers.map((provider) => provider.id),
    )
    : new Set<string>();

  return (
    <ProviderDirectoryShell>
      <ProviderEventContextPanel filters={filters} />
      <div className="grid min-w-0 gap-5">
        <ProviderResults
          page={page}
          filters={filters}
          favoriteProviderIds={favoriteProviderIds}
          authenticatedCustomer={authenticatedCustomer}
        />
        <ProviderPagination page={page} filters={filters} />
      </div>
    </ProviderDirectoryShell>
  );
}
