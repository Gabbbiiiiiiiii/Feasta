import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  CreditCard,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import Link from "next/link";
import { PhilippinePeso } from "lucide-react";

import { SummaryCard } from "@/components/data";
import {
  ConfirmedPaymentVolumeChart,
} from "@/components/data/confirmed-payment-volume-chart";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getAdminDashboardData } from "../../lib/admin/dashboard/admin-dashboard-data";

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function formatCentavos(
  valueInCentavos: number,
): string {
  return pesoFormatter.format(
    valueInCentavos / 100,
  );
}

const numberFormatter = new Intl.NumberFormat("en-US");

function formatActivityDate(date: Date | null) {
  if (!date) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

const activityLabels:
  Record<string, string> = {
    user_account_enabled:
      "User account enabled",

    user_account_disabled:
      "User account disabled",

    user_account_blocked:
      "User account blocked",

    user_account_unblocked:
      "User account unblocked",

    provider_verification_submitted:
      "Provider application submitted",

    provider_verification_under_review:
      "Provider verification review started",

    provider_verification_approved:
      "Provider application approved",

    provider_verification_rejected:
      "Provider application rejected",

    provider_verification_resubmission_required:
      "Provider resubmission requested",

    provider_verification_suspended:
      "Provider verification suspended",

    provider_verification_document_registered:
      "Verification document registered",

    review_hidden:
      "Customer review hidden",

    review_restored:
      "Customer review restored",

    review_report_dismissed:
      "Review report dismissed",

    payment_refund_requested:
      "Payment refund requested",
  };

function humanizeActivityAction(
  action: string,
): string {
  const normalized = action
    .trim()
    .toLowerCase();

  if (activityLabels[normalized]) {
    return activityLabels[normalized];
  }

  const words = normalized
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!words) {
    return "Administrative activity";
  }

  return (
    words.charAt(0).toUpperCase() +
    words.slice(1)
  );
}

function humanizeActivityEntity(
  entity: string,
): string {
  const normalized = entity
    .trim()
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .toLowerCase();

  return normalized || "platform";
}

export default async function AdminPage() {
  await requireRole(["admin"]);

  const dashboard = await getAdminDashboardData();

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title={dashboard.settings.title}
        description={dashboard.settings.subtitle}
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Platform summary"
      >
        <SummaryCard
          label="Confirmed payment volume"
          value={formatCentavos(
            dashboard.statistics
              .confirmedPaymentVolumeInCentavos,
          )}
          icon={
            <PhilippinePeso
              aria-hidden="true"
              className="size-6"
            />
          }
        />

        <SummaryCard
          label="Active accounts"
          value={numberFormatter.format(
            dashboard.statistics.activeAccounts,
          )}
          icon={<Users aria-hidden="true" className="size-6" />}
        />

        <SummaryCard
          label="Active bookings"
          value={numberFormatter.format(
            dashboard.statistics.activeBookings,
          )}
          icon={
            <CalendarDays aria-hidden="true" className="size-6" />
          }
        />

        <SummaryCard
          label="Verification queue"
          value={numberFormatter.format(
            dashboard.statistics.verificationQueue,
          )}
          icon={
            <ShieldCheck aria-hidden="true" className="size-6" />
          }
        />
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <ConfirmedPaymentVolumeChart
            data={
              dashboard.paymentVolumeByRange
            }
          />

          <RecentActivities
            title={dashboard.settings.recentActivitiesTitle}
            activities={dashboard.recentActivities}
          />
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          <TopProviders
            title={dashboard.settings.topProvidersTitle}
            providers={dashboard.topProviders}
          />

          <QuickActions
            title={dashboard.settings.quickActionsTitle}
          />

          <PlatformHealth
            title={dashboard.settings.platformHealthTitle}
            health={dashboard.platformHealth}
          />
        </aside>
      </section>
    </div>
  );
}


type TopProvidersProps = {
  title: string;
  providers: Array<{
    id: string;
    businessName: string;
    serviceType: string;
    completedBookings: number;
  }>;
};

