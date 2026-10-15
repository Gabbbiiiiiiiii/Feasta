import type {Metadata} from "next";
import {headers} from "next/headers";

import {CustomerMarketplaceShell} from "@/components/customer/layout/customer-marketplace-shell";
import {PublicProviderMarketplaceShell} from "@/components/customer/layout/public-provider-marketplace-shell";
import {loadAccountManagementProfile} from "@/lib/auth/account-management";
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
import {
  getActiveServiceCategoryOptions,
} from "@/lib/service-categories/service-category-service";

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
  const [
    requestHeaders,
    serviceCategoryOptions,
  ] = await Promise.all([
    headers(),
    getActiveServiceCategoryOptions(),
  ]);

  const publicMarketplaceRequest =
    requestHeaders.get(PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER) === "1";

  const marketplaceReturnTo =
    requestHeaders.get(PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER) ??
    PUBLIC_PROVIDER_MARKETPLACE_PATH;

  if (publicMarketplaceRequest) {
    const account = await getOptionalAccountContext();

    if (account?.role === "customer" && account.emailVerified) {
      const identity = await customerHeaderIdentity(account);
      return (
        <CustomerMarketplaceShell
          accountLabel={account.email ?? account.uid}
          serviceCategoryOptions={serviceCategoryOptions}
          {...identity}
        >
          {children}
        </CustomerMarketplaceShell>
      );
    }

    return (
      <PublicProviderMarketplaceShell
        authReturnTo={marketplaceReturnTo}
        serviceCategoryOptions={serviceCategoryOptions}
      >
        {children}
      </PublicProviderMarketplaceShell>
    );
  }

  const user = requireVerifiedEmail(
    await requireCustomer(),
  );
  const identity = await customerHeaderIdentity(user);

  return (
    <CustomerMarketplaceShell
      accountLabel={user.email ?? user.uid}
      serviceCategoryOptions={serviceCategoryOptions}
      {...identity}
    >
      {children}
    </CustomerMarketplaceShell>
  );
}

async function customerHeaderIdentity(account: Awaited<ReturnType<typeof requireCustomer>>) {
  const profile = await loadAccountManagementProfile(account).catch(() => null);
  return {
    accountFirstName: profile?.firstName ?? "",
    accountLastName: profile?.lastName ?? "",
    accountEmail: profile?.email || account.email || "",
  };
}
