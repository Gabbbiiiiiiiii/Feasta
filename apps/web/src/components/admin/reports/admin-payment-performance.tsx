"use client";

import {
  Banknote,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Clock3,
  RefreshCcw,
  RotateCcw,
  WalletCards,
  Webhook,
} from "lucide-react";
import {useState} from "react";
import type {ReactNode} from "react";

import type {
  AdminPaymentPerformance as AdminPaymentPerformanceData,
  AdminPaymentTrendPoint,
} from "@/lib/admin/reports/admin-report-types";

type AdminPaymentPerformanceProps = {
  report: AdminPaymentPerformanceData;
};

const volumeSeries = [
  {
    key: "collectedVolumeInCentavos",
    label: "Gross collected",
    color: "#ff5f35",
  },
  {
    key: "currentlyPaidVolumeInCentavos",
    label: "Currently paid",
    color: "#2563eb",
  },
  {
    key: "refundedAmountInCentavos",
    label: "Refunded",
    color: "#b45309",
  },
] as const;

export function AdminPaymentPerformance({
  report,
}: AdminPaymentPerformanceProps) {
  return (
    <section aria-labelledby="payment-performance-heading" className="grid gap-4">
      <div>
        <h2 id="payment-performance-heading" className="text-xl font-black">
          Payment performance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Provider-associated payment activity, finalized outcomes, refunds, and gateway-processing health.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PaymentMetricCard
          label="Gross collected volume"
          value={report.grossCollectedVolume.formattedValue}
          detail="Currently paid plus subsequently refunded payments"
          icon={<Banknote className="size-5" />}
        />
        <PaymentMetricCard
          label="Confirmed payment volume"
          value={report.confirmedPaymentVolume.formattedValue}
          detail="Payments that currently remain in paid status"
          icon={<CircleCheck className="size-5" />}
          tone="positive"
        />
        <PaymentMetricCard
          label="Provider-associated volume"
          value={report.providerAssociatedVolume.formattedValue}
          detail="Collected volume less completed full refunds"
          icon={<WalletCards className="size-5" />}
        />
        <PaymentMetricCard
          label="Refunded amount"
          value={report.refundedAmount.formattedValue}
          detail={`${formatCount(report.byStatus.find((point) => point.status === "refunded")?.count ?? 0)} fully refunded payments`}
          icon={<RotateCcw className="size-5" />}
          tone="warning"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
        <PaymentVolumeChart points={report.trend} />
        <PaymentHealth report={report} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PaymentDistribution
          title="Payments by status"
          description="Current payment lifecycle outcomes for attempts created during this period."
          points={report.byStatus.map((point) => ({
            id: point.status,
            label: titleCase(point.status),
            count: point.count,
            amount: point.formattedAmount,
          }))}
        />
        <PaymentDistribution
          title="Payments by type"
          description="Payment purpose recorded when each provider-associated payment was created."
          points={report.byType.map((point) => ({
            id: point.paymentType,
            label: paymentTypeLabel(point.paymentType),
            count: point.count,
            amount: point.formattedAmount,
          }))}
        />
      </div>

      <PaymentPeriodTable points={report.trend} />
    </section>
  );
}

function PaymentVolumeChart({points}: {points: AdminPaymentTrendPoint[]}) {
  const hasActivity = points.some((point) =>
    point.collectedVolumeInCentavos > 0 ||
    point.refundedAmountInCentavos > 0,
  );
  const width = 840;
  const height = 280;
  const left = 76;
  const right = 20;
  const top = 20;
  const bottom = 42;
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => volumeSeries.map((series) => point[series.key])),
  );

  return (
    <article className="min-w-0 rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold">Payment volume over time</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Gross collected, currently paid, and fully refunded provider-associated volume.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
          {volumeSeries.map((series) => (
            <span key={series.key} className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{backgroundColor: series.color}}
              />
              {series.label}
            </span>
          ))}
        </div>
      </div>

      {!hasActivity ? (
        <div className="mt-5 grid min-h-64 place-items-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
          <div>
            <Banknote aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
            <p className="mt-3 font-bold">No payment volume to chart</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a period containing paid or refunded payments to display this trend.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 max-w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto min-w-[42rem]"
            role="img"
            aria-labelledby="payment-chart-title payment-chart-description"
          >
            <title id="payment-chart-title">Provider-associated payment volume trend</title>
            <desc id="payment-chart-description">
              Line chart comparing gross collected, currently paid, and refunded payment volume in Philippine pesos.
            </desc>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = top + ratio * (height - top - bottom);
              const value = maximum * (1 - ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth="1"
                  />
                  <text
                    x={left - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {compactPesos(value)}
                  </text>
                </g>
              );
            })}
            {volumeSeries.map((series) => (
              <polyline
                key={series.key}
                points={moneyLinePoints(points, series.key, maximum, {
                  width,
                  height,
                  left,
                  right,
                  top,
                  bottom,
                })}
                fill="none"
                stroke={series.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {labelIndexes(points.length).map((index) => (
              <text
                key={index}
                x={xPosition(index, points.length, width, left, right)}
                y={height - 12}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                className="fill-muted-foreground text-[11px]"
              >
                {points[index]?.label}
              </text>
            ))}
          </svg>
        </div>
      )}
    </article>
  );
}

