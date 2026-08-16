import type {Metadata} from "next";
import {headers} from "next/headers";

import {CustomerMarketplaceShell} from "@/components/customer/layout/customer-marketplace-shell";
import {PublicProviderMarketplaceShell} from "@/components/customer/layout/public-provider-marketplace-shell";
import {
  getOptionalAccountContext,
  requireCustomer,
  requireVerifiedEmail,
} from "@/lib/auth/session";
import {
  PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER,
  PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER,
  PUBLIC_PROVIDER_MARKETPLACE_PATH,
} from "@/lib/customer/providers/provider-route-policy";

export const metadata: Metadata = {
  title: {
    default: "FEASTA",
    template: "%s | FEASTA",
  },
  description:
    "Discover catering and event service providers through the FEASTA.",
};

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();

  const publicMarketplaceRequest =
    requestHeaders.get(PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER) === "1";

  const marketplaceReturnTo =
    requestHeaders.get(PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER) ??
    PUBLIC_PROVIDER_MARKETPLACE_PATH;

  if (publicMarketplaceRequest) {
    const account = await getOptionalAccountContext();

    if (account?.role === "customer" && account.emailVerified) {
      return (
        <CustomerMarketplaceShell
          accountLabel={account.email ?? account.uid}
        >
          {children}
        </CustomerMarketplaceShell>
      );
    }

    return (
      <PublicProviderMarketplaceShell
        authReturnTo={marketplaceReturnTo}
      >
        {children}
      </PublicProviderMarketplaceShell>
    );
  }

  const user = requireVerifiedEmail(
    await requireCustomer(),
  );

  return (
    <CustomerMarketplaceShell
      accountLabel={user.email ?? user.uid}
    >
      {children}
    </CustomerMarketplaceShell>
  );
}
