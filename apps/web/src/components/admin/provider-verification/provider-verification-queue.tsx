"use client";

import {
  Building2,
  CalendarCheck,
  ClipboardList,
  Eye,
  RotateCcw,
} from "lucide-react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {useMemo, useRef, useState, useTransition} from "react";

import {
  CursorPagination,
  DataTable,
  DetailDrawer,
  FilterToolbar,
  SummaryCard,
  type DataTableColumn,
} from "@/components/data";
import {loadProviderVerificationQueueAction} from "@/app/admin/providers/actions";
import {useAdminAutoRefresh} from "@/lib/admin/use-admin-auto-refresh";
import {providerVerificationLabel} from "@/lib/admin/provider-verification/provider-verification-labels";
import {PageHeading} from "@/components/layout/page-heading";
import {ProviderVerificationReviewPanel} from "@/components/admin/provider-verification/provider-verification-review-panel";
import {StatusBadge} from "@/components/shared/status-badge";
import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import type {
  ProviderVerificationQueueFilters,
  ProviderVerificationQueueItem,
  ProviderVerificationQueuePage,
  ProviderVerificationQueueSummary,
  ProviderVerificationReviewDetail,
} from "@/lib/admin/provider-verification/provider-verification-types";

import type {ServiceCategoryOption} from "@/lib/service-categories/service-category-types";

type ProviderVerificationQueueProps = {
  page: ProviderVerificationQueuePage;
  filters: ProviderVerificationQueueFilters;
  summary: ProviderVerificationQueueSummary;
  selected: ProviderVerificationReviewDetail | null;
  serviceCategoryOptions: readonly ServiceCategoryOption[];
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
    cell: (item) => <StatusBadge status={item.status} label={providerVerificationLabel(item.status)} />,
  },
];

