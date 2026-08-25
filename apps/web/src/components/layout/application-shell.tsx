"use client";

import { useState, type ReactNode } from "react";

import { ApplicationHeader } from "@/components/layout/application-header";
import { ApplicationSidebar } from "@/components/layout/application-sidebar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import {
  roleLabels,
  type ProviderNavigationContext,
  type ShellRole,
} from "@/components/layout/navigation";

type ApplicationShellProps = {
  role: ShellRole;
  accountLabel: string;
  children: ReactNode;
  pageTitle?: string;
  providerContext?: ProviderNavigationContext;
};

function ApplicationShell({
  role,
  accountLabel,
  children,
  pageTitle,
  providerContext,
}: ApplicationShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(false);

  return (
    <div
        data-application-shell
        className="min-h-dvh overflow-x-clip bg-[#F7F8FA] text-foreground"
      >
      <a
        data-print-hidden
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground shadow-floating transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>

      <div className="flex min-h-dvh min-w-0">
        <div className="contents print:hidden">
          <ApplicationSidebar
            role={role}
            providerContext={providerContext}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
          />
        </div>

        <div className="min-w-0 max-w-full flex-1 bg-[#F7F8FA] pb-24 md:pb-0">
          <div className="print:hidden">
            <ApplicationHeader
              role={role}
              accountLabel={accountLabel}
              showNotifications={
                providerContext?.kind !== "identity-limited"
              }
              pageTitle={
                pageTitle ??
                `${roleLabels[role]} workspace`
              }
            />
          </div>

          <main
            data-print-main
            id="main-content"
            tabIndex={-1}
            className="mx-auto min-h-[calc(100dvh-4rem)] w-full min-w-0 max-w-7xl bg-[#F7F8FA] px-4 py-6 sm:px-6 md:px-8 lg:px-10"
          >
            {children}
          </main>
        </div>
      </div>

      <div className="print:hidden">
        <MobileNavigation
          role={role}
          providerContext={providerContext}
        />
      </div>
    </div>
  );
}

export {
  ApplicationShell,
  type ApplicationShellProps,
};
