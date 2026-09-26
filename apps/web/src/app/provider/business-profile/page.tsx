import {
  getProviderBusinessProfile,
} from "@/lib/provider/business-profile/provider-business-profile-service";
import {
  getServiceCategoryOptions,
} from "@/lib/service-categories/service-category-service";

import {
  ProviderBusinessProfileClient,
} from "./provider-business-profile-client";

export default async function ProviderBusinessProfilePage() {
  const profile = await getProviderBusinessProfile();
  const serviceCategoryOptions =
    await getServiceCategoryOptions();

  return (
    <ProviderBusinessProfileClient
      initialProfile={profile}
      serviceCategoryOptions={
        serviceCategoryOptions
      }
    />
  );
}
