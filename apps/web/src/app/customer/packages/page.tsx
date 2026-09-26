import type {Metadata} from "next";

import {PackageDirectoryShell} from "@/components/customer/packages/package-directory-shell";
import {PackageFilterForm} from "@/components/customer/packages/package-filter-form";
import {PackagePagination} from "@/components/customer/packages/package-pagination";
import {PackageResults} from "@/components/customer/packages/package-results";
import {getPublicPackagePage} from "@/lib/customer/discovery/package-discovery-service";
import {parsePackageDiscoveryFilters} from "@/lib/customer/discovery/package-query";

export const metadata: Metadata = {
  title: {absolute: "Packages | FEASTA Marketplace"},
  description: "Compare public event packages from verified FEASTA providers.",
};

export default async function CustomerPackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parsePackageDiscoveryFilters(await searchParams);
  const page = await getPublicPackagePage(filters);

  return (
    <PackageDirectoryShell>
      <PackageFilterForm filters={filters} />
      <div className="grid min-w-0 gap-5">
        <PackageResults page={page} filters={filters} />
        <PackagePagination page={page} filters={filters} />
      </div>
    </PackageDirectoryShell>
  );
}
