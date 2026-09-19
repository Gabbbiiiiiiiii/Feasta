import {
  requireProviderCatalogAccess,
} from "@/lib/auth/session";

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

  return (
    <ProviderServicesClient
      providerId={account.provider.id}
      serviceCategories={
        account.provider.serviceCategories
      }
    />
  );
}