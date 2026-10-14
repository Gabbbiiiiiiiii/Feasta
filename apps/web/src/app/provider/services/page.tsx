import {
  requireProviderCatalogAccess,
} from "@/lib/auth/session";
import {
  getServiceCategoryOptions,
} from "@/lib/service-categories/service-category-service";

import {
  ProviderServicesClient,
} from "./provider-services-client";
import Link from "next/link";

export default async function ProviderServicesPage() {
  const account =
    await requireProviderCatalogAccess();

  if (
    !account.provider ||
    account.provider.id !==
      account.providerId
  ) {
    return null;
  }

  const provider = account.provider;

  const serviceCategoryOptions =
    await getServiceCategoryOptions();

  const assignedServiceCategoryOptions =
    serviceCategoryOptions.filter(
      (category) =>
        provider.serviceCategories.includes(
          category.code,
        ),
    );

  return (
    <div className="grid gap-6">
    {provider.providerServiceType === "both" ? <nav aria-label="Packages and services" className="flex flex-wrap gap-4"><Link href="/provider/packages" className="font-semibold underline">Packages</Link><Link href="/provider/services" aria-current="page" className="font-semibold underline">Event Services</Link></nav> : null}
    <ProviderServicesClient
      providerId={account.provider.id}
      serviceCategories={
        account.provider.serviceCategories
      }
      serviceCategoryOptions={
        assignedServiceCategoryOptions
      }
    />
    </div>
  );
}