function TopProviders({
  title,
  providers,
}: TopProvidersProps) {
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Active providers ranked by completed bookings.
          </p>
        </div>

        <Store
          aria-hidden="true"
          className="size-5 text-muted-foreground"
        />
      </div>

      {providers.length === 0 ? (
        <p className="mt-5 rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
          No provider ranking is available yet.
        </p>
      ) : (
        <ol className="mt-5 grid gap-3">
          {providers.map((provider, index) => (
            <li key={provider.id}>
              <Link
                href={`/admin/providers?selected=${encodeURIComponent(
                  provider.id,
                )}`}
                className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {provider.businessName}
                  </p>
                  <p className="truncate text-sm capitalize text-muted-foreground">
                    {provider.serviceType.replaceAll("_", " ")}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-bold">
                    {numberFormatter.format(
                      provider.completedBookings,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    completed
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <Button
        variant="ghost"
        className="mt-4 w-full justify-between"
        asChild
      >
        <Link href="/admin/providers">
          View all providers
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </Button>
    </section>
  );
}

function QuickActions({
  title,
}: {
  title: string;
}) {
  const actions = [
    {
      label: "Review providers",
      description:
        "Process pending provider verification applications.",
      href: "/admin/providers",
      icon: ShieldCheck,
    },
    {
      label: "Monitor bookings",
      description:
        "Review active and upcoming event bookings.",
      href: "/admin/bookings",
      icon: CalendarDays,
    },
    {
      label: "Investigate payments",
      description:
        "Review processing, failed, expired, and refundable payments.",
      href: "/admin/payments",
      icon: CreditCard,
    },
    {
      label: "Moderate reviews",
      description:
        "Review reported feedback and moderation decisions.",
      href: "/admin/reviews",
      icon: MessageSquareText,
    },
    {
      label: "Manage accounts",
      description:
        "Review customer and provider account status.",
      href: "/admin/users",
      icon: Users,
    },
  ];

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">
        {title}
      </h2>

      <p className="mt-1 text-sm text-muted-foreground">
        Frequently used administration tools.
      </p>

      <div className="mt-5 grid gap-2">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon
                  aria-hidden="true"
                  className="size-5"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {action.label}
                </p>

                <p className="mt-0.5 text-sm text-muted-foreground">
                  {action.description}
                </p>
              </div>

              <ChevronRight
                aria-hidden="true"
                className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type PlatformHealthProps = {
  title: string;
  health: {
    activeCustomerAccounts: number;
    activeProviderAccounts: number;
    bookingsNeedingAttention: number;
    pendingProcessingPayments: number;
    failedExpiredPayments: number;
    openComplaints: number;
  };
};

function PlatformHealth({
  title,
  health,
}: PlatformHealthProps) {
  const metrics = [
    {
      label: "Active customers",
      value:
        health.activeCustomerAccounts,
    },
    {
      label: "Active providers",
      value:
        health.activeProviderAccounts,
    },
    {
      label: "Active bookings",
      value:
        health.bookingsNeedingAttention,
    },
    {
      label: "Pending / processing payments",
      value:
        health.pendingProcessingPayments,
    },
    {
      label: "Failed / expired payments",
      value:
        health.failedExpiredPayments,
    },
    {
      label: "Open complaints",
      value:
        health.openComplaints,
    },
  ];

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current operational indicators.
          </p>
        </div>

        <Settings
          aria-hidden="true"
          className="size-5 text-muted-foreground"
        />
      </div>

      <dl className="mt-5 divide-y divide-border">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <dt className="text-sm text-muted-foreground">
              {metric.label}
            </dt>
            <dd className="font-bold">
              {numberFormatter.format(metric.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type RecentActivitiesProps = {
  title: string;
  activities: Array<{
    id: string;
    action: string;
    entity: string;
    actorName: string;
    createdAt: Date | null;
  }>;
};

function RecentActivities({
  title,
  activities,
}: RecentActivitiesProps) {
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-card">
      <div>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest recorded administrative activity.
          </p>
        </div>
      </div>

      {activities.length === 0 ? (
        <p className="mt-5 rounded-lg bg-muted/60 p-6 text-center text-sm text-muted-foreground">
          No recent activities are available.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ClipboardList
                  aria-hidden="true"
                  className="size-5"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {humanizeActivityAction(
                    activity.action,
                  )}
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {activity.actorName}
                  {" · "}
                  {humanizeActivityEntity(
                    activity.entity,
                  )}
                </p>
              </div>

              <time className="shrink-0 text-right text-xs text-muted-foreground">
                {formatActivityDate(activity.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}