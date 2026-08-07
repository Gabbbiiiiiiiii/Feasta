"use client";

import {
  CalendarDays,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Printer,
  Users,
  UserRoundCheck,
  XCircle,
  FileSpreadsheet,
} from "lucide-react";
import {useState, useTransition} from "react";
import type {ReactNode} from "react";

import {
  loadAdminReportAction,
} from "@/app/admin/reports/actions";
import {
  AdminPaymentPerformance,
} from "@/components/admin/reports/admin-payment-performance";
import {
  AdminProviderPerformance,
} from "@/components/admin/reports/admin-provider-performance";
import {
  AdminBookingPerformance,
} from "@/components/admin/reports/admin-booking-performance";
import {
  SummaryCard,
} from "@/components/data/summary-card";
import {
  PageHeading,
} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {
  createAdminReportExcel,
} from "@/lib/admin/reports/admin-report-excel";
import type {
  AdminReportFilters,
  AdminReportMetric,
  AdminReportResult,
} from "@/lib/admin/reports/admin-report-types";

type AdminReportsExecutiveClientProps = {
  initialReport: AdminReportResult;
};

export function AdminReportsExecutiveClient({
  initialReport,
}: AdminReportsExecutiveClientProps) {
  const [report, setReport] = useState(initialReport);
  const [filters, setFilters] = useState<AdminReportFilters>(() =>
    editableFilters(initialReport),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExportingExcel, setIsExportingExcel] =
  useState(false);

  const runReport = () => {
    if (
      filters.datePreset === "custom" &&
      (!filters.startDate || !filters.endDate)
    ) {
      setError("Choose both a start date and an end date for a custom report.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        setReport(await loadAdminReportAction(filters));
      } catch {
        setError("The report could not be generated. Check the filters and try again.");
      }
    });
  };

  const allZero = report.executive.totalBookings.value === 0 &&
    report.executive.confirmedPaymentVolume.valueInCentavos === 0;

    const exportExcelReport = async () => {
  setError(null);
  setIsExportingExcel(true);

  try {
    const exported =
      await createAdminReportExcel(report);

    const downloadUrl =
      URL.createObjectURL(exported.blob);

    const anchor =
      document.createElement("a");

    anchor.href = downloadUrl;
    anchor.download = exported.fileName;
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 1_000);
  } catch {
    setError(
      "The Excel report could not be created. Please try again.",
    );
  } finally {
    setIsExportingExcel(false);
  }
};

  return (
    <div
      data-admin-report
      className="grid min-w-0 gap-6"
    >
      <header
        data-print-header
        className="hidden"
      >
        <div className="flex items-start justify-between gap-8 border-b-2 border-[#2B211D] pb-4">
          <div>
            <p className="text-[10pt] font-black tracking-[0.14em] text-[#FF5A36]">
              FEASTA
            </p>

            <h1 className="mt-1 text-[20pt] font-black text-[#2B211D]">
              Administrative Report
            </h1>

            <p className="mt-1 text-[9pt] text-[#5F554F]">
              Reports and Insights · Authorized operational data
            </p>
          </div>

          <div className="text-right text-[8.5pt] leading-5 text-[#5F554F]">
            <p className="font-bold text-[#2B211D]">
              FEASTA Platform
            </p>
            <p>Ormoc City, Philippines</p>
            <p>Currency: {report.currency}</p>
            <p>Time zone: {report.timeZone}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-10 gap-y-2 border-b border-[#D8D0CA] pb-4 text-[9pt]">
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-[#5F554F]">
              Reporting period
            </dt>
            <dd className="text-right font-bold">
              {report.filters.period.label}
            </dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-[#5F554F]">
              Comparison
            </dt>
            <dd className="text-right font-bold">
              {report.filters.comparisonPeriod?.label ??
                "None"}
            </dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-[#5F554F]">
              Trend grouping
            </dt>
            <dd className="text-right capitalize">
              {report.filters.grouping}
            </dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-[#5F554F]">
              Generated
            </dt>
            <dd className="text-right">
              {formatGeneratedAt(report.generatedAt)}
            </dd>
          </div>
        </dl>
      </header>
      <div
        data-print-hidden
        className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <PageHeading
          eyebrow="Administration"
          title="Reports and Insights"
          description="Review booking activity, provider participation, and provider-associated payment volume using bounded operational data."
        />
        <div className="grid w-full shrink-0 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
            <Button
            type="button"
            variant="secondary"
            disabled={
                isPending ||
                isExportingExcel
            }
            onClick={() => {
                void exportExcelReport();
            }}
            >
            <FileSpreadsheet
                aria-hidden="true"
                className="size-4"
            />

            {isExportingExcel
                ? "Preparing Excel"
                : "Export Excel"}
            </Button>

            <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() => window.print()}
            >
                <Printer
                aria-hidden="true"
                className="size-4"
                />
                Print
            </Button>
            </div>
      </div>

      <section
        data-print-hidden
        aria-labelledby="report-controls-heading"
        className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 id="report-controls-heading" className="text-lg font-bold">
            Reporting period
          </h2>
          <p className="text-sm text-muted-foreground">
            Calendar boundaries use Asia/Manila time. Custom reports are limited to 366 days.
          </p>
        </div>

        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReportSelect
            id="report-date-preset"
            label="Date range"
            value={filters.datePreset}
            disabled={isPending}
            onChange={(value) => setFilters((current) => ({
              ...current,
              datePreset: value as AdminReportFilters["datePreset"],
            }))}
            options={[
              ["today", "Today"],
              ["last_7_days", "Last 7 days"],
              ["last_30_days", "Last 30 days"],
              ["last_3_months", "Last 3 calendar months"],
              ["this_year", "This year"],
              ["custom", "Custom dates"],
            ]}
          />
          <ReportSelect
            id="report-comparison"
            label="Comparison"
            value={filters.comparison}
            disabled={isPending}
            onChange={(value) => setFilters((current) => ({
              ...current,
              comparison: value as AdminReportFilters["comparison"],
            }))}
            options={[
              ["previous_period", "Previous period"],
              ["previous_year", "Previous year"],
              ["none", "No comparison"],
            ]}
          />
          <ReportSelect
            id="report-grouping"
            label="Trend grouping"
            value={filters.grouping}
            disabled={isPending}
            onChange={(value) => setFilters((current) => ({
              ...current,
              grouping: value as AdminReportFilters["grouping"],
            }))}
            options={[
              ["day", "Daily"],
              ["week", "Weekly"],
              ["month", "Monthly"],
            ]}
          />
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={isPending}
              onClick={runReport}
            >
              Generate report
            </Button>
          </div>
        </div>

        {filters.datePreset === "custom" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ReportDateInput
              id="report-start-date"
              label="Start date"
              value={filters.startDate ?? ""}
              disabled={isPending}
              onChange={(value) => setFilters((current) => ({
                ...current,
                startDate: value || null,
              }))}
            />
            <ReportDateInput
              id="report-end-date"
              label="End date"
              value={filters.endDate ?? ""}
              disabled={isPending}
              onChange={(value) => setFilters((current) => ({
                ...current,
                endDate: value || null,
              }))}
            />
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-1 border-t border-border pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold">{report.filters.period.label}</p>
          <p className="text-muted-foreground">
            {report.filters.comparisonPeriod
              ? `Compared with ${report.filters.comparisonPeriod.label}`
              : "No comparison selected"}
          </p>
        </div>
      </section>

      {error ? (
        <div
          data-print-hidden
          role="alert"
          className="rounded-card border border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive"
        >
          {error}
        </div>
      ) : null}

      {allZero ? (
        <div
          role="status"
          className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground shadow-card"
        >
          No booking or payment activity was recorded for this period. The values below are accurate zeros, not placeholder data.
        </div>
      ) : null}

      <section aria-labelledby="executive-overview-heading">
        <div className="mb-4">
          <h2 id="executive-overview-heading" className="text-xl font-black">
            Executive overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational totals and comparison trends for the selected period.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total bookings"
            value={formatCount(report.executive.totalBookings.value)}
            metric={report.executive.totalBookings}
            icon={<CalendarDays className="size-5" />}
          />
          <MetricCard
            label="Confirmed bookings"
            value={formatCount(report.executive.confirmedBookings.value)}
            metric={report.executive.confirmedBookings}
            icon={<CalendarCheck className="size-5" />}
          />
          <MetricCard
            label="Completed events"
            value={formatCount(report.executive.completedEvents.value)}
            metric={report.executive.completedEvents}
            icon={<CheckCircle2 className="size-5" />}
          />
          <MetricCard
            label="Cancellation rate"
            value={report.executive.cancellationRate.formattedValue}
            metric={report.executive.cancellationRate}
            inverseTrend
            icon={<XCircle className="size-5" />}
          />
          <MetricCard
            label="Active customers"
            value={formatCount(report.executive.activeCustomers.value)}
            metric={report.executive.activeCustomers}
            icon={<Users className="size-5" />}
          />
          <MetricCard
            label="Active providers"
            value={formatCount(report.executive.activeProviders.value)}
            metric={report.executive.activeProviders}
            icon={<UserRoundCheck className="size-5" />}
          />
          <MetricCard
            label="Confirmed payment volume"
            value={report.executive.confirmedPaymentVolume.formattedValue}
            metric={report.executive.confirmedPaymentVolume}
            icon={<CircleDollarSign className="size-5" />}
          />
          <MetricCard
            label="Average paid payment"
            value={report.executive.averagePaidPayment.formattedValue}
            metric={report.executive.averagePaidPayment}
            icon={<Clock3 className="size-5" />}
          />
        </div>
      </section>

        <AdminBookingPerformance
            report={report.bookings}
        />
        <AdminPaymentPerformance
            report={report.payments}
        />
        <AdminProviderPerformance
            report={report.providers}
        />

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Financial interpretation">
        <article className="rounded-card border border-border bg-card p-5 shadow-card">
          <h2 className="text-lg font-bold">Provider-associated payments</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Customer payments are associated with provider services. Confirmed Payment Volume does not represent FEASTA-owned revenue and does not deduct a provider payout or platform commission.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <FinancialDetail
              label="Confirmed payment volume"
              value={report.payments.confirmedPaymentVolume.formattedValue}
            />
            <FinancialDetail
              label="Provider-associated volume"
              value={report.payments.providerAssociatedVolume.formattedValue}
            />
          </dl>
        </article>
        <article className="rounded-card border border-warning/40 bg-warning/10 p-5 shadow-card">
          <h2 className="text-lg font-bold">FEASTA platform revenue</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {report.payments.platformRevenue.explanation}
          </p>
          <p className="mt-4 inline-flex rounded-full border border-warning/50 bg-card px-3 py-1 text-sm font-bold">
            Not configured
          </p>
        </article>
      </section>

      <section
        aria-labelledby="metric-definitions-heading"
        className="rounded-card border border-border bg-card p-5 shadow-card"
      >
        <h2 id="metric-definitions-heading" className="text-lg font-bold">
          Metric definitions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These definitions keep administrative reporting consistent and auditable.
        </p>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          {report.definitions.map((definition) => (
            <div key={definition.id} className="rounded-lg border border-border p-4">
              <dt className="font-bold">{definition.label}</dt>
              <dd className="mt-1 text-sm leading-6 text-muted-foreground">
                {definition.description}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <footer
        data-print-footer
        className="hidden"
      >
        <div className="mt-8 flex items-center justify-between border-t border-[#D8D0CA] pt-3 text-[8pt] text-[#6F655F]">
          <p>
            FEASTA Administrative Report
          </p>

          <p>
            Confidential · Authorized administrative use only
          </p>
        </div>
      </footer>

      <p
        data-print-hidden
        className="text-xs text-muted-foreground"
      >
        Generated {formatGeneratedAt(report.generatedAt)} ·{" "}
        {report.timeZone} · {report.currency}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  metric,
  icon,
  inverseTrend = false,
}: {
  label: string;
  value: string;
  metric: AdminReportMetric;
  icon: ReactNode;
  inverseTrend?: boolean;
}) {
  return (
    <SummaryCard
      label={label}
      value={value}
      icon={icon}
      trend={metricTrend(metric, inverseTrend)}
    />
  );
}

function ReportSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-lg border border-input bg-card px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </div>
  );
}

function ReportDateInput({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

function FinancialDetail({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-black">{value}</dd>
    </div>
  );
}

function editableFilters(
  report: AdminReportResult,
): AdminReportFilters {
  return {
    datePreset: report.filters.datePreset,
    startDate: report.filters.startDate,
    endDate: report.filters.endDate,
    comparison: report.filters.comparison,
    grouping: report.filters.grouping,
    providerServiceType:
      report.filters.providerServiceType,
    providerRequestType:
      report.filters.providerRequestType,
    eventType: report.filters.eventType,
    city: report.filters.city,
    bookingStatus: report.filters.bookingStatus,
    paymentStatus: report.filters.paymentStatus,
  };
}

function metricTrend(metric: AdminReportMetric, inverse: boolean) {
  if (!metric.comparisonAvailable || metric.percentageChange === null) {
    return {label: "No comparable baseline", direction: "neutral" as const};
  }
  const percentage = metric.percentageChange;
  const mathematicallyUp = percentage > 0;
  const direction = percentage === 0
    ? "neutral" as const
    : inverse
      ? mathematicallyUp ? "down" as const : "up" as const
      : mathematicallyUp ? "up" as const : "down" as const;
  return {
    label: `${percentage > 0 ? "+" : ""}${percentage.toFixed(1)}% vs comparison`,
    direction,
  };
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-PH").format(value);
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}