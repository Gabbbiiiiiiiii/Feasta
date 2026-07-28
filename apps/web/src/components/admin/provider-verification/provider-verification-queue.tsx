"use client";

import {
  Building2,
  CalendarCheck,
  ClipboardList,
  Eye,
  RotateCcw,
} from "lucide-react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {useMemo, useState, useTransition} from "react";

import {
  CursorPagination,
  DataTable,
  DetailDrawer,
  FilterToolbar,
  SummaryCard,
  type DataTableColumn,
} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {ProviderVerificationReviewPanel} from "@/components/admin/provider-verification/provider-verification-review-panel";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import type {
  ProviderVerificationQueueFilters,
  ProviderVerificationQueueItem,
  ProviderVerificationQueuePage,
  ProviderVerificationQueueSummary,
  ProviderVerificationReviewDetail,
} from "@/lib/admin/provider-verification/provider-verification-types";

type ProviderVerificationQueueProps = {
  page: ProviderVerificationQueuePage;
  filters: ProviderVerificationQueueFilters;
  summary: ProviderVerificationQueueSummary;
  selected: ProviderVerificationReviewDetail | null;
};

const columns: readonly DataTableColumn<ProviderVerificationQueueItem>[] = [
  {
    id: "businessName",
    header: "Provider",
    cell: (item) => (
      <div className="min-w-0">
        <p className="break-words font-bold">{item.businessName}</p>
        <p className="mt-1 break-all text-sm text-muted-foreground">
          {item.email}
        </p>
      </div>
    ),
  },
  {
    id: "ownerName",
    header: "Owner",
    cell: (item) => <span className="break-words">{item.ownerName}</span>,
  },
  {
    id: "serviceType",
    header: "Service type",
    cell: (item) => (
      <span className="capitalize">{item.providerServiceType}</span>
    ),
  },
  {
    id: "submittedAt",
    header: "Submitted",
    cell: (item) => item.submittedAt,
  },
  {
    id: "status",
    header: "Status",
    cell: (item) => <StatusBadge status={item.status} />,
  },
];

function ProviderVerificationQueue({
  page,
  filters,
  summary,
  selected,
}: ProviderVerificationQueueProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search);
  const [isPending, startTransition] = useTransition();

  const activeFilters = useMemo(() => [
    ...(filters.search ? [`Search: ${filters.search}`] : []),
    ...(filters.status !== "all" ? [`Status: ${filters.status}`] : []),
    ...(filters.serviceType !== "all"
      ? [`Service: ${filters.serviceType}`]
      : []),
    ...(filters.from ? [`From: ${filters.from}`] : []),
    ...(filters.to ? [`To: ${filters.to}`] : []),
  ], [filters]);

  const navigate = (
    updates: Record<string, string | null>,
    resetCursor = true,
  ) => {
    const params = new URLSearchParams(currentSearchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (resetCursor) {
      params.delete("cursor");
      params.delete("direction");
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const selectApplication = (item: ProviderVerificationQueueItem) => {
    navigate({selected: item.id}, false);
  };

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Provider administration"
        title="Provider verification queue"
        description="Review submitted provider applications using bounded, server-filtered results."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Submitted"
          value={summary.submitted}
          icon={
            <ClipboardList className="size-6" />
          }
        />

        <SummaryCard
          label="Under Review"
          value={summary.underReview}
          icon={
            <Eye className="size-6" />
          }
        />

        <SummaryCard
          label="Approved Today"
          value={summary.approvedToday}
          icon={
            <CalendarCheck className="size-6" />
          }
        />

        <SummaryCard
          label="Needs Resubmission"
          value={summary.needsResubmission}
          icon={
            <RotateCcw className="size-6" />
          }
        />
      </div>

      <FilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={(value) => navigate({q: value || null, selected: null})}
        onClearFilters={() => {
          setSearch("");
          navigate({
            q: null,
            status: null,
            serviceType: null,
            from: null,
            to: null,
            selected: null,
          });
        }}
        activeFilters={activeFilters}
        searchLabel="Search provider verification applications"
        searchPlaceholder="Business, owner, email, phone, or provider ID"
        loading={isPending}
        filterControls={
          <>
            <label className="grid gap-1 text-sm font-semibold">
              Status
              <Select
                aria-label="Verification status"
                value={filters.status}
                disabled={isPending}
                onChange={(event) => navigate({
                  status: event.currentTarget.value === "all"
                    ? null
                    : event.currentTarget.value,
                  selected: null,
                })}
              >
                <option value="all">All verification statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under review</option>
                <option value="approved">Approved</option>
                <option value="resubmission_required">
                  Resubmission required
                </option>
                <option value="rejected">Rejected</option>
                <option value="suspended">Suspended</option>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Service type
              <Select
                aria-label="Provider service type"
                value={filters.serviceType}
                disabled={isPending}
                onChange={(event) => navigate({
                  serviceType: event.currentTarget.value === "all"
                    ? null
                    : event.currentTarget.value,
                  selected: null,
                })}
              >
                <option value="all">All service types</option>
                <option value="catering">Catering</option>
                <option value="addon">Add-on</option>
                <option value="both">Both</option>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Application from
              <Input
                type="date"
                aria-label="Application from"
                value={filters.from}
                disabled={isPending}
                onChange={(event) => navigate({
                  from: event.currentTarget.value || null,
                  selected: null,
                })}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Application to
              <Input
                type="date"
                aria-label="Application to"
                value={filters.to}
                disabled={isPending}
                onChange={(event) => navigate({
                  to: event.currentTarget.value || null,
                  selected: null,
                })}
              />
            </label>
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={page.items}
        getRowId={(item) => item.id}
        caption="Provider verification queue"
        loading={isPending}
        emptyTitle="No verification applications"
        emptyDescription="No applications match the current server-side filters."
        rowActions={(item) => (
          <Button
            variant="secondary"
            size="compact"
            onClick={() => selectApplication(item)}
            aria-label={`Inspect ${item.businessName}`}
          >
            <Eye aria-hidden="true" />
            Inspect
          </Button>
        )}
        renderMobileRow={(item) => (
          <article className="grid min-w-0 gap-3 rounded-card border border-border bg-card p-4 shadow-card">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                <Building2 aria-hidden="true" className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="break-words font-bold">{item.businessName}</h2>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {item.ownerName}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="font-semibold">Service type</dt>
                <dd className="capitalize text-muted-foreground">
                  {item.providerServiceType}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Submitted</dt>
                <dd className="text-muted-foreground">{item.submittedAt}</dd>
              </div>
            </dl>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => selectApplication(item)}
              aria-label={`Inspect ${item.businessName}`}
            >
              <Eye aria-hidden="true" />
              Inspect application
            </Button>
          </article>
        )}
      />

      <CursorPagination
        previousCursor={page.previousCursor}
        nextCursor={page.nextCursor}
        loading={isPending}
        pageLabel={`Showing up to ${page.pageSize} applications`}
        onPrevious={(cursor) => navigate({
          cursor,
          direction: "previous",
          selected: null,
        }, false)}
        onNext={(cursor) => navigate({
          cursor,
          direction: "next",
          selected: null,
        }, false)}
      />

      <DetailDrawer
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) navigate({selected: null}, false);
        }}
        title={selected?.business.name ?? "Provider verification"}
        description="Secure provider application review"
      >
        {selected ? (
          <ProviderVerificationReviewPanel application={selected} />
        ) : null}
      </DetailDrawer>
    </div>
  );
}

export {ProviderVerificationQueue};
