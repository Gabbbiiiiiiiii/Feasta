import {ProviderMenuManager} from "./provider-menu-manager";
import {providerContentCapabilities} from "@/lib/provider/provider-content-capabilities";
import Link from "next/link";

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

  const capabilities = providerContentCapabilities(account.provider.providerServiceType, account.provider.serviceCategories);

  return (
    <div className="grid gap-6">
    {capabilities.packages ? <ProviderPackagesClient
      providerServiceType={account.provider.providerServiceType}
      serviceCategories={account.provider.serviceCategories}
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
    /> : <section className="rounded-xl border border-border bg-card p-6"><h1 className="text-2xl font-bold">Your service catalog</h1><p className="mt-2 text-muted-foreground">Manage your service offerings in Services.</p><Link href="/provider/services" className="mt-3 inline-flex min-h-11 items-center font-bold text-primary-strong underline focus-visible:ring-2 focus-visible:ring-primary">Manage services</Link></section>}
    {capabilities.catering && account.provider.verificationStatus === "approved" ? <ProviderMenuManager /> : null}
    </div>
  );
}
