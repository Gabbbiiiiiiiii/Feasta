"use client";

import { useState, type ReactNode } from "react";

import { ApplicationHeader } from "@/components/layout/application-header";
import { ApplicationSidebar } from "@/components/layout/application-sidebar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import {
  roleLabels,
  type ShellRole,
} from "@/components/layout/navigation";

type ApplicationShellProps = {
  role: ShellRole;
  accountLabel: string;
  children: ReactNode;
  pageTitle?: string;
};

function ApplicationShell({
  role,
  accountLabel,
  children,
  pageTitle,
}: ApplicationShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(false);

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#F7F8FA] text-foreground">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground shadow-floating transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>

      <div className="flex min-h-dvh min-w-0">
        <ApplicationSidebar
          role={role}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        <div className="min-w-0 max-w-full flex-1 bg-[#F7F8FA] pb-24 md:pb-0">
          <ApplicationHeader
            role={role}
            accountLabel={accountLabel}
            pageTitle={
              pageTitle ??
              `${roleLabels[role]} workspace`
            }
          />

          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto min-h-[calc(100dvh-4rem)] w-full min-w-0 max-w-7xl bg-[#F7F8FA] px-4 py-6 sm:px-6 md:px-8 lg:px-10"
          >
            {children}
          </main>
        </div>
      </div>

      <MobileNavigation role={role} />
    </div>
  );
}

export {
  ApplicationShell,
  type ApplicationShellProps,
};