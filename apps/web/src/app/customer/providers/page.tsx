import {ProviderFilterForm} from "@/components/customer/providers/provider-filter-form";
import {ProviderPagination} from "@/components/customer/providers/provider-pagination";
import {ProviderResults} from "@/components/customer/providers/provider-results";
import {PageHeading} from "@/components/layout/page-heading";
import {requireRole} from "@/lib/auth/session";
import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";
import {parseProviderDiscoveryFilters} from "@/lib/customer/providers/provider-query";

type CustomerProvidersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerProvidersPage({
  searchParams,
}: CustomerProvidersPageProps) {
  await requireRole(["customer"]);
  const filters = parseProviderDiscoveryFilters(await searchParams);
  const page = await getPublicProviderPage(filters);
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Discovery"
        title="Find event providers"
        description="Search approved, active, publicly visible FEASTA providers by business, service, category, or location."
      />
      <ProviderFilterForm filters={filters} />
      <ProviderResults page={page} filters={filters} />
      <ProviderPagination page={page} filters={filters} />
    </div>
  );
}