function PaymentHealth({report}: {report: AdminPaymentPerformanceData}) {
  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <h3 className="font-bold">Payment and gateway health</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Finalized payment quality and attempts requiring operational attention.
      </p>
      <dl className="mt-5 grid gap-3">
        <HealthRow
          label="Payment success rate"
          value={report.paymentSuccessRate.formattedValue}
          detail={`${formatCount(report.paymentSuccessRate.numerator)} successful of ${formatCount(report.paymentSuccessRate.denominator)} finalized`}
          icon={<CircleCheck className="size-4" />}
          tone="positive"
        />
        <HealthRow
          label="Refund rate"
          value={report.refundRate.formattedValue}
          detail="Fully refunded among successful payment attempts"
          icon={<RefreshCcw className="size-4" />}
          tone="warning"
        />
        <HealthRow
          label="Pending or processing"
          value={formatCount(report.pendingOrProcessing.value)}
          detail="Payment attempts not yet finalized"
          icon={<Clock3 className="size-4" />}
        />
        <HealthRow
          label="Failed or expired"
          value={formatCount(report.failedOrExpired.value)}
          detail="Finalized without successful collection"
          icon={<CircleAlert className="size-4" />}
          tone="negative"
        />
        <HealthRow
          label="Awaiting webhook confirmation"
          value={formatCount(report.awaitingWebhookConfirmation.value)}
          detail="Processing records without a recorded final webhook event"
          icon={<Webhook className="size-4" />}
          tone={report.awaitingWebhookConfirmation.value > 0 ? "warning" : "positive"}
        />
      </dl>
    </article>
  );
}

