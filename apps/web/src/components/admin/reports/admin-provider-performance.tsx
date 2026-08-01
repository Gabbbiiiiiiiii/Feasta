import {
  BadgeCheck,
  CalendarCheck2,
  Clock3,
  Inbox,
  Star,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type {ReactNode} from "react";

import type {
  AdminProviderPerformance as AdminProviderPerformanceData,
  AdminProviderPerformanceRow,
} from "@/lib/admin/reports/admin-report-types";

type AdminProviderPerformanceProps = {
  report: AdminProviderPerformanceData;
};

export function AdminProviderPerformance({
  report,
}: AdminProviderPerformanceProps) {
  const providers = report.providers;
  const totals = summarizeProviders(providers);

  return (
    <section
      aria-labelledby="provider-performance-heading"
      className="grid gap-4"
    >
      <div>
        <h2 id="provider-performance-heading" className="text-xl font-black">
          Provider performance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Provider participation, request outcomes, service delivery, ratings,
          and provider-associated payment volume for the selected period.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ProviderMetricCard
          label="Active providers"
          value={formatCount(providers.length)}
          detail="Providers with request or payment activity"
          icon={<UsersRound className="size-5" />}
        />
        <ProviderMetricCard
          label="Requests received"
          value={formatCount(totals.requests)}
          detail={`${formatPercent(totals.acceptanceRate)} accepted`}
          icon={<Inbox className="size-5" />}
        />
        <ProviderMetricCard
          label="Completed events"
          value={formatCount(totals.completed)}
          detail={`${formatCount(totals.confirmed)} currently confirmed`}
          icon={<CalendarCheck2 className="size-5" />}
        />
        <ProviderMetricCard
          label="Confirmed payment volume"
          value={formatCentavos(totals.paymentVolume)}
          detail="Provider-associated; not FEASTA revenue"
          icon={<WalletCards className="size-5" />}
        />
      </div>

      {providers.length === 0 ? (
        <ProviderEmptyState />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
            <ProviderRanking
              providers={providers}
              minimumReviews={report.minimumReviewsForRatingRanking}
            />
            <ProviderActivitySummary providers={providers} />
          </div>
          <ProviderPerformanceTable
            providers={providers}
            minimumReviews={report.minimumReviewsForRatingRanking}
          />
        </>
      )}
    </section>
  );
}

function ProviderRanking({
  providers,
  minimumReviews,
}: {
  providers: AdminProviderPerformanceRow[];
  minimumReviews: number;
}) {
  const ranked = providers.slice(0, 5);
  const maximum = Math.max(
    1,
    ...ranked.map((provider) => provider.confirmedPaymentVolumeInCentavos),
  );

  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <h3 className="font-bold">Provider activity ranking</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Ordered by confirmed payment volume, then completed events. This is an
        operational ranking, not a FEASTA revenue ranking.
      </p>
      <ol className="mt-5 grid gap-4">
        {ranked.map((provider, index) => (
          <li key={provider.providerId} className="grid gap-2">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{provider.providerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {serviceTypeLabel(provider.serviceType)} · {formatCount(provider.completedEvents)} completed
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-black">{provider.formattedConfirmedPaymentVolume}</p>
                <ProviderRating provider={provider} minimumReviews={minimumReviews} compact />
              </div>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={`${provider.providerName} share relative to the leading provider`}
              aria-valuemin={0}
              aria-valuemax={maximum}
              aria-valuenow={provider.confirmedPaymentVolumeInCentavos}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.max(
                    provider.confirmedPaymentVolumeInCentavos > 0 ? 2 : 0,
                    (provider.confirmedPaymentVolumeInCentavos / maximum) * 100,
                  )}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function ProviderActivitySummary({
  providers,
}: {
  providers: AdminProviderPerformanceRow[];
}) {
  const groups = (["catering", "addon", "both"] as const).map((serviceType) => ({
    serviceType,
    count: providers.filter((provider) => provider.serviceType === serviceType).length,
  }));
  const total = Math.max(1, providers.length);
  const responseTimes = providers.flatMap((provider) =>
    provider.averageResponseTimeInMinutes === null
      ? []
      : [provider.averageResponseTimeInMinutes],
  );
  const averageResponse = responseTimes.length === 0
    ? null
    : responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length;

  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <h3 className="font-bold">Provider participation</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Active providers grouped by their configured service type.
      </p>
      <dl className="mt-5 grid gap-4">
        {groups.map((group) => (
          <div key={group.serviceType}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="font-semibold">{serviceTypeLabel(group.serviceType)}</dt>
              <dd className="font-black">{formatCount(group.count)}</dd>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{width: `${(group.count / total) * 100}%`}}
              />
            </div>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <CompactMetric
          icon={<Clock3 className="size-4" />}
          label="Avg. provider response"
          value={formatDuration(averageResponse)}
        />
        <CompactMetric
          icon={<BadgeCheck className="size-4" />}
          label="Providers completing events"
          value={formatCount(providers.filter((provider) => provider.completedEvents > 0).length)}
        />
      </div>
    </article>
  );
}

function ProviderPerformanceTable({
  providers,
  minimumReviews,
}: {
  providers: AdminProviderPerformanceRow[];
  minimumReviews: number;
}) {
  return (
    <article className="min-w-0 rounded-card border border-border bg-card shadow-card">
      <div className="p-4 sm:p-5">
        <h3 className="font-bold">Provider performance details</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ratings are labeled as qualified only after at least {minimumReviews} published reviews.
        </p>
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[76rem] border-collapse text-left text-sm">
          <caption className="sr-only">Provider performance for the selected reporting period</caption>
          <thead className="border-y border-border bg-muted/40">
            <tr>
              {[
                "Provider",
                "Requests",
                "Accepted",
                "Rejected",
                "Confirmed",
                "Completed",
                "Cancelled",
                "Avg. response",
                "Rating",
                "Payment volume",
              ].map((heading) => (
                <th key={heading} scope="col" className="whitespace-nowrap px-4 py-3 font-bold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {providers.map((provider) => (
              <tr key={provider.providerId} className="align-top hover:bg-muted/20">
                <td className="px-4 py-4">
                  <p className="font-bold">{provider.providerName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {serviceTypeLabel(provider.serviceType)}
                    {provider.providerCategory ? ` · ${titleCase(provider.providerCategory)}` : ""}
                  </p>
                </td>
                <td className="px-4 py-4 font-semibold">{formatCount(provider.requestsReceived)}</td>
                <RateCell count={provider.acceptedRequests} rate={provider.acceptanceRate} />
                <RateCell count={provider.rejectedRequests} rate={provider.rejectionRate} />
                <td className="px-4 py-4">{formatCount(provider.confirmedBookings)}</td>
                <td className="px-4 py-4">{formatCount(provider.completedEvents)}</td>
                <RateCell count={provider.cancelledRequests} rate={provider.cancellationRate} />
                <td className="whitespace-nowrap px-4 py-4">{formatDuration(provider.averageResponseTimeInMinutes)}</td>
                <td className="px-4 py-4">
                  <ProviderRating provider={provider} minimumReviews={minimumReviews} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-black">
                  {provider.formattedConfirmedPaymentVolume}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 p-4 lg:hidden">
        {providers.map((provider) => (
          <article key={provider.providerId} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate font-bold">{provider.providerName}</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {serviceTypeLabel(provider.serviceType)}
                </p>
              </div>
              <p className="shrink-0 font-black">{provider.formattedConfirmedPaymentVolume}</p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <MobileDetail label="Requests" value={formatCount(provider.requestsReceived)} />
              <MobileDetail label="Accepted" value={`${provider.acceptedRequests} · ${formatPercent(provider.acceptanceRate)}`} />
              <MobileDetail label="Completed" value={formatCount(provider.completedEvents)} />
              <MobileDetail label="Cancelled" value={`${provider.cancelledRequests} · ${formatPercent(provider.cancellationRate)}`} />
              <MobileDetail label="Avg. response" value={formatDuration(provider.averageResponseTimeInMinutes)} />
              <div>
                <dt className="text-muted-foreground">Rating</dt>
                <dd className="mt-1"><ProviderRating provider={provider} minimumReviews={minimumReviews} compact /></dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </article>
  );
}

function ProviderMetricCard({label, value, detail, icon}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <span className="text-primary" aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

function ProviderRating({provider, minimumReviews, compact = false}: {
  provider: AdminProviderPerformanceRow;
  minimumReviews: number;
  compact?: boolean;
}) {
  const qualified = provider.publishedReviewCount >= minimumReviews;
  if (provider.publishedReviewCount === 0) {
    return <span className="text-xs text-muted-foreground">No reviews</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
      <strong>{provider.averageRating.toFixed(1)}</strong>
      <span className="text-muted-foreground">({provider.publishedReviewCount})</span>
      {!compact && (
        <span className={qualified ? "text-success" : "text-muted-foreground"}>
          {qualified ? "Qualified" : `Needs ${minimumReviews - provider.publishedReviewCount} more`}
        </span>
      )}
    </span>
  );
}

function RateCell({count, rate}: {count: number; rate: number}) {
  return (
    <td className="whitespace-nowrap px-4 py-4">
      {formatCount(count)} <span className="text-xs text-muted-foreground">· {formatPercent(rate)}</span>
    </td>
  );
}

function CompactMetric({icon, label, value}: {icon: ReactNode; label: string; value: string}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</p>
      <p className="mt-2 font-black">{value}</p>
    </div>
  );
}

function MobileDetail({label, value}: {label: string; value: string}) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>;
}

function ProviderEmptyState() {
  return (
    <div className="grid min-h-64 place-items-center rounded-card border border-dashed border-border bg-card p-6 text-center shadow-card">
      <div>
        <UsersRound className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 font-bold">No provider activity found</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          No provider received a request or had a payment recorded during this reporting period.
        </p>
      </div>
    </div>
  );
}

function summarizeProviders(providers: AdminProviderPerformanceRow[]) {
  const requests = providers.reduce((sum, provider) => sum + provider.requestsReceived, 0);
  const accepted = providers.reduce((sum, provider) => sum + provider.acceptedRequests, 0);
  return {
    requests,
    acceptanceRate: requests === 0 ? 0 : (accepted / requests) * 100,
    completed: providers.reduce((sum, provider) => sum + provider.completedEvents, 0),
    confirmed: providers.reduce((sum, provider) => sum + provider.confirmedBookings, 0),
    paymentVolume: providers.reduce(
      (sum, provider) => sum + provider.confirmedPaymentVolumeInCentavos,
      0,
    ),
  };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-PH").format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCentavos(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value / 100);
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "Not available";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hr`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

function serviceTypeLabel(value: AdminProviderPerformanceRow["serviceType"]): string {
  if (value === "catering") return "Catering";
  if (value === "addon") return "Add-on services";
  return "Catering and add-ons";
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}