function ProviderVerificationQueue({
  page: initialPage,
  filters: initialFilters,
  summary: initialSummary,
  selected: initialSelected,
  serviceCategoryOptions,
}: ProviderVerificationQueueProps) {
  const [filters, setFilters] = useState(initialFilters);
  const searchGeneration = useRef(0);
  const [pageError, setPageError] = useState<string>();
  const [data, setData] = useState({page: initialPage, summary: initialSummary, selected: initialSelected});
  const {page, summary, selected} = data;
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search);
  const [isPending, startTransition] = useTransition();
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewTarget, setReviewTarget] =
    useState<ProviderVerificationQueueItem | null>(
      initialSelected
        ? initialPage.items.find(
            (item) => item.id === initialSelected.id,
          ) ?? null
        : null,
    );
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string>();
  const reviewRequestId = useRef(0);

  const refreshQueue = useAdminAutoRefresh(async (isCurrent) => {
    const version = searchGeneration.current;
    const next = await loadProviderVerificationQueueAction(filters, selected?.id ?? null);
    if (isCurrent() && version === searchGeneration.current) setData(current => ({...next, selected: next.selected ?? current.selected}));
  }, JSON.stringify({filters, selected: selected?.id}), isPending || reviewBusy || reviewLoading || search.trim() !== filters.search.trim());

  const activeFilters = useMemo(() => [
    ...(filters.search ? [`Search: ${filters.search}`] : []),
    ...(filters.status !== "all" ? [`Status: ${providerVerificationLabel(filters.status)}`] : []),
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
    if (filters.search) params.set("q", filters.search); else params.delete("q");
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

  const syncSelectedUrl = (selectedId: string | null) => {
    const params = new URLSearchParams(window.location.search);

    if (selectedId) {
      params.set("selected", selectedId);
    } else {
      params.delete("selected");
    }

    const query = params.toString();

    window.history.replaceState(
      window.history.state,
      "",
      query ? `${pathname}?${query}` : pathname,
    );
  };

  const selectApplication = (
    item: ProviderVerificationQueueItem,
  ) => {
    const requestId = reviewRequestId.current + 1;
    reviewRequestId.current = requestId;

    setReviewTarget(item);
    setReviewError(undefined);
    setReviewLoading(true);

    setData((current) => ({
      ...current,
      selected:
        current.selected?.id === item.id
          ? current.selected
          : null,
    }));

    syncSelectedUrl(item.id);

    void loadProviderVerificationQueueAction(
      filters,
      item.id,
    )
      .then((next) => {
        if (reviewRequestId.current !== requestId) {
          return;
        }

        if (!next.selected) {
          throw new Error(
            "The provider application could not be loaded.",
          );
        }

        setData((current) => ({
          ...current,
          selected: next.selected,
        }));
      })
      .catch((caughtError: unknown) => {
        if (reviewRequestId.current !== requestId) {
          return;
        }

        setReviewError(
          caughtError instanceof Error &&
            caughtError.message.trim()
            ? caughtError.message
            : "The provider application could not be loaded.",
        );
      })
      .finally(() => {
        if (reviewRequestId.current === requestId) {
          setReviewLoading(false);
        }
      });
  };

  const closeApplicationReview = () => {
    reviewRequestId.current += 1;

    setReviewTarget(null);
    setReviewLoading(false);
    setReviewError(undefined);

    setData((current) => ({
      ...current,
      selected: null,
    }));

    syncSelectedUrl(null);
  };

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="administration"
        title="Provider verification"
        description="View provider applications across all verification statuses and review those awaiting approval."
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
          label="Under review"
          value={summary.underReview}
          icon={
            <Eye className="size-6" />
          }
        />

        <SummaryCard
          label="Approved today"
          value={summary.approvedToday}
          icon={
            <CalendarCheck className="size-6" />
          }
        />

        <SummaryCard
          label="Updated documents needed"
          value={summary.needsResubmission}
          icon={
            <RotateCcw className="size-6" />
          }
        />
      </div>

      <FilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSearchInvalidate={() => {
          searchGeneration.current += 1;
        }}
        onSearchSubmit={(value) => {
          const version = ++searchGeneration.current;
          const nextFilters = {...filters, search: value, cursor: null, direction: "next" as const};
          setPageError(undefined);
          startTransition(async () => {
            try {
              const next = await loadProviderVerificationQueueAction(nextFilters, selected?.id ?? null);
              if (version !== searchGeneration.current) return;
              setFilters(nextFilters);
              setData(current => ({...next, selected: next.selected ?? current.selected}));
            } catch { if (version === searchGeneration.current) setPageError("Applications could not be loaded. Please try again."); }
          });
        }}
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
                <option value="pending">Pending</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under review</option>
                <option value="approved">Approved</option>
                <option value="resubmission_required">
                  Updated documents needed
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
              <PhilippineDateInput
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
              <PhilippineDateInput
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
        caption="Provider verification"
        error={pageError}
        loading={isPending}
        emptyTitle="No verification applications"
        emptyDescription="No applications match the selected filters."
        rowActions={(item) => (
          <Button
            variant="secondary"
            size="compact"
            onClick={() => selectApplication(item)}
            aria-label={`Review ${item.businessName}`}
            loading={
              reviewLoading &&
              reviewTarget?.id === item.id
            }
            loadingLabel="Opening"
          >
            <Eye aria-hidden="true" />
            Review
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
              <StatusBadge status={item.status} label={providerVerificationLabel(item.status)} />
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
              aria-label={`Review ${item.businessName}`}
              loading={
                reviewLoading &&
                reviewTarget?.id === item.id
              }
              loadingLabel="Opening"
            >
              <Eye aria-hidden="true" />
              Review application
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
        open={selected != null || reviewTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            closeApplicationReview();
          }
        }}
        title={
          selected?.business.name ??
          reviewTarget?.businessName ??
          "Provider verification"
        }
        description="Provider application review"
      >
        {reviewLoading ? (
          <div
            className="grid gap-5 py-1"
            aria-live="polite"
            aria-busy="true"
          >
            <div>
              <p className="font-semibold text-foreground">
                Loading application...
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                The review panel will be ready in a moment.
              </p>
            </div>

            <div
              className="grid animate-pulse gap-3"
              aria-hidden="true"
            >
              <div className="h-28 rounded-xl bg-muted" />
              <div className="h-40 rounded-xl bg-muted" />
              <div className="h-32 rounded-xl bg-muted" />
            </div>
          </div>
        ) : reviewError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="font-semibold text-destructive">
              Application could not be opened
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {reviewError}
            </p>

            {reviewTarget ? (
              <Button
                type="button"
                variant="secondary"
                className="mt-4"
                onClick={() =>
                  selectApplication(reviewTarget)
                }
              >
                Try again
              </Button>
            ) : null}
          </div>
        ) : selected ? (
          <ProviderVerificationReviewPanel
            application={selected}
            serviceCategoryOptions={serviceCategoryOptions}
            onBusyChange={setReviewBusy}
            onUpdated={() => refreshQueue(true)}
          />
        ) : null}
      </DetailDrawer>
    </div>
  );
}

export {ProviderVerificationQueue};
