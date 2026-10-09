import {
  getProviderAvailabilitySettings,
} from "@/lib/provider/availability/provider-availability-service";

import {
  ProviderAvailabilityClient,
} from "./provider-availability-client";

export default async function ProviderAvailabilityPage() {
  const settings = await getProviderAvailabilitySettings();

  return <ProviderAvailabilityClient initialSettings={settings} />;
}
