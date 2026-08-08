import {ProviderFilterForm} from "@/components/customer/providers/provider-filter-form";
import {ProviderDirectoryShell} from "@/components/customer/providers/provider-directory-shell";
import {ProviderPagination} from "@/components/customer/providers/provider-pagination";
import {ProviderResults} from "@/components/customer/providers/provider-results";
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
    <ProviderDirectoryShell>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-6">
        <ProviderFilterForm filters={filters} />
        <div className="grid min-w-0 gap-5">
          <ProviderResults page={page} filters={filters} />
          <ProviderPagination page={page} filters={filters} />
        </div>
      </div>
    </ProviderDirectoryShell>
  );
}
