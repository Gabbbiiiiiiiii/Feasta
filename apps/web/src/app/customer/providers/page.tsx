import {MIN_PLANNING_BUDGET} from "@/lib/customer/planning/event-planning-context";
import {ProviderDirectoryShell} from "@/components/customer/providers/provider-directory-shell";
import {MarketplaceActiveEventStrip} from "@/components/customer/discovery/marketplace-active-event-strip";
import {ProviderPagination} from "@/components/customer/providers/provider-pagination";
import {ProviderResults} from "@/components/customer/providers/provider-results";
import {ProviderEventContextPanel} from "@/components/customer/providers/provider-event-context-panel";
import {getOptionalAccountContext} from "@/lib/auth/session";
import {getCustomerFavoriteProviderIds} from "@/lib/customer/favorites/customer-favorite-service";
import {getPublicProviderDetail} from "@/lib/customer/providers/provider-detail-service";
import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";
import {parseProviderDiscoveryFilters} from "@/lib/customer/providers/provider-query";
import {getServiceCategoryOptions} from "@/lib/service-categories/service-category-service";

type CustomerProvidersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerProvidersPage({
  searchParams,
}: CustomerProvidersPageProps) {
  const params = await searchParams;
  const reviewOnly = params.view === "best-fit-review";
  const filters = parseProviderDiscoveryFilters(params);
  const [
    page,
    account,
    serviceCategoryOptions,
  ] = await Promise.all([
    getPublicProviderPage(filters),
    getOptionalAccountContext(),
    getServiceCategoryOptions(),
  ]);
  const authenticatedCustomer = account?.role === "customer" &&
    account.emailVerified;
  const favoriteProviderIds = authenticatedCustomer
    ? await getCustomerFavoriteProviderIds(
      account.uid,
      page.providers.map((provider) => provider.id),
    )
    : new Set<string>();

  const budgetDetails = authenticatedCustomer && filters.eventContext && filters.planningContext?.eventVenue &&
      filters.planningContext.eventType && (filters.planningContext.budgetMax ?? 0) >= MIN_PLANNING_BUDGET
    ? await Promise.allSettled(page.providers.map((provider) => getPublicProviderDetail(provider.id)))
    : [];
  const providerDetails = budgetDetails.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);

  return (
    <ProviderDirectoryShell>
      {authenticatedCustomer && !reviewOnly ? <MarketplaceActiveEventStrip /> : null}
      {!reviewOnly && <ProviderEventContextPanel filters={filters} customerId={authenticatedCustomer ? account.uid : undefined} />}
      <div className="grid min-w-0 gap-5">
        <ProviderResults
          page={page}
          reviewOnly={reviewOnly}
          budgetDetails={providerDetails}
          incompleteBudgetCatalog={budgetDetails.some((result) => result.status === "rejected")}
          filters={filters}
          favoriteProviderIds={favoriteProviderIds}
          authenticatedCustomer={authenticatedCustomer}
          customerId={authenticatedCustomer ? account.uid : undefined}
          serviceCategoryOptions={serviceCategoryOptions}
        />
        {!reviewOnly && <ProviderPagination page={page} filters={filters} />}
      </div>
    </ProviderDirectoryShell>
  );
}
