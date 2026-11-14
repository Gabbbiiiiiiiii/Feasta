import type {ReactNode} from "react";
import {MarketplaceWelcomeBanner} from "./marketplace-welcome-banner";

export function ProviderDirectoryShell({children}: {children: ReactNode}) {
  return (
    <div className="-mx-4 -my-6 min-h-[calc(100dvh-4rem)] bg-feasta-canvas px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto flex w-full min-w-0 max-w-[1320px] flex-col gap-5 sm:gap-6">
        <MarketplaceWelcomeBanner />
        <div className="grid min-w-0 gap-5 sm:gap-6">{children}</div>
      </div>
    </div>
  );
}
