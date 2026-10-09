import {
  getProviderTaxProfile,
} from "@/lib/provider/tax-profile/provider-tax-profile-service";

import {
  ProviderTaxProfileClient,
} from "./provider-tax-profile-client";

export default async function ProviderTaxProfilePage() {
  const profile =
    await getProviderTaxProfile();

  return (
    <ProviderTaxProfileClient
      initialProfile={profile}
    />
  );
}
