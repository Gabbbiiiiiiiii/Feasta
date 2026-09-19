import {
  getProviderBusinessProfile,
} from "@/lib/provider/business-profile/provider-business-profile-service";

import {
  ProviderBusinessProfileClient,
} from "./provider-business-profile-client";

export default async function ProviderBusinessProfilePage() {
  const profile = await getProviderBusinessProfile();

  return <ProviderBusinessProfileClient initialProfile={profile} />;
}
