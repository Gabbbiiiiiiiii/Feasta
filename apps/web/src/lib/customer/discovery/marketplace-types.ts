import type {PublicProvider} from "@/lib/customer/providers/provider-types";

export type PublicPackage = {
  id: string;
  providerId: string;
  providerName: string;
  name: string;
  description: string | null;
  eventType: string | null;
  price: number | null;
};

export type CustomerMarketplaceHome = {
  providers: readonly PublicProvider[];
  packages: readonly PublicPackage[];
};
