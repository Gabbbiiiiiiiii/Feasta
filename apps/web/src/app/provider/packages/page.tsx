import {
  requireProviderCatalogAccess,
} from "@/lib/auth/session";

import {
  ProviderPackagesClient,
} from "./provider-packages-client";

export default async function ProviderPackagesPage() {
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
    <ProviderPackagesClient
      providerId={account.provider.id}
      eventTypesSupported={
        account.provider.eventTypesSupported
      }
      minGuestsPerEvent={
        account.provider.minGuestsPerEvent
      }
      maxGuestsPerEvent={
        account.provider.maxGuestsPerEvent
      }
    />
  );
}