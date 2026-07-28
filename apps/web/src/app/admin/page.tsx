import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Megaphone,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import Link from "next/link";
import { PhilippinePeso } from "lucide-react";

import { SummaryCard } from "@/components/data";
import { PlatformRevenueChart } from "@/components/data/platform-revenue-chart";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getAdminDashboardData } from "../../lib/admin/dashboard/admin-dashboard-data";

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

function formatActivityDate(date: Date | null) {
  if (!date) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
          label="Platform revenue"
          value={pesoFormatter.format(dashboard.statistics.revenue)}
          icon={
            <PhilippinePeso
              aria-hidden="true"
              className="size-6"
            />
          }
        />

        <SummaryCard
          label="Active users"
          value={numberFormatter.format(
            dashboard.statistics.activeUsers,
          )}
          icon={<Users aria-hidden="true" className="size-6" />}
        />

        <SummaryCard
          label="Total bookings"
          value={numberFormatter.format(
            dashboard.statistics.totalBookings,
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
          <PlatformRevenueChart
            data={dashboard.revenueByRange}
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
            Providers with the most completed bookings.
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
                href={`/admin/providers/${provider.id}`}
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
                    bookings
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

function QuickActions({ title }: { title: string }) {
  const actions = [
    {
      label: "Review providers",
      description: "Process pending verification applications.",
      href: "/admin/providers",
      icon: ShieldCheck,
    },
    {
      label: "Monitor bookings",
      description: "Review active and upcoming event bookings.",
      href: "/admin/bookings",
      icon: CalendarDays,
    },
    {
      label: "Manage complaints",
      description: "Resolve customer and provider complaints.",
      href: "/admin/complaints",
      icon: ClipboardList,
    },
    {
      label: "Create announcement",
      description: "Publish an update for platform users.",
      href: "/admin/announcements",
      icon: Megaphone,
    },
  ];

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">{title}</h2>
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
                <Icon aria-hidden="true" className="size-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold">{action.label}</p>
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
    activeUsers: number;
    pendingComplaints: number;
    pendingPayments: number;
    failedPayments: number;
  };
};

function PlatformHealth({
  title,
  health,
}: PlatformHealthProps) {
  const metrics = [
    {
      label: "Active accounts",
      value: health.activeUsers,
    },
    {
      label: "Open complaints",
      value: health.pendingComplaints,
    },
    {
      label: "Pending payments",
      value: health.pendingPayments,
    },
    {
      label: "Failed payments",
      value: health.failedPayments,
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest recorded administrative activity.
          </p>
        </div>

        <Button variant="secondary" size="compact" asChild>
          <Link href="/admin/logs">View all</Link>
        </Button>
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
                  {activity.action}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activity.actorName} · {activity.entity}
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