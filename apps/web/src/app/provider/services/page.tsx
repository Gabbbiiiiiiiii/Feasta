import {
  requireProviderCatalogAccess,
} from "@/lib/auth/session";
import {
  getServiceCategoryOptions,
} from "@/lib/service-categories/service-category-service";

import {
  ProviderServicesClient,
} from "./provider-services-client";

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
    <ProviderServicesClient
      providerId={account.provider.id}
      serviceCategories={
        account.provider.serviceCategories
      }
      serviceCategoryOptions={
        assignedServiceCategoryOptions
      }
    />
  );
}
