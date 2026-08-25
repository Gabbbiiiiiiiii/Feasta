import type {ReactNode} from "react";

import {CustomerMarketplaceHeader} from "@/components/customer/layout/customer-marketplace-header";

export function PublicProviderMarketplaceShell({
  authReturnTo,
  children,
}: {
  authReturnTo: string;
  children: ReactNode;
}) {
  return (
    <div
      data-public-provider-marketplace-shell
      className="min-h-dvh overflow-x-clip bg-[#FFF8F6] text-[#261814]"
    >
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[60] -translate-y-24 rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground shadow-floating transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>

      <CustomerMarketplaceHeader authReturnTo={authReturnTo} />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto min-h-[calc(100dvh-7.25rem)] w-full max-w-[80rem] px-4 py-6 pb-10 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:px-8"
      >
        {children}
      </main>
    </div>
  );
}
