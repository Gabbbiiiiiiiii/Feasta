import type {PublicPackage} from "@/lib/customer/discovery/marketplace-types";

import type {PublicProvider} from "./provider-types";

export type PublicProviderDetail = {
  provider: PublicProvider;
  packages: readonly PublicPackage[];
};
