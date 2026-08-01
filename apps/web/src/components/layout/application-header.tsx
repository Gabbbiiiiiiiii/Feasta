"use client";

import {
  ChevronDown,
  Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
} from "react";

import {LogoutButton} from "@/components/auth/logout-button";
import {NotificationMenu} from "@/components/layout/notification-menu";
import {
  roleActions,
  roleHome,
  roleLabels,
  type ShellRole,
} from "@/components/layout/navigation";

type ApplicationHeaderProps = {
  role: ShellRole;
  accountLabel: string;
  pageTitle?: string;
};

type BrandProps = {
  role: ShellRole;
  compact?: boolean;
};

function Brand({role, compact = false}: BrandProps) {
  return (
    <Link
      href={roleHome[role]}
      className="inline-flex min-h-12 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`FEASTA ${roleLabels[role]} home`}
    >
      <Image
        src="/images/feasta_logo.png"
        alt=""
        width={48}
        height={48}
        priority
        className="size-12 shrink-0 object-contain"
      />
      {!compact ? (
        <span className="text-xl font-black tracking-[0.08em] text-foreground">
          FEASTA
        </span>
      ) : null}
    </Link>
  );
}

function ApplicationHeader({
  role,
  accountLabel,
  pageTitle,
}: ApplicationHeaderProps) {
  const actions = roleActions[role];
  const accountDetails = useRef<HTMLDetailsElement>(null);
  const accountSummary = useRef<HTMLElement>(null);

  const closeAccountMenu = () => {
    accountDetails.current?.removeAttribute("open");
    accountSummary.current?.focus();
  };

  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !accountDetails.current?.contains(event.target)
      ) {
        accountDetails.current?.removeAttribute("open");
      }
    };

    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex min-h-16 min-w-0 items-center gap-2 px-4 sm:gap-3 sm:px-6 md:px-8">
        <div className="md:hidden">
          <Brand role={role} />
        </div>

        {pageTitle ? (
          <p className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg">
            {pageTitle}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        <NotificationMenu role={role} />

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
            aria-haspopup="menu"
            aria-label="Open account menu"
            className="flex min-h-12 max-w-64 cursor-pointer list-none items-center gap-2 rounded-xl border border-transparent px-2 transition-colors hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
          >
            <span className="sr-only">Open account menu</span>
            <AccountAvatar label={accountLabel} />
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block truncate text-sm font-bold">
                {accountLabel}
              </span>
              <span className="block text-xs text-muted-foreground">
                {roleLabels[role]}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="hidden size-4 transition-transform duration-fast group-open:rotate-180 sm:block"
            />
          </summary>

          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-72 gap-1 rounded-xl border border-border bg-card p-2 shadow-floating"
          >
            <div className="flex min-w-0 items-center gap-3 border-b border-border px-2 py-3">
              <AccountAvatar label={accountLabel} large />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{accountLabel}</p>
                <p className="text-xs font-medium text-muted-foreground">
                  {roleLabels[role]} account
                </p>
              </div>
            </div>

            <Link
              role="menuitem"
              href={actions.profileHref}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => accountDetails.current?.removeAttribute("open")}
            >
              <Settings aria-hidden="true" className="size-5 text-muted-foreground" />
              Account settings
            </Link>

            <LogoutButton
              destination={
                role === "admin"
                  ? "/admin-login"
                  : role === "provider"
                    ? "/provider-login"
                    : "/login"
              }
            />
          </div>
        </details>
      </div>
    </header>
  );
}

function AccountAvatar({
  label,
  large = false,
}: {
  label: string;
  large?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={
        large
          ? "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-black uppercase text-primary-foreground shadow-sm"
          : "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black uppercase text-primary-foreground shadow-sm ring-2 ring-background"
      }
    >
      {accountInitial(label)}
    </span>
  );
}

function accountInitial(label: string): string {
  const normalized = label.trim();
  if (!normalized) return "F";
  return normalized.charAt(0).toLocaleUpperCase("en-PH");
}

export {
  ApplicationHeader,
  Brand,
  type ApplicationHeaderProps,
};