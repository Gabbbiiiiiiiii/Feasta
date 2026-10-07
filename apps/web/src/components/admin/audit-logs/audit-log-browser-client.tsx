"use client";

import Link from "next/link";
import {
  Activity,
  CircleCheckBig,
  ExternalLink,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";

import {loadAdminAuditLogsAction} from "@/app/admin/audit-logs/actions";
import {CursorPagination} from "@/components/data/cursor-pagination";
import {DataTable, type DataTableColumn} from "@/components/data/data-table";
import {FilterToolbar} from "@/components/data/filter-toolbar";
import {SummaryCard} from "@/components/data/summary-card";
import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {PageHeading} from "@/components/layout/page-heading";
import {Badge, type BadgeProps} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import type {
  AdminAuditLog,
  AdminAuditLogFilterOptions,
  AdminAuditLogFilters,
  AdminAuditLogPage,
} from "@/lib/admin/audit-logs/admin-audit-log-types";

type AuditLogBrowserClientProps = {
  initialPage: AdminAuditLogPage;
};

const DEFAULT_FILTERS: AdminAuditLogFilters = {
  search: "",
  action: "all",
  actorRole: "all",
  source: "all",
  targetCollection: "all",
  fromDate: "",
  toDate: "",
  pageSize: 20,
  cursor: null,
};

function AuditLogBrowserClient({
  initialPage,
}: AuditLogBrowserClientProps) {
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOptions, setFilterOptions] = useState(
    initialPage.filterOptions,
  );
  const [searchValue, setSearchValue] = useState("");
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([
    null,
  ]);
  const [pageError, setPageError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const loadPage = useCallback(
    (
      nextFilters: AdminAuditLogFilters,
      cursor: string | null,
      history: (string | null)[],
    ) => {
      setPageError(undefined);
      const request = {...nextFilters, cursor};

      startTransition(async () => {
        try {
          const result = await loadAdminAuditLogsAction(request);
          setPage(result);
          setFilters(request);
          setCursorHistory(history);
          setFilterOptions((current) =>
            mergeFilterOptions(current, result.filterOptions),
          );
        } catch {
          setPageError(
            "Activities could not be loaded. Please try again.",
          );
        }
      });
    },
    [],
  );

  const applyFilters = useCallback(
    (changes: Partial<AdminAuditLogFilters>) => {
      loadPage({...filters, ...changes, cursor: null}, null, [null]);
    },
    [filters, loadPage],
  );

  const clearFilters = useCallback(() => {
    setSearchValue("");
    loadPage(DEFAULT_FILTERS, null, [null]);
  }, [loadPage]);

  const activeFilters = useMemo(
    () => auditLogFilterLabels(filters),
    [filters],
  );
  const filtered = activeFilters.length > 0 || Boolean(filters.search);

  const columns = useMemo<readonly DataTableColumn<AdminAuditLog>[]>(
    () => [
      {
        id: "timestamp",
        header: "Date and time",
        cell: (auditLog) => (
          <span className="whitespace-nowrap font-medium">
            {formatDate(auditLog.createdAt)}
          </span>
        ),
      },
      {
        id: "event",
        header: "Action",
        cell: (auditLog) => (
          <div className="grid min-w-44 gap-2">
            <Link
              href={`/admin/audit-logs/${auditLog.id}`}
              className="font-bold text-primary-strong hover:underline"
            >
              {humanize(auditLog.action)}
            </Link>

          </div>
        ),
      },
      {
        id: "actor",
        header: "Admin / user",
        cell: (auditLog) => (
          <div className="grid gap-2">
            <Badge className="w-fit" tone="neutral">
              {humanize(auditLog.actorRole)}
            </Badge>
          </div>
        ),
      },
      {
        id: "target",
        header: "Affected item",
        cell: (auditLog) => (
          <div className="grid gap-1">
            <span className="font-semibold">
              {humanize(auditLog.targetCollection)}
            </span>

          </div>
        ),
      },
      {
        id: "source",
        header: "Result",
        cell: (auditLog) => (
          <div className="grid gap-2">
            {auditLog.outcome ? (
              <Badge className="w-fit" tone={outcomeTone(auditLog.outcome)}>
                {humanize(auditLog.outcome)}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                Result not recorded
              </span>
            )}
          </div>
        ),
      },
      {
        id: "summary",
        header: "Details",
        cell: (auditLog) => (
          <p className="max-w-xs break-words text-muted-foreground">
            {auditLog.summary}
          </p>
        ),
      },
    ],
    [],
  );

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Activity logs"
        description="Review administrator and system activity."
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Latest audit event window"
      >
        <SummaryCard
          label="Recent activities"
          value={page.summary.windowCount}
          icon={<Activity />}

        />
        <SummaryCard
          label="Admins active"
          value={page.summary.adminActorCount}
          icon={<ShieldCheck />}

        />
        <SummaryCard
          label="Successful actions"
          value={page.summary.succeededOutcomeCount}
          icon={<CircleCheckBig />}

        />
        <SummaryCard
          label="Failed actions"
          value={page.summary.attentionOutcomeCount}
          icon={<TriangleAlert />}

        />
      </section>

      <p className="-mt-2 text-sm text-muted-foreground">
        Counts cover the latest {page.summary.windowLimit} activities.
      </p>

      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={(search) => applyFilters({search})}
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        loading={isPending}
        searchLabel="Search activities"
        searchPlaceholder="Search activity or reference"
        filterControls={
          <>
            <FilterSelect
              label="Action"
              value={filters.action}
              options={withSelected(filterOptions.actions, filters.action)}
              onChange={(action) => applyFilters({action})}
              disabled={isPending}
            />
            <FilterSelect
              label="User role"
              value={filters.actorRole}
              options={withSelected(filterOptions.actorRoles, filters.actorRole)}
              onChange={(actorRole) => applyFilters({actorRole})}
              disabled={isPending}
            />

            <FilterSelect
              label="Record type"
              value={filters.targetCollection}
              options={withSelected(
                filterOptions.targetCollections,
                filters.targetCollection,
              )}
              onChange={(targetCollection) =>
                applyFilters({targetCollection})
              }
              disabled={isPending}
            />
            <label className="grid gap-1 text-sm font-semibold">
              From date
              <PhilippineDateInput
                value={filters.fromDate}
                max={filters.toDate || undefined}
                disabled={isPending}
                className="min-h-12 py-2 text-sm"
                displayClassName="left-4 right-12 text-sm"
                onChange={(event) =>
                  applyFilters({fromDate: event.currentTarget.value})
                }
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              To date
              <PhilippineDateInput
                value={filters.toDate}
                min={filters.fromDate || undefined}
                disabled={isPending}
                className="min-h-12 py-2 text-sm"
                displayClassName="left-4 right-12 text-sm"
                onChange={(event) =>
                  applyFilters({toDate: event.currentTarget.value})
                }
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Rows per page
              <Select
                value={String(filters.pageSize)}
                disabled={isPending}
                className="min-h-12 py-2 text-sm"
                onChange={(event) =>
                  applyFilters({pageSize: Number(event.currentTarget.value)})
                }
              >
                <option value="10">10 rows</option>
                <option value="20">20 rows</option>
                <option value="30">30 rows</option>
              </Select>
            </label>
          </>
        }
      />

      {page.scan.filtered ? (
        <div
          className="rounded-xl border border-info bg-info-subtle p-4 text-sm text-info"
          role="note"
        >
          Search covers up to {page.scan.scanLimit} recent activities at a time.
          {page.scan.reachedLimit
            ? " Use Next to view older activities."
            : ""}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={page.auditLogs}
        getRowId={(auditLog) => auditLog.id}
        caption="Activities, newest first"
        loading={isPending}
        error={pageError}
        onRetry={() =>
          loadPage(filters, filters.cursor, cursorHistory)
        }
        emptyTitle={
          filtered
            ? "No matching activities"
            : "No recent activities"
        }
        emptyDescription={
          filtered
            ? page.hasMore
              ? "Continue to older events or clear a filter to broaden the results."
              : "Try changing the search, date range, or filters."
            : "Activities will appear here when an administrator or the system makes a change."
        }
        rowActionsLabel="Details"
        rowActions={(auditLog) => (
          <Button asChild variant="secondary" size="compact">
            <Link href={`/admin/audit-logs/${auditLog.id}`}>
              View details
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        )}
        renderMobileRow={(auditLog) => (
          <AuditLogMobileCard auditLog={auditLog} />
        )}
      />

      {page.auditLogs.length > 0 ||
      page.nextCursor ||
      cursorHistory.length > 1 ? (
        <CursorPagination
          previousCursor={
            cursorHistory.length > 1 ? "previous" : null
          }
          nextCursor={page.nextCursor}
          onPrevious={() => {
            const history = cursorHistory.slice(0, -1);
            loadPage(
              filters,
              history.at(-1) ?? null,
              history,
            );
          }}
          onNext={(cursor) => {
            const history = [...cursorHistory, cursor];
            loadPage(filters, cursor, history);
          }}
          pageLabel={pageLabel(page)}
          loading={isPending}
        />
      ) : null}
    </div>
  );
}

function AuditLogMobileCard({auditLog}: {auditLog: AdminAuditLog}) {
  return (
    <article className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">{humanize(auditLog.action)}</Badge>
          <Badge tone="neutral">{humanize(auditLog.actorRole)}</Badge>
          {auditLog.outcome ? (
            <Badge tone={outcomeTone(auditLog.outcome)}>
              {humanize(auditLog.outcome)}
            </Badge>
          ) : null}
        </div>
        <p className="font-bold">{formatDate(auditLog.createdAt)}</p>

      </div>

      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="font-semibold text-muted-foreground">Affected item</dt>
          <dd className="mt-1 break-all">
            {humanize(auditLog.targetCollection)}
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-muted-foreground">Summary</dt>
          <dd className="mt-1 break-words">{auditLog.summary}</dd>
        </div>
      </dl>

      <Button asChild variant="secondary" size="compact">
        <Link href={`/admin/audit-logs/${auditLog.id}`}>
          View details
          <ExternalLink aria-hidden="true" className="size-4" />
        </Link>
      </Button>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <Select
        value={value}
        disabled={disabled}
        className="min-h-12 py-2 text-sm"
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="all">All {label.toLocaleLowerCase("en-PH")}s</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {humanize(option)}
          </option>
        ))}
      </Select>
    </label>
  );
}

