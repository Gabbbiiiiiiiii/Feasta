import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  CreditCard,
  CircleAlert,
  MessageSquareText,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { PhilippinePeso } from "lucide-react";

import { SummaryCard } from "@/components/data";
import {
  FeastaRevenueChart,
} from "@/components/data/feasta-revenue-chart";
import { PageHeading } from "@/components/layout/page-heading";
import { requireRole } from "@/lib/auth/session";
import { getAdminDashboardData, type AdminDashboardData } from "../../lib/admin/dashboard/admin-dashboard-data";

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

    provider_verification_restored:
      "Provider verification restored",

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
        <Link href="/admin/payments" className="grid min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <SummaryCard
            label="FEASTA Revenue"
            supportingMetric={formatCentavos(dashboard.statistics.revenueLast30DaysInCentavos) + " in the last 30 days"}
            value={formatCentavos(
              dashboard.statistics
                .feastaRevenueInCentavos,
            )}
            icon={
              <PhilippinePeso
                aria-hidden="true"
                className="size-6"
              />
            }
          />
        </Link>

        <Link href="/admin/users" className="grid min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <SummaryCard
            label="Total users"
            supportingMetric={numberFormatter.format(dashboard.statistics.customerAccounts) + " customers / " + numberFormatter.format(dashboard.statistics.providerAccounts) + " providers"}
            value={numberFormatter.format(
              dashboard.statistics.totalUsers,
            )}
            icon={<Users aria-hidden="true" className="size-6" />}
          />
        </Link>

        <Link href="/admin/bookings" className="grid min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <SummaryCard
            label="Total bookings"
            supportingMetric={numberFormatter.format(dashboard.statistics.activeBookings) + " active / " + numberFormatter.format(dashboard.statistics.completedBookings) + " completed"}
            value={numberFormatter.format(
              dashboard.statistics.totalBookings,
            )}
            icon={
              <CalendarDays aria-hidden="true" className="size-6" />
            }
          />
        </Link>

        <Link href="/admin/providers" className="grid min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <SummaryCard
            label="Pending provider verifications"
            supportingMetric={numberFormatter.format(dashboard.statistics.submittedApprovals) + " submitted / " + numberFormatter.format(dashboard.statistics.underReviewApprovals) + " under review"}
            value={numberFormatter.format(
              dashboard.statistics.verificationQueue,
            )}
            icon={
              <ShieldCheck aria-hidden="true" className="size-6" />
            }
          />
        </Link>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <FeastaRevenueChart
            data={
              dashboard.revenueByRange
            }
          />

          <RecentActivities
            title={dashboard.settings.recentActivitiesTitle}
            activities={dashboard.recentActivities}
          />
        </div>

        <aside className="grid min-w-0 content-start gap-6">


          <OperationsOverview
            title={dashboard.settings.operationsOverviewTitle}
            overview={dashboard.operationsOverview}
          />
        </aside>
      </section>
    </div>
  );
}


function OperationsOverview({
  title,
  overview,
}: {
  title: string;
  overview: AdminDashboardData["operationsOverview"];
}) {
  const metrics = [
    { label: "Pending payments", value: overview.pendingProcessingPayments, href: "/admin/payments", icon: CreditCard },
    { label: "Failed or expired payments", value: overview.failedExpiredPayments, href: "/admin/payments", icon: CircleAlert },
    { label: "Reported reviews", value: overview.reportedReviews, href: "/admin/reviews", icon: MessageSquareText },
    { label: "Open complaints", value: overview.openComplaints, href: "/admin/complaints", icon: MessageSquareText },
  ];

  return (
    <section aria-label={title} className="rounded-card border border-border bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Payments, reviews, and complaints needing attention.
      </p>
      <ul className="mt-5 grid gap-2">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <li key={metric.label}>
              <Link
                href={metric.href}
                aria-label={metric.label + ": " + numberFormatter.format(metric.value)}
                className="group flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden="true" className="size-5" />
                </div>
                <span className="min-w-0 flex-1 font-semibold">{metric.label}</span>
                <span className="font-bold">{numberFormatter.format(metric.value)}</span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
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