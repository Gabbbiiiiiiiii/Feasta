"use client";

import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Mail,
  Phone,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { AdminUserAvatar } from "@/components/admin/users/admin-user-avatar";
import type { AdminUser } from "@/lib/admin/users/admin-user-types";
import { cn } from "@/lib/utils";

type UserDetailsContentProps = {
  user: AdminUser;
};

type DetailTab =
  | "overview"
  | "bookings"
  | "activity"
  | "documents";

const dateFormatter = new Intl.DateTimeFormat(
  "en-US",
  {
    dateStyle: "medium",
    timeStyle: "short",
  },
);

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not available"
    : dateFormatter.format(date);
}

function VerificationValue({
  verified,
}: {
  verified: boolean;
}) {
  return verified ? (
    <span className="inline-flex items-center gap-1.5 font-semibold text-green-600">
      <CheckCircle2
        aria-hidden="true"
        className="size-4"
      />
      Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500">
      <XCircle
        aria-hidden="true"
        className="size-4"
      />
      Not verified
    </span>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-muted-foreground">
        {label}
      </dt>

      <dd className="min-w-0 break-words text-sm text-foreground">
        {children}
      </dd>
    </div>
  );
}

function UserDetailsContent({
  user,
}: UserDetailsContentProps) {
  const [selectedTab, setSelectedTab] =
    useState<DetailTab>("overview");

  const displayName =
    user.role === "provider" && user.businessName
      ? user.businessName
      : user.fullName;

  const tabs: Array<{
    value: DetailTab;
    label: string;
  }> = [
    {
      value: "overview",
      label: "Overview",
    },
    {
      value: "bookings",
      label: "Bookings",
    },
    {
      value: "activity",
      label: "Activity",
    },
    ...(user.role === "provider"
      ? [
          {
            value: "documents" as const,
            label: "Documents",
          },
        ]
      : []),
  ];

  const copyUserId = async () => {
    await navigator.clipboard.writeText(user.id);
  };

  return (
    <div className="grid gap-5">
      <section className="grid gap-4">
        <div className="flex items-start gap-4">
          <AdminUserAvatar
            user={user}
            size="large"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-lg font-bold">
                {displayName}
              </h3>

              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                  user.accountStatus === "active" &&
                    "bg-green-100 text-green-700",
                  user.accountStatus === "disabled" &&
                    "bg-slate-200 text-slate-700",
                  user.accountStatus === "blocked" &&
                    "bg-red-100 text-red-700",
                )}
              >
                {user.accountStatus}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                  user.role === "provider"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-blue-100 text-blue-700",
                )}
              >
                {user.role}
              </span>

              {user.role === "provider" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold capitalize text-green-700">
                  <BadgeCheck
                    aria-hidden="true"
                    className="size-3.5"
                  />
                  {user.verificationStatus ??
                    "pending"}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground">
          <p className="flex min-w-0 items-center gap-2">
            <Mail
              aria-hidden="true"
              className="size-4 shrink-0 text-blue-500"
            />
            <span className="truncate">
              {user.email || "Email not provided"}
            </span>
          </p>

          <p className="flex items-center gap-2">
            <Phone
              aria-hidden="true"
              className="size-4 shrink-0 text-green-500"
            />
            <span>
              {user.phoneNumber ||
                "Phone not provided"}
            </span>
          </p>

          <div className="flex items-center gap-2">
            <ShieldCheck
              aria-hidden="true"
              className="size-4 shrink-0 text-violet-500"
            />

            <span className="truncate">
              User ID: {user.id.slice(0, 12)}…
            </span>

            <button
              type="button"
              onClick={copyUserId}
              title="Copy complete user ID"
              aria-label="Copy complete user ID"
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy
                aria-hidden="true"
                className="size-3.5"
              />
            </button>
          </div>
        </div>
      </section>

      <nav
        aria-label="User detail sections"
        className="flex overflow-x-auto border-b border-border"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSelectedTab(tab.value)}
            className={cn(
              "relative min-h-11 shrink-0 px-3 text-sm font-semibold text-muted-foreground",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selectedTab === tab.value &&
                "text-foreground after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:bg-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {selectedTab === "overview" ? (
        <div className="grid gap-6">
          <section>
            <h4 className="font-bold">
              Account Information
            </h4>

            <dl className="mt-3 divide-y divide-border rounded-xl border border-border bg-card px-4">
              <DetailRow label="Registered">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays
                    aria-hidden="true"
                    className="size-4 text-blue-500"
                  />
                  {formatDate(user.createdAt)}
                </span>
              </DetailRow>

              <DetailRow label="Last login">
                <span className="inline-flex items-center gap-2">
                  <Clock3
                    aria-hidden="true"
                    className="size-4 text-amber-500"
                  />
                  {formatDate(user.lastLoginAt)}
                </span>
              </DetailRow>

              <DetailRow label="Status">
                <span className="capitalize">
                  {user.accountStatus}
                </span>
              </DetailRow>

              <DetailRow label="Email verified">
                <VerificationValue
                  verified={user.isEmailVerified}
                />
              </DetailRow>

              <DetailRow label="Phone verified">
                <VerificationValue
                  verified={user.isPhoneVerified}
                />
              </DetailRow>
            </dl>
          </section>

          {user.role === "provider" ? (
            <section>
              <h4 className="font-bold">
                Business Information
              </h4>

              <dl className="mt-3 divide-y divide-border rounded-xl border border-border bg-card px-4">
                <DetailRow label="Business name">
                  <span className="inline-flex items-center gap-2">
                    <Building2
                      aria-hidden="true"
                      className="size-4 text-orange-500"
                    />
                    {user.businessName ??
                      "Not available"}
                  </span>
                </DetailRow>

                <DetailRow label="Service type">
                  {user.providerServiceType?.replaceAll(
                    "_",
                    " ",
                  ) ?? "Not available"}
                </DetailRow>

                <DetailRow label="Category">
                  {user.providerCategory?.replaceAll(
                    "_",
                    " ",
                  ) ?? "Not available"}
                </DetailRow>

                <DetailRow label="Verification">
                  <span className="capitalize">
                    {user.verificationStatus ??
                      "pending"}
                  </span>
                </DetailRow>
              </dl>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <div>
            <p className="font-semibold">
              {selectedTab === "bookings" &&
                "Booking details"}
              {selectedTab === "activity" &&
                "Account activity"}
              {selectedTab === "documents" &&
                "Verification documents"}
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Connect this section to its Firestore
              collection in the next implementation phase.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export {
  UserDetailsContent,
  type UserDetailsContentProps,
};