function mergeFilterOptions(
  current: AdminAuditLogFilterOptions,
  incoming: AdminAuditLogFilterOptions,
): AdminAuditLogFilterOptions {
  return {
    actions: mergeOptions(current.actions, incoming.actions),
    actorRoles: mergeOptions(current.actorRoles, incoming.actorRoles),
    sources: mergeOptions(current.sources, incoming.sources),
    targetCollections: mergeOptions(
      current.targetCollections,
      incoming.targetCollections,
    ),
  };
}

function mergeOptions(current: string[], incoming: string[]): string[] {
  return [...new Set([...current, ...incoming])].sort((left, right) =>
    left.localeCompare(right, "en-PH"),
  );
}

function withSelected(options: string[], selected: string): string[] {
  return selected === "all" || options.includes(selected)
    ? options
    : [...options, selected].sort((left, right) =>
        left.localeCompare(right, "en-PH"),
      );
}

function auditLogFilterLabels(filters: AdminAuditLogFilters): string[] {
  const labels: string[] = [];
  if (filters.search) labels.push(`Search: ${filters.search}`);
  if (filters.action !== "all") {
    labels.push(`Action: ${humanize(filters.action)}`);
  }
  if (filters.actorRole !== "all") {
    labels.push(`Actor role: ${humanize(filters.actorRole)}`);
  }
  if (filters.source !== "all") {
    labels.push(`Source: ${humanize(filters.source)}`);
  }
  if (filters.targetCollection !== "all") {
    labels.push(`Record type: ${humanize(filters.targetCollection)}`);
  }
  if (filters.fromDate) labels.push(`From: ${filters.fromDate}`);
  if (filters.toDate) labels.push(`To: ${filters.toDate}`);
  return labels;
}

function pageLabel(page: AdminAuditLogPage): string {
  const count = page.auditLogs.length;
  const noun = count === 1 ? "event" : "events";
  return page.scan.filtered
    ? `Showing ${count} ${noun} from ${page.scan.scannedCount} scanned`
    : `Showing ${count} audit ${noun}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Timestamp not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Timestamp not recorded";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/^./u, (character) => character.toUpperCase());
}

function outcomeTone(outcome: string): BadgeProps["tone"] {
  const normalized = outcome.toLocaleLowerCase("en-PH");
  if (
    ["success", "succeeded", "successful", "completed"].includes(normalized)
  ) {
    return "success";
  }
  if (["failed", "failure", "error", "denied"].includes(normalized)) {
    return "destructive";
  }
  if (normalized === "rejected") return "warning";
  return "neutral";
}

export {
  AuditLogBrowserClient,
  type AuditLogBrowserClientProps,
};
