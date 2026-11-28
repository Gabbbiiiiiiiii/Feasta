import {
  ArrowUpRight,
  Award,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";

import { SummaryCard } from "@/components/data";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { filledRatingStarClassName } from "@/components/ui/rating-styles";
import { requireRole } from "@/lib/auth/session";
import {
  getAdminDashboardData,
  type AdminDashboardData,
} from "../../lib/admin/dashboard/admin-dashboard-data";

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
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Platform summary"
      >
        <Link
          href="/admin/users"
          className="grid min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SummaryCard
            label="Total users"
            supportingMetric={`${numberFormatter.format(dashboard.statistics.customerAccounts)} customers · ${numberFormatter.format(dashboard.statistics.providerAccounts)} providers`}
            value={numberFormatter.format(dashboard.statistics.totalUsers)}
            icon={<Users aria-hidden="true" className="size-6" />}
          />
        </Link>

        <Link
          href="/admin/bookings"
          className="grid min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SummaryCard
            label="Total bookings"
            supportingMetric={`${numberFormatter.format(dashboard.statistics.activeBookings)} active · ${numberFormatter.format(dashboard.statistics.completedBookings)} completed`}
            value={numberFormatter.format(dashboard.statistics.totalBookings)}
            icon={<CalendarDays aria-hidden="true" className="size-6" />}
          />
        </Link>

        <Link
          href="/admin/providers"
          className="grid min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SummaryCard
            label="Pending provider verifications"
            supportingMetric={`${numberFormatter.format(dashboard.statistics.submittedApprovals)} submitted · ${numberFormatter.format(dashboard.statistics.underReviewApprovals)} under review`}
            value={numberFormatter.format(dashboard.statistics.verificationQueue)}
            icon={<ShieldCheck aria-hidden="true" className="size-6" />}
          />
        </Link>

        <Link
          href="/admin/complaints"
          className="grid min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SummaryCard
            label="Open complaints"
            value={numberFormatter.format(
              dashboard.operationsOverview.openComplaints,
            )}
            supportingMetric="View complaints queue"
            icon={<CircleAlert aria-hidden="true" className="size-6" />}
            className={
              dashboard.operationsOverview.openComplaints > 0
                ? "border-amber-300 bg-amber-50/40"
                : undefined
            }
          />
        </Link>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <ProviderPerformancePanel
            title={dashboard.settings.topProvidersTitle}
            summary={dashboard.providerPerformance}
            topProviders={dashboard.topProviders}
          />
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          <RecentActivities
            title={dashboard.settings.recentActivitiesTitle}
            activities={dashboard.recentActivities}
          />
        </aside>
      </section>
    </div>
  );
}

function ProviderPerformancePanel({
  title,
  summary,
  topProviders,
}: {
  title: string;
  summary: AdminDashboardData["providerPerformance"];
  topProviders: AdminDashboardData["topProviders"];
}) {
  return (
    <section
      aria-label={title}
      className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Top active providers ranked by completed bookings and customer ratings.
          </p>
        </div>

        <Button asChild variant="secondary" size="compact">
          <Link href="/admin/reports">
            <span>View full report</span>
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Active providers
            </span>
            <Store aria-hidden="true" className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-primary">
            {numberFormatter.format(summary.activeProvidersCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Live & accepting bookings
          </p>
        </div>

        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Most booked
            </span>
            <TrendingUp aria-hidden="true" className="size-4 text-primary" />
          </div>
          {summary.mostBookedProvider ? (
            <>
              <p className="mt-2 truncate text-base font-bold text-foreground">
                {summary.mostBookedProvider.businessName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {numberFormatter.format(summary.mostBookedProvider.totalBookings)}{" "}
                {summary.mostBookedProvider.totalBookings === 1 ? "booking" : "bookings"}
                {" · "}
                {numberFormatter.format(summary.mostBookedProvider.completedBookings)} completed
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No bookings yet</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Highest rated
            </span>
            <Award aria-hidden="true" className="size-4 text-primary" />
          </div>
          {summary.highestRatedProvider ? (
            <>
              <p className="mt-2 truncate text-base font-bold text-foreground">
                {summary.highestRatedProvider.businessName}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Star
                  aria-hidden="true"
                  className={`size-3.5 ${filledRatingStarClassName}`}
                />
                <span className="font-semibold text-foreground">
                  {summary.highestRatedProvider.ratingAverage.toFixed(1)}
                </span>
                <span>
                  ({numberFormatter.format(summary.highestRatedProvider.reviewCount)}{" "}
                  {summary.highestRatedProvider.reviewCount === 1 ? "review" : "reviews"})
                </span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No reviews yet</p>
          )}
        </div>
      </div>

      {topProviders.length === 0 ? (
        <p className="mt-5 rounded-xl bg-muted/60 p-6 text-center text-sm text-muted-foreground">
          No active providers have recorded bookings or reviews yet.
        </p>
      ) : (
        <ol className="mt-5 divide-y divide-border" aria-label="Top providers">
          {topProviders.map((provider, index) => (
            <li key={provider.id}>
              <Link
                href={provider.href}
                className="group flex flex-wrap items-center gap-3 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-nowrap sm:rounded-xl sm:px-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-black text-primary">
                  #{index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-foreground group-hover:text-primary">
                    {provider.businessName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {provider.serviceCategory}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-4 text-right text-sm">
                  <div>
                    <p className="font-bold tabular-nums text-foreground">
                      {numberFormatter.format(provider.completedBookings)} completed
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {numberFormatter.format(provider.totalBookings)}{" "}
                      {provider.totalBookings === 1 ? "total booking" : "total bookings"}
                    </p>
                  </div>

                  <div className="min-w-[4.75rem]">
                    {provider.reviewCount > 0 ? (
                      <p className="inline-flex items-center justify-end gap-1 font-bold tabular-nums text-foreground">
                        <Star
                          aria-hidden="true"
                          className={`size-3.5 ${filledRatingStarClassName}`}
                        />
                        {provider.ratingAverage.toFixed(1)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No reviews</p>
                    )}
                    {provider.reviewCount > 0 ? (
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {numberFormatter.format(provider.reviewCount)}{" "}
                        {provider.reviewCount === 1 ? "review" : "reviews"}
                      </p>
                    ) : null}
                  </div>

                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RecentActivities({
  title,
  activities,
}: {
  title: string;
  activities: AdminDashboardData["recentActivities"];
}) {
  return (
    <section
      aria-label={title}
      className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest state, payment, and security events.
          </p>
        </div>

        <Link
          href="/admin/audit-logs"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:underline"
        >
          <span>View all</span>
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      {activities.length === 0 ? (
        <p className="mt-5 rounded-xl bg-muted/60 p-6 text-center text-sm text-muted-foreground">
          No recent activities are available.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border">
          {activities.map((activity) => (
            <li key={activity.id} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={activity.href}
                className="group flex items-start gap-3 rounded-lg transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ClipboardList aria-hidden="true" className="size-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary">
                    {activity.actionLabel}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {activity.actorName} · {activity.entityLabel}
                  </p>
                  <time className="mt-1 block text-[11px] text-muted-foreground/80">
                    {formatActivityDate(activity.createdAt)}
                  </time>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
