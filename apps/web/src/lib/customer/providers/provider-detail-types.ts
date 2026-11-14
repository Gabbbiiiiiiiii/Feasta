import type {AddonPricingType} from "@feasta/shared-types";
import type {ServicePortfolio} from "@/lib/provider/service-portfolio";
import type {FreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";
import type {PublicPackage} from "@/lib/customer/discovery/marketplace-types";
import type {ProviderMenuImage} from "@/lib/provider/provider-menu";
import type {ProviderSetup} from "@/lib/provider/provider-setup-gallery";

import type {PublicProvider} from "./provider-types";

export type PublicProviderDetail = {
  provider: PublicProvider;
  packages: readonly PublicPackage[];
  menuImages?: readonly ProviderMenuImage[];
  setups?: readonly ProviderSetup[];
  services?: readonly {
    id: string;
    name: string;
    description: string | null;
    price?: number;
    pricingType?: AddonPricingType;
    freelanceDetails?: FreelanceServiceDetails;
    portfolio?: ServicePortfolio;
  }[];
};
