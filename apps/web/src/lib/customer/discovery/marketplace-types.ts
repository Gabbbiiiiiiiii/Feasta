import type {ProviderEventType} from "@feasta/shared-types";

import type {PublicProvider} from "@/lib/customer/providers/provider-types";


export type PublicPackage = {
  id: string;
  providerId: string;
  providerName: string;
  name: string;
  description: string | null;
  eventType: string | null;
  price: number | null;
  imageUrl: string | null;
  minimumGuests: number | null;
  maximumGuests: number | null;
  inclusions: readonly string[];
};

export type PublicPackageCustomization = {
  foods: readonly string[];
  decorations: readonly string[];
  furniture: readonly string[];
  services: readonly string[];
};

export type PublicPackageDetail = {
  packageRecord: PublicPackage;
  provider: PublicProvider;
  customization: PublicPackageCustomization;
};
export type PackageDiscoveryFilters = {
  eventType: ProviderEventType | "all";
  cursor: string | null;
};

export type PublicEventService = {
  id: string;
  providerId: string;
  providerName: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  imageUrl: string | null;
  source: "catering_provider" | "feasta_addon_provider";
};

export type PublicEventServicePage = {
  services: readonly PublicEventService[];
};

export type PackageDiscoveryPage = {
  packages: readonly PublicPackage[];
  previousCursor: string | null;
  nextCursor: string | null;
  pageSize: number;
};

export type PackageCursor = {
  direction: "next" | "previous";
  createdAtSeconds: number;
  createdAtNanoseconds: number;
  packageId: string;
};

export type CustomerMarketplaceHome = {
  providers: readonly PublicProvider[];
  packages: readonly PublicPackage[];
};
