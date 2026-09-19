import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Route,
  XCircle,
} from "lucide-react";
import type {ReactNode} from "react";

import type {
  AdminBookingPerformance as AdminBookingPerformanceData,
  AdminBookingTrendPoint,
} from "@/lib/admin/reports/admin-report-types";

type AdminBookingPerformanceProps = {
  report: AdminBookingPerformanceData;
};

const chartSeries = [
  {key: "created", label: "Created", color: "#ff5f35"},
  {key: "confirmed", label: "Confirmed", color: "#2563eb"},
  {key: "completed", label: "Completed", color: "#15803d"},
] as const;

export function AdminBookingPerformance({
  report,
}: AdminBookingPerformanceProps) {
  return (
    <section aria-labelledby="booking-performance-heading" className="grid gap-4">
      <div>
        <h2 id="booking-performance-heading" className="text-xl font-black">
          Booking performance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Booking demand, lifecycle outcomes, provider responses, and conversion through event completion.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
        <BookingActivityChart points={report.trend} />
        <BookingStatusDistribution report={report} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationalCard
          label="Provider acceptance rate"
          value={report.providerRequests.acceptanceRate.formattedValue}
          detail={`${formatCount(report.providerRequests.acceptanceRate.numerator)} accepted of ${formatCount(report.providerRequests.acceptanceRate.denominator)} requests`}
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
        />
        <OperationalCard
          label="Provider rejection rate"
          value={report.providerRequests.rejectionRate.formattedValue}
          detail={`${formatCount(report.providerRequests.rejectionRate.numerator)} rejected of ${formatCount(report.providerRequests.rejectionRate.denominator)} requests`}
          icon={<XCircle className="size-5" />}
          tone="negative"
        />
        <OperationalCard
          label="Average provider response"
          value={formatDuration(report.providerRequests.averageResponseTimeInMinutes)}
          detail="From request creation to provider response"
          icon={<Clock3 className="size-5" />}
        />
        <OperationalCard
          label="Average booking lead time"
          value={formatDays(report.averageLeadTimeInDays)}
          detail="From booking creation to scheduled event"
          icon={<CalendarClock className="size-5" />}
        />
      </div>

      <BookingFunnel report={report} />
    </section>
  );
}

function BookingActivityChart({points}: {points: AdminBookingTrendPoint[]}) {
  const hasActivity = points.some((point) =>
    point.created > 0 || point.confirmed > 0 || point.completed > 0,
  );
  const width = 840;
  const height = 280;
  const left = 52;
  const right = 20;
  const top = 20;
  const bottom = 42;
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => [point.created, point.confirmed, point.completed]),
  );

  return (
    <article className="min-w-0 rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold">Booking activity over time</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Created, currently confirmed, and completed bookings grouped by the selected interval.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
          {chartSeries.map((series) => (
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
            <Route aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
            <p className="mt-3 font-bold">No booking activity to chart</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a period containing booking records to display the activity trend.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 max-w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto min-w-[42rem]"
            role="img"
            aria-labelledby="booking-chart-title booking-chart-description"
          >
            <title id="booking-chart-title">Booking activity trend</title>
            <desc id="booking-chart-description">
              Line chart comparing created, confirmed, and completed bookings over time.
            </desc>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = top + ratio * (height - top - bottom);
              const value = Math.round(maximum * (1 - ratio));
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
                    {value}
                  </text>
                </g>
              );
            })}
            {chartSeries.map((series) => (
              <polyline
                key={series.key}
                points={linePoints(points, series.key, maximum, {
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
          <table className="sr-only">
            <caption>Booking activity values</caption>
            <thead>
              <tr><th>Period</th><th>Created</th><th>Confirmed</th><th>Completed</th></tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.periodStart}>
                  <th>{point.label}</th>
                  <td>{point.created}</td>
                  <td>{point.confirmed}</td>
                  <td>{point.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function BookingStatusDistribution({report}: {report: AdminBookingPerformanceData}) {
  const maximum = Math.max(1, ...report.statusDistribution.map((point) => point.count));
  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <h3 className="font-bold">Booking status distribution</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Current lifecycle status of bookings created during this period.
      </p>
      <div className="mt-5 grid gap-3">
        {report.statusDistribution.map((point) => (
          <div key={point.status}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{statusLabel(point.status)}</span>
              <span className="text-muted-foreground">
                {formatCount(point.count)} · {point.percentage.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{width: `${point.count === 0 ? 0 : Math.max(3, point.count / maximum * 100)}%`}}
                role="meter"
                aria-label={`${statusLabel(point.status)} bookings`}
                aria-valuemin={0}
                aria-valuemax={maximum}
                aria-valuenow={point.count}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function BookingFunnel({report}: {report: AdminBookingPerformanceData}) {
  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <h3 className="font-bold">Booking conversion funnel</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Distinct bookings progressing from creation through completed events. A stage may decrease when records remain at earlier lifecycle states.
      </p>
      <ol className="mt-5 grid gap-3 lg:grid-cols-6">
        {report.funnel.map((stage, index) => (
          <li key={stage.id} className="relative min-w-0">
            <div className="h-full rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                  {index + 1}
                </span>
                {index < report.funnel.length - 1 ? (
                  <ArrowRight
                    aria-hidden="true"
                    className="hidden size-4 text-muted-foreground lg:block"
                  />
                ) : null}
              </div>
              <p className="mt-4 text-sm font-bold">{stage.label}</p>
              <p className="mt-1 text-2xl font-black">{formatCount(stage.count)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {index === 0
                  ? "Starting cohort"
                  : `${(stage.conversionFromPrevious ?? 0).toFixed(1)}% from previous`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stage.conversionFromCreated.toFixed(1)}% of created
              </p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function OperationalCard({
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
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <span
          aria-hidden="true"
          className={
            tone === "positive"
              ? "text-success"
              : tone === "negative"
                ? "text-destructive"
                : "text-primary-strong"
          }
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

function linePoints(
  points: AdminBookingTrendPoint[],
  key: "created" | "confirmed" | "completed",
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
    const x = xPosition(
      index,
      points.length,
      dimensions.width,
      dimensions.left,
      dimensions.right,
    );
    const chartHeight = dimensions.height - dimensions.top - dimensions.bottom;
    const y = dimensions.top + chartHeight - point[key] / maximum * chartHeight;
    return `${x},${y}`;
  }).join(" ");
}

function xPosition(
  index: number,
  count: number,
  width: number,
  left: number,
  right: number,
) {
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

function formatDuration(value: number | null) {
  if (value === null) return "Not available";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = value / 60;
  return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
}

function formatDays(value: number | null) {
  if (value === null) return "Not available";
  return `${value.toFixed(1)} days`;
}

function statusLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}