function PaymentDistribution({
  title,
  description,
  points,
}: {
  title: string;
  description: string;
  points: Array<{id: string; label: string; count: number; amount: string}>;
}) {
  const maximum = Math.max(1, ...points.map((point) => point.count));
  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 grid gap-4">
        {points.map((point) => (
          <div key={point.id}>
            <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
              <span className="font-semibold">{point.label}</span>
              <span className="text-right text-muted-foreground">
                {formatCount(point.count)} · {point.amount}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                role="meter"
                aria-label={`${point.label} payment count`}
                aria-valuemin={0}
                aria-valuemax={maximum}
                aria-valuenow={point.count}
                className="h-full rounded-full bg-primary transition-[width]"
                style={{width: `${point.count === 0 ? 0 : Math.max(3, point.count / maximum * 100)}%`}}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function paymentPeriodPreview(
  points: AdminPaymentTrendPoint[],
  limit: number,
): AdminPaymentTrendPoint[] {
  if (points.length <= limit) {
    return points;
  }

  const activeIndexes = points.flatMap(
    (point, index) =>
      paymentPeriodHasActivity(point)
        ? [index]
        : [],
  );

  const selected = new Set(
    activeIndexes.length >= limit
      ? activeIndexes.slice(-limit)
      : activeIndexes,
  );

  for (
    let index = points.length - 1;
    index >= 0 && selected.size < limit;
    index -= 1
  ) {
    selected.add(index);
  }

  return [...selected]
    .sort((left, right) => left - right)
    .flatMap((index) => {
      const point = points[index];

      return point ? [point] : [];
    });
}

function paymentPeriodHasActivity(
  point: AdminPaymentTrendPoint,
): boolean {
  return (
    point.createdPayments > 0 ||
    point.successfulPayments > 0 ||
    point.failedOrExpiredPayments > 0 ||
    point.refundedPayments > 0 ||
    point.collectedVolumeInCentavos > 0 ||
    point.currentlyPaidVolumeInCentavos > 0 ||
    point.refundedAmountInCentavos > 0 ||
    point
      .netProviderAssociatedVolumeInCentavos >
      0
  );
}

function PaymentPeriodTable({
  points,
}: {
  points: AdminPaymentTrendPoint[];
}) {
  const [showAll, setShowAll] =
    useState(false);

  const preview =
    paymentPeriodPreview(points, 5);

  const visiblePoints =
    showAll ? points : preview;

  const canExpand =
    points.length > preview.length;

  const hasActivity =
    points.some(paymentPeriodHasActivity);

  return (
    <article className="min-w-0 rounded-card border border-border bg-card shadow-card">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div>
          <h3 className="font-bold">
            Payment period summary
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Exact operational values supporting
            the payment-volume visualization.
          </p>

          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            {!hasActivity && !showAll
              ? `No payment activity across ${points.length} periods`
              : `Showing ${visiblePoints.length} of ${points.length} periods${
                  !showAll &&
                  points.length > preview.length
                    ? " · Prioritizing periods with activity and the latest intervals"
                    : ""
                }`}
          </p>
        </div>

        {canExpand ? (
          <button
            type="button"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={showAll}
            aria-controls="payment-period-summary-table"
            onClick={() =>
              setShowAll((current) => !current)
            }
          >
            {showAll ? (
              <ChevronUp
                aria-hidden="true"
                className="size-4"
              />
            ) : (
              <ChevronDown
                aria-hidden="true"
                className="size-4"
              />
            )}

            {showAll
              ? "Show summary"
              : `Show all ${points.length} periods`}
          </button>
        ) : null}
      </div>

      {!hasActivity && !showAll ? (
        <div
          id="payment-period-summary-table"
          className="grid min-h-28 place-items-center border-t border-border bg-muted/20 p-5 text-center"
        >
          <div>
            <Banknote
              aria-hidden="true"
              className="mx-auto size-7 text-muted-foreground"
            />

            <p className="mt-2 font-bold">
              No period activity to summarize
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              All payment counts and amounts are
              zero for this reporting range.
            </p>
          </div>
        </div>
      ) : (
        <div
          id="payment-period-summary-table"
          className={`max-w-full border-t border-border ${
            showAll
              ? "max-h-[32rem] overflow-auto"
              : "overflow-x-auto"
          }`}
        >
          <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              Payment performance by reporting
              interval
            </caption>

            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                {[
                  "Period",
                  "Created",
                  "Successful",
                  "Failed / expired",
                  "Refunded",
                  "Gross collected",
                  "Currently paid",
                  "Provider-associated",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 font-bold"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {visiblePoints.map((point) => (
                <tr
                  key={point.periodStart}
                  className="hover:bg-secondary/50"
                >
                  <th
                    scope="row"
                    className="whitespace-nowrap px-4 py-3 font-semibold"
                  >
                    {point.label}
                  </th>

                  <td className="px-4 py-3">
                    {formatCount(
                      point.createdPayments,
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {formatCount(
                      point.successfulPayments,
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {formatCount(
                      point.failedOrExpiredPayments,
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {formatCount(
                      point.refundedPayments,
                    )}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-semibold">
                    {formatCentavos(
                      point
                        .collectedVolumeInCentavos,
                    )}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    {formatCentavos(
                      point
                        .currentlyPaidVolumeInCentavos,
                    )}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    {formatCentavos(
                      point
                        .netProviderAssociatedVolumeInCentavos,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canExpand ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
          The CSV export always includes all{" "}
          {points.length} reporting periods.
        </p>
      ) : null}
    </article>
  );
}

function PaymentMetricCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: "neutral" | "positive" | "warning";
}) {
  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <span
          aria-hidden="true"
          className={tone === "positive" ? "text-success" : tone === "warning" ? "text-warning" : "text-primary-strong"}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 break-words text-2xl font-black tracking-tight sm:text-3xl">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

function HealthRow({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  const toneClass = tone === "positive"
    ? "text-success"
    : tone === "warning"
      ? "text-warning"
      : tone === "negative"
        ? "text-destructive"
        : "text-primary-strong";
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background p-3">
      <div className="min-w-0">
        <dt className="text-sm font-bold">{label}</dt>
        <dd className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</dd>
      </div>
      <div className={`flex shrink-0 items-center gap-2 font-black ${toneClass}`}>
        <span aria-hidden="true">{icon}</span>
        {value}
      </div>
    </div>
  );
}

function moneyLinePoints(
  points: AdminPaymentTrendPoint[],
  key:
    | "collectedVolumeInCentavos"
    | "currentlyPaidVolumeInCentavos"
    | "refundedAmountInCentavos",
  maximum: number,
  dimensions: {
    width: number;
    height: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  },
) {
  return points.map((point, index) => {
    const x = xPosition(index, points.length, dimensions.width, dimensions.left, dimensions.right);
    const chartHeight = dimensions.height - dimensions.top - dimensions.bottom;
    const y = dimensions.top + chartHeight - point[key] / maximum * chartHeight;
    return `${x},${y}`;
  }).join(" ");
}

function xPosition(index: number, count: number, width: number, left: number, right: number) {
  if (count <= 1) return (left + width - right) / 2;
  return left + index / (count - 1) * (width - left - right);
}

function labelIndexes(count: number) {
  if (count <= 0) return [];
  if (count <= 6) return Array.from({length: count}, (_, index) => index);
  return [...new Set([0, Math.floor((count - 1) / 2), count - 1])];
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-PH").format(value);
}

function formatCentavos(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function compactPesos(valueInCentavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(valueInCentavos / 100);
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function paymentTypeLabel(value: string) {
  const labels: Record<string, string> = {
    provider_down_payment: "Provider down payment",
    provider_balance: "Provider remaining balance",
    refund: "Refund record",
    adjustment: "Payment adjustment",
  };
  return labels[value] ?? titleCase(value);
}