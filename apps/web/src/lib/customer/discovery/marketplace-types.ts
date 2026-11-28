import type {ServicePortfolio} from "@/lib/provider/service-portfolio";
import type {FreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";
import type {FoodChoiceGroupV2} from "@feasta/shared-types/provider-package-v2";
import type {ProviderEventType} from "@feasta/shared-types";

import type {
  PackageServiceOptions,
  PackageThemeOption,
} from "@/lib/catering/package-offer-configuration";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";


export type PublicPackage = {
  serviceCategoryCode?: string;
  offerStructure?: "fixed" | "customizable";
  paymentTermsSchemaVersion?: 2;
  balanceDueHoursBeforeEvent?: number | null;
  revision?: number;
  sharedContractVersion?: 2;
  maxDropOffOrderQuantity?: number;
  pricingModel?: "per_pax" | "per_bundle";
  occasionScope?: "specific" | "all";
  occasionMatchIds?: readonly string[];
  /** Provider-defined custom occasions shown on provider storefront & package detail only. */
  customOccasionLabels?: readonly string[];
  equipmentInclusions?: readonly string[];
  foodChoiceGroups?: FoodChoiceGroupV2[];
  foodInclusions?: readonly string[];
  id: string;
  providerId: string;
  providerName: string;
  name: string;
  description: string | null;
  eventType: string | null;
  price: number | null;
  paymentPolicy?: "full_payment" | "deposit_then_balance" | null;
  fullPaymentAllowed?: boolean | null;
  depositPercentage?: number | null;
  balanceDueDaysBeforeEvent?: number | null;
  serviceOptions?: PackageServiceOptions;
  themeOptions?: readonly PackageThemeOption[];
  imageUrl: string | null;
  imageUrls?: readonly string[];
  minimumGuests: number | null;
  maximumGuests: number | null;
  inclusions: readonly string[];
  /** Marketplace media (addon) packages link to /customer/packages/media/... */
  detailHref?: string;
  priceSuffix?: string;
  unknownPriceLabel?: string;
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
  portfolio?: ServicePortfolio;
  freelanceDetails?: FreelanceServiceDetails;
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
  currentPage?: number;
  totalCount?: number | null;
  totalPages?: number | null;
};

export type PackageCursor = {
  direction: "next" | "previous";
  createdAtSeconds: number;
  createdAtNanoseconds: number;
  packageId: string;
  page?: number;
};

export type CustomerMarketplaceHome = {
  providers: readonly PublicProvider[];
  packages: readonly PublicPackage[];
};
