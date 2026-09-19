"use client";

import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  History,
  LoaderCircle,
  Mail,
  Phone,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { AdminUserAvatar } from "@/components/admin/users/admin-user-avatar";
import type {
  AdminUser,
  AdminUserActivityEntry,
  AdminUserBookingSummary,
  AdminUserDetails,
  AdminUserVerificationDocument,
} from "@/lib/admin/users/admin-user-types";
import { cn } from "@/lib/utils";

type UserDetailsContentProps = {
  user: AdminUser;
  details?: AdminUserDetails | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
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

function humanizeValue(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) =>
      character.toUpperCase(),
    );
}

function DetailTabLoading() {
  return (
    <div
      className="grid min-h-48 place-items-center rounded-xl border border-border bg-muted/20 p-6"
      aria-label="Loading account details"
    >
      <div className="grid justify-items-center gap-3 text-center">
        <LoaderCircle
          aria-hidden="true"
          className="size-6 animate-spin text-primary motion-reduce:animate-none"
        />

        <p className="text-sm text-muted-foreground">
          Loading account details…
        </p>
      </div>
    </div>
  );
}

function DetailTabError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="grid min-h-48 place-items-center rounded-xl border border-red-200 bg-red-50 p-6 text-center"
    >
      <div>
        <p className="font-semibold text-red-700">
          Account details could not be loaded
        </p>

        <p className="mt-1 text-sm text-red-600">
          {message}
        </p>

        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 min-h-10 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyDetailTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
      <div>
        <p className="font-semibold text-foreground">
          {title}
        </p>

        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function BookingDetailsTab({
  bookings,
}: {
  bookings: AdminUserBookingSummary[];
}) {
  if (bookings.length === 0) {
    return (
      <EmptyDetailTab
        title="No booking activity"
        description="No bookings are associated with this account."
      />
    );
  }

  return (
    <section aria-labelledby="user-bookings-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4
            id="user-bookings-heading"
            className="font-bold"
          >
            Recent bookings
          </h4>

          <p className="mt-1 text-sm text-muted-foreground">
            Showing up to 10 recent records.
          </p>
        </div>

        <CalendarDays
          aria-hidden="true"
          className="size-5 text-primary"
        />
      </div>

      <ul className="mt-3 grid gap-3">
        {bookings.map((booking) => (
          <li
            key={`${booking.relationship}:${booking.id}`}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {booking.reference}
                </p>

                <p className="mt-1 text-sm capitalize text-muted-foreground">
                  {humanizeValue(
                    booking.eventType,
                  )}
                  {booking.city
                    ? ` · ${booking.city}`
                    : ""}
                </p>
              </div>

              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground">
                {humanizeValue(
                  booking.bookingStatus,
                )}
              </span>
            </div>

            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Event date
                </dt>
                <dd className="mt-0.5">
                  {formatDate(
                    booking.eventDate,
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground">
                  Created
                </dt>
                <dd className="mt-0.5">
                  {formatDate(
                    booking.createdAt,
                  )}
                </dd>
              </div>

              {booking.providerRequestStatus ? (
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Provider request
                  </dt>
                  <dd className="mt-0.5 capitalize">
                    {humanizeValue(
                      booking.providerRequestStatus,
                    )}
                  </dd>
                </div>
              ) : null}

              {booking.paymentStatus ? (
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Payment
                  </dt>
                  <dd className="mt-0.5 capitalize">
                    {humanizeValue(
                      booking.paymentStatus,
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityDetailsTab({
  activity,
}: {
  activity: AdminUserActivityEntry[];
}) {
  if (activity.length === 0) {
    return (
      <EmptyDetailTab
        title="No recorded activity"
        description="No administrative or account activity is available for this account."
      />
    );
  }

  return (
    <section aria-labelledby="user-activity-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4
            id="user-activity-heading"
            className="font-bold"
          >
            Recent account activity
          </h4>

          <p className="mt-1 text-sm text-muted-foreground">
            Authorized audit records related to this account.
          </p>
        </div>

        <History
          aria-hidden="true"
          className="size-5 text-primary"
        />
      </div>

      <ol className="mt-3 grid gap-3">
        {activity.map((entry) => (
          <li
            key={entry.id}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">
                {humanizeValue(entry.action)}
              </p>

              <time className="text-xs text-muted-foreground">
                {formatDate(entry.createdAt)}
              </time>
            </div>

            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {humanizeValue(
                entry.actorRole,
              )}
              {entry.source
                ? ` · ${humanizeValue(
                    entry.source,
                  )}`
                : ""}
            </p>

            {entry.reason ? (
              <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {entry.reason}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DocumentDetailsTab({
  documents,
}: {
  documents:
    AdminUserVerificationDocument[];
}) {
  if (documents.length === 0) {
    return (
      <EmptyDetailTab
        title="No verification documents"
        description="No verification documents are available for this provider."
      />
    );
  }

  return (
    <section aria-labelledby="user-documents-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4
            id="user-documents-heading"
            className="font-bold"
          >
            Verification documents
          </h4>

          <p className="mt-1 text-sm text-muted-foreground">
            Files are delivered through the protected admin endpoint.
          </p>
        </div>

        <FileText
          aria-hidden="true"
          className="size-5 text-primary"
        />
      </div>

      <ul className="mt-3 grid gap-3">
        {documents.map((document) => (
          <li
            key={document.id}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileText
                  aria-hidden="true"
                  className="size-5"
                />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {document.title}
                    </p>

                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {document.fileName}
                    </p>
                  </div>

                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">
                    {humanizeValue(
                      document.status,
                    )}
                  </span>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {document.fileSize}
                  {" · "}
                  {formatDate(
                    document.uploadedAt,
                  )}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={document.viewPath}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold transition hover:bg-muted"
                  >
                    <ExternalLink
                      aria-hidden="true"
                      className="size-4"
                    />
                    View
                  </a>

                  <a
                    href={document.downloadPath}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold transition hover:bg-muted"
                  >
                    <Download
                      aria-hidden="true"
                      className="size-4"
                    />
                    Download
                  </a>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UserDetailsContent({
  user,
  details = null,
  loading = false,
  error = null,
  onRetry,
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
                  verified={
                    user.isEmailVerified
                  }
                />
              </DetailRow>

              <DetailRow label="Phone verified">
                <VerificationValue
                  verified={
                    user.isPhoneVerified
                  }
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
                  {user.providerServiceType
                    ?.replaceAll("_", " ") ??
                    "Not available"}
                </DetailRow>

                <DetailRow label="Category">
                  {user.providerCategory
                    ?.replaceAll("_", " ") ??
                    "Not available"}
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
      ) : loading ? (
        <DetailTabLoading />
      ) : error ? (
        <DetailTabError
          message={error}
          onRetry={onRetry}
        />
      ) : !details ? (
        <EmptyDetailTab
          title="Details unavailable"
          description="Open this account again to load its details."
        />
      ) : selectedTab === "bookings" ? (
        <BookingDetailsTab
          bookings={details.bookings}
        />
      ) : selectedTab === "activity" ? (
        <ActivityDetailsTab
          activity={details.activity}
        />
      ) : selectedTab === "documents" ? (
        <DocumentDetailsTab
          documents={details.documents}
        />
      ) : null}
    </div>
  );
}

export {
  UserDetailsContent,
  type UserDetailsContentProps,
};