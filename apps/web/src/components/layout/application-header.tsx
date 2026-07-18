"use client";

import {Bell, CircleUserRound, ChevronDown} from "lucide-react";
import Link from "next/link";
import {useRef} from "react";

import {LogoutButton} from "@/components/auth/logout-button";
import {roleActions, roleHome, roleLabels, type ShellRole} from "@/components/layout/navigation";

type ApplicationHeaderProps = {
  role: ShellRole;
  accountLabel: string;
  pageTitle?: string;
};

function Brand({role}: {role: ShellRole}) {
  return (
    <Link
      href={roleHome[role]}
      className="inline-flex min-h-12 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`FEASTA ${roleLabels[role]} home`}
    >
      <span aria-hidden="true" className="grid size-10 place-items-center rounded-lg bg-primary text-xl font-black text-primary-foreground">F</span>
      <span className="hidden text-xl font-black tracking-tight sm:inline">FEASTA</span>
    </Link>
  );
}

function ApplicationHeader({role, accountLabel, pageTitle}: ApplicationHeaderProps) {
  const actions = roleActions[role];
  const accountDetails = useRef<HTMLDetailsElement>(null);
  const accountSummary = useRef<HTMLElement>(null);

  const closeAccountMenu = () => {
    accountDetails.current?.removeAttribute("open");
    accountSummary.current?.focus();
  };
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex min-h-16 min-w-0 items-center gap-3 px-4 sm:px-6 md:px-8">
        <div className="md:hidden"><Brand role={role} /></div>
        {pageTitle ? (
          <p className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg">{pageTitle}</p>
        ) : (
          <div className="flex-1" />
        )}
        <Link
          href={actions.notificationsHref}
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell aria-hidden="true" className="size-5" />
        </Link>
        <details
          ref={accountDetails}
          className="group relative shrink-0"
          onKeyDown={(event) => {
            if (event.key === "Escape" && accountDetails.current?.open) {
              event.preventDefault();
              closeAccountMenu();
            }
          }}
        >
          <summary
            ref={accountSummary}
            aria-haspopup="true"
            className="flex min-h-12 max-w-56 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
          >
            <CircleUserRound aria-hidden="true" className="size-6 shrink-0" />
            <span className="hidden min-w-0 truncate text-sm font-semibold sm:block">{accountLabel}</span>
            <ChevronDown aria-hidden="true" className="hidden size-4 transition-transform duration-fast group-open:rotate-180 sm:block" />
            <span className="sr-only">Open account menu</span>
          </summary>
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 grid w-64 gap-1 rounded-lg border border-border bg-card p-2 shadow-floating">
            <p className="truncate px-3 py-2 text-sm text-muted-foreground">{accountLabel}</p>
            <Link href={actions.profileHref} className="flex min-h-12 items-center rounded-md px-3 font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Account settings
            </Link>
            <LogoutButton />
          </div>
        </details>
      </div>
    </header>
  );
}

export {ApplicationHeader, Brand, type ApplicationHeaderProps};
