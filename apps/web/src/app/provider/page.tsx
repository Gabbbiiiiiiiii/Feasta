import {
  CalendarCheck2,
  ClipboardCheck,
  PackageOpen,
} from "lucide-react";
import Link from "next/link";

import {
  LimitedProviderDashboard,
} from "@/components/provider/limited-provider-dashboard";
import {
  ChartContainer,
  SummaryCard,
} from "@/components/data";
import {
  PageHeading,
} from "@/components/layout/page-heading";
import {
  StatusBadge,
} from "@/components/shared/status-badge";
import {
  Button,
} from "@/components/ui/button";
import {
  requireProvider,
  requireProviderIdentityAccess,
} from "@/lib/auth/session";
import {
  getProviderDashboardData,
} from "@/lib/provider/dashboard/provider-dashboard-service";
import {
  getLimitedProviderDashboardData,
} from "@/lib/provider/dashboard/limited-provider-dashboard-service";

export default async function ProviderPage() {
  const account = requireProviderIdentityAccess(
    await requireProvider(),
  );

  if (!account.emailVerified) {
    return (
      <LimitedProviderDashboard
        dashboard={await getLimitedProviderDashboardData()}
      />
    );
  }

  const dashboard =
    await getProviderDashboardData();

  const hasBookingActivity =
    dashboard.bookingActivity.some(
      (point) =>
        point.confirmed > 0,
    );

  const maxActivity =
    Math.max(
      1,
      ...dashboard.bookingActivity.map(
        (point) =>
          point.confirmed,
      ),
    );

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Provider overview"
        title="Business dashboard"
        description={
          "Monitor requests, packages, and confirmed events for your FEASTA business."
        }
        actions={
          <Button
            asChild
            variant="secondary"
          >
            <Link href="/provider/verification">
              View verification
            </Link>
          </Button>
        }
      />

      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Provider status"
      >
        <span className="font-semibold">
          Verification:
        </span>

        <StatusBadge status="approved" />
      </div>

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Business summary"
      >
        <SummaryCard
          label="Active requests"
          value={
            dashboard.summary
              .activeRequests
          }
          icon={
            <ClipboardCheck className="size-6" />
          }
        />

        <SummaryCard
          label="Published packages"
          value={
            dashboard.summary
              .publishedPackages
          }
          icon={
            <PackageOpen className="size-6" />
          }
        />

        <SummaryCard
          label="Confirmed events"
          value={
            dashboard.summary
              .confirmedEvents
          }
          icon={
            <CalendarCheck2 className="size-6" />
          }
        />
      </section>

      <ChartContainer
        title="Booking activity"
        description={
          "Confirmed provider events recorded during the last 7 days."
        }
        empty={!hasBookingActivity}
        fallbackSummary={
          hasBookingActivity
            ? createActivitySummary(
                dashboard.bookingActivity,
              )
            : "No confirmed booking activity is available for the last 7 days."
        }
      >
        <div
          className="flex min-h-64 min-w-[32rem] items-end gap-3 pt-6"
          role="img"
          aria-label="Confirmed booking activity for the last 7 days"
        >
          {dashboard.bookingActivity.map(
            (point) => {
              const height =
                point.confirmed === 0
                  ? 4
                  : Math.max(
                      12,
                      Math.round(
                        (point.confirmed /
                          maxActivity) *
                          100,
                      ),
                    );

              return (
                <div
                  key={point.date}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                >
                  <span className="text-sm font-bold text-foreground">
                    {point.confirmed}
                  </span>

                  <div className="flex h-40 w-full items-end justify-center">
                    <div
                      className="w-full max-w-12 rounded-t-md bg-primary transition-[height]"
                      style={{
                        height: `${height}%`,
                      }}
                      title={
                        `${point.label}: ` +
                        `${point.confirmed} confirmed`
                      }
                    />
                  </div>

                  <span className="text-xs font-medium text-muted-foreground">
                    {point.label}
                  </span>
                </div>
              );
            },
          )}
        </div>
      </ChartContainer>
    </div>
  );
}

function createActivitySummary(
  activity: readonly {
    label: string;
    confirmed: number;
  }[],
): string {
  return activity
    .map(
      (point) =>
        `${point.label}: ${point.confirmed} confirmed`,
    )
    .join(", ");
}
