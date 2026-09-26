import type {PublicPackage} from "@/lib/customer/discovery/marketplace-types";
import type {ProviderMenuImage} from "@/lib/provider/provider-menu";

import type {PublicProvider} from "./provider-types";

export type PublicProviderDetail = {
  provider: PublicProvider;
  packages: readonly PublicPackage[];
  menuImages?: readonly ProviderMenuImage[];
  services?: readonly {id: string; name: string; description: string | null}[];
};
