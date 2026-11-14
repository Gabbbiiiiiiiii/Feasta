"use client";
import {Eye} from "lucide-react";
import Link from "next/link";
import {useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {acceptProviderRequest, rejectProviderRequest} from "@/lib/provider/requests/provider-request-client";
import {providerRequestAcceptanceDescription, ProviderRequestActionError} from "@/lib/provider/requests/provider-request-acceptance-copy";
import {DataTable, FilterToolbar, CursorPagination, DetailDrawer, ManagementConfirmationModal, ManagementModal, type DataTableColumn} from "@/components/data";
import {ApplicationErrorState} from "@/components/feedback/application-states";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {requestStatusLabel} from "@/lib/provider/requests/provider-request-presentation";
import type {ProviderRequestListItem, ProviderRequestSummary, ProviderRequestPage, ProviderRequestFilters, ProviderRequestFilter} from "@/lib/provider/requests/provider-request-types";
import {loadProviderRequestsAction, loadProviderRequestDetailAction} from "./actions";
import {ProviderRequestDetailDrawer} from "./provider-request-detail-drawer";

type ProviderRequestsClientProps = {
  initialPage?: ProviderRequestPage; initialFilters?: ProviderRequestFilters; initialDetail?: ProviderRequestListItem | null;
  initialRequestId?: string; newRequestsOnly?: boolean; initialRequests?: ProviderRequestListItem[]; initialSummary?: ProviderRequestSummary;
};
const statusFilters: {value: ProviderRequestFilter; label: string}[] = [
  {value: "all", label: "All"}, {value: "new", label: "New"}, {value: "accepted", label: "Accepted"}, {value: "rejected", label: "Declined"}, {value: "cancelled", label: "Cancelled"},
];
export function ProviderRequestsClient({initialPage, initialFilters, initialDetail, initialRequestId, newRequestsOnly, initialRequests = []}: ProviderRequestsClientProps) {
  const router = useRouter();
  const [page, setPage] = useState<ProviderRequestPage>(initialPage ?? {requests: initialRequests, nextCursor: null, hasMore: false, skippedMalformedCount: 0});
  const [filters, setFilters] = useState<ProviderRequestFilters>(initialFilters ?? {status: newRequestsOnly ? "new" : "all", search: "", cursor: null});
  const [search, setSearch] = useState(initialFilters?.search ?? "");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const generation = useRef(0), detailGeneration = useRef(0);
  const [selectedRequest, setSelectedRequest] = useState<ProviderRequestListItem | null>(initialDetail ?? initialRequests.find(request => request.id === initialRequestId) ?? null);
  const [detailOpen, setDetailOpen] = useState(Boolean(initialDetail));
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState(initialRequestId);
  const [action, setAction] = useState<"accept" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [payoutSetupRequired, setPayoutSetupRequired] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  async function loadPage(next: ProviderRequestFilters, nextHistory = [] as string[], nextNumber = 1) {
    const token = ++generation.current;
    setFilters(next); setLoading(true); setLoadError(null);
    try {
      const result = await loadProviderRequestsAction(next);
      if (token !== generation.current) return;
      setPage(result); setHistory(nextHistory); setPageNumber(nextNumber);
    } catch {if (token === generation.current) setLoadError("Booking requests could not be loaded. Please try again.");}
    finally {if (token === generation.current) setLoading(false);}
  }
  async function openRequest(id: string) {
    const token = ++detailGeneration.current;
    setDetailId(id); setSelectedRequest(null); setDetailOpen(true); setDetailLoading(true); setDetailError(null);
    try {
      const detail = await loadProviderRequestDetailAction(id);
      if (token === detailGeneration.current) setSelectedRequest(detail);
    } catch {if (token === detailGeneration.current) setDetailError("This booking request could not be loaded. Please refresh or try again.");}
    finally {if (token === detailGeneration.current) setDetailLoading(false);}
  }
  async function handleAccept(): Promise<void> {
    if (
      !selectedRequest ||
      actionPending
    ) {
      return;
    }

    setActionPending(true);
    setActionError(null);
    setPayoutSetupRequired(false);

    try {
      await acceptProviderRequest({
        providerRequestId:
          selectedRequest.id,
      });

      setAction(null);
      setSelectedRequest(null);
      setDetailOpen(false);
      await loadPage({...filters, cursor: null}, [], 1);
      router.refresh();
    } catch (error) {
      setPayoutSetupRequired(
        error instanceof ProviderRequestActionError &&
          error.payoutSetupRequired,
      );
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to accept this request.",
      );
    } finally {
      setActionPending(false);
    }
  }

  async function handleReject(): Promise<void> {
    if (
      !selectedRequest ||
      actionPending
    ) {
      return;
    }

    const reason =
      rejectionReason.trim();

    if (reason.length < 5) {
      setActionError(
        "Please provide a decline reason of at least 5 characters.",
      );

      return;
    }

    if (reason.length > 500) {
      setActionError(
        "The decline reason cannot exceed 500 characters.",
      );

      return;
    }

    setActionPending(true);
    setActionError(null);

    try {
      await rejectProviderRequest({
        providerRequestId:
          selectedRequest.id,
        reason,
      });

      setAction(null);
      setRejectionReason("");
      setSelectedRequest(null);
      setDetailOpen(false);
      await loadPage({...filters, cursor: null}, [], 1);
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to decline this request.",
      );
    } finally {
      setActionPending(false);
    }
  }


  const columns: readonly DataTableColumn<ProviderRequestListItem>[] = [
    {id: "customer", header: "Customer", cell: request => <span className="font-semibold">{request.customer.name}</span>},
    {id: "event", header: "Event", cell: request => <span className="capitalize">{request.event.eventType.replaceAll("_", " ")}</span>},
    {id: "date", header: "Event Date", cell: request => formatDate(request.event.eventDate)},
    {id: "status", header: "Status", cell: request => <StatusBadge status={request.status} label={requestStatusLabel(request.status)} />},
    {id: "action", header: "Action", cell: request => <Button variant="ghost" size="compact" aria-label={`View Details for ${request.customer.name}`} onClick={() => void openRequest(request.id)}><Eye aria-hidden="true" className="size-4" />View Details</Button>},
  ];
  return <div className="grid min-w-0 gap-6">
    <PageHeading title="Booking Requests" description="Review and respond to customer booking requests." />
    <FilterToolbar searchValue={search} onSearchChange={setSearch} onSearchInvalidate={() => {generation.current++;}}
      onSearchSubmit={query => void loadPage({...filters, search: query, cursor: null})}
      onClearSearch={() => {setSearch(""); void loadPage({...filters, search: "", cursor: null});}}
      onClearFilters={() => {setSearch(""); void loadPage({status: "all", search: "", cursor: null});}}
      activeFilters={[...(filters.search ? [`Search: ${filters.search}`] : []), ...(filters.status !== "all" ? [statusFilters.find(item => item.value === filters.status)!.label] : [])]}
      searchLabel="Search booking requests" searchPlaceholder="Customer, booking reference, event or package"
      searchHint="Search your booking history. Use Next to continue through older records." loading={loading}
      filterControls={<div role="group" aria-label="Request status filters" className="flex flex-wrap gap-2">{statusFilters.map(option => <Button key={option.value} variant={filters.status === option.value ? "primary" : "secondary"} size="compact" aria-pressed={filters.status === option.value} disabled={loading} onClick={() => void loadPage({status: option.value, search: search.trim(), cursor: null})}>{option.label}</Button>)}</div>} />
    {filters.status === "new" ? (
      <p className="text-sm text-muted-foreground">
        Showing actionable new requests.{" "}
        <button
          type="button"
          className="font-semibold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            setSearch("");
            void loadPage({status: "all", search: "", cursor: null}, [], 1);
          }}
        >
          View request history
        </button>
      </p>
    ) : null}
    {page.skippedMalformedCount > 0 && !loading ? <p role="status" className="text-sm text-muted-foreground">Some booking records need review and could not be displayed. Contact FEASTA support if a request is missing.</p> : null}
    <DataTable columns={columns} rows={page.requests} getRowId={request => request.id} caption="Booking request results" loading={loading} error={loadError ?? undefined} onRetry={() => void loadPage(filters, history, pageNumber)}
      emptyTitle={page.hasMore ? "No matches in this part of your history" : filters.search || filters.status !== "all" ? "No matching requests" : "No booking requests yet"}
      emptyDescription={page.hasMore ? "Choose Next to continue searching older requests." : "Try another search or choose All to view request history."}
      renderMobileRow={request => <article className="grid gap-3 rounded-card border border-border bg-card p-4 shadow-card"><div className="flex flex-wrap justify-between gap-2"><h2 className="break-words font-semibold">{request.customer.name}</h2><StatusBadge status={request.status} label={requestStatusLabel(request.status)} /></div><p className="capitalize">{request.event.eventType.replaceAll("_", " ")}</p><p className="text-sm text-muted-foreground">{formatDate(request.event.eventDate)}</p><Button variant="secondary" size="compact" aria-label={`View Details for ${request.customer.name}`} onClick={() => void openRequest(request.id)}>View Details</Button></article>} />
    <CursorPagination previousCursor={history.at(-1) ?? null} nextCursor={page.nextCursor} loading={loading}
      pageLabel={`Page ${pageNumber}${page.hasMore ? " · More history available" : " · End of results"}`}
      onNext={cursor => void loadPage({...filters, cursor}, [...history, filters.cursor ?? "first"], pageNumber + 1)}
      onPrevious={cursor => void loadPage({...filters, cursor: cursor === "first" ? null : cursor}, history.slice(0, -1), Math.max(1, pageNumber - 1))} />
      {detailOpen && !selectedRequest ? <DetailDrawer open onOpenChange={open => {if (!open) {detailGeneration.current++; setDetailOpen(false);}}} title="Request details" description="Review the customer's event requirements before responding.">
        {detailLoading ? <p role="status">Loading request details…</p> : <ApplicationErrorState kind="load" description={detailError ?? "This request could not be loaded."} onRetry={() => detailId && void openRequest(detailId)} />}
      </DetailDrawer> : null}
      <ProviderRequestDetailDrawer
        request={selectedRequest}
        open={
          selectedRequest !== null
        }
        actionPending={actionPending}
        onAccept={() => {
          setActionError(null);
          setPayoutSetupRequired(false);
          setAction("accept");
        }}
        onReject={() => {
          setActionError(null);
          setRejectionReason("");
          setAction("reject");
        }}
        onOpenChange={(open) => {
          if (
            !open &&
            !actionPending
          ) {
            setSelectedRequest(null);
            setDetailOpen(false);
            detailGeneration.current++;
            setAction(null);
            setActionError(null);
            setPayoutSetupRequired(false);
            setRejectionReason("");
          }
        }}
      />

      <ManagementConfirmationModal
        open={action === "accept"}
        onOpenChange={(open) => {
          if (
            !open &&
            !actionPending
          ) {
            setAction(null);
            setActionError(null);
            setPayoutSetupRequired(false);
          }
        }}
        title="Accept this request?"
        description={
          selectedRequest
            ? providerRequestAcceptanceDescription(
              selectedRequest,
            )
            : "This request will be confirmed after you accept it."
        }
        confirmLabel={
          actionPending
            ? "Accepting..."
            : "Accept Request"
        }
        cancelLabel="Cancel"
        destructive={false}
        onConfirm={() => {
          void handleAccept();
        }}
      >
        {actionError ? (
          <div
            className="grid gap-3"
            role="alert"
          >
            <p className="rounded-md bg-destructive-subtle p-3 text-sm font-semibold text-destructive">
              {actionError}
            </p>

            {payoutSetupRequired ? (
              <Button
                type="button"
                variant="secondary"
                asChild
              >
                <Link href="/provider/payments">
                  Set up payouts
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </ManagementConfirmationModal>

      <ManagementModal
        open={action === "reject"}
        onOpenChange={(open) => {
          if (
            !open &&
            !actionPending
          ) {
            setAction(null);
            setActionError(null);
            setRejectionReason("");
          }
        }}
        title="Decline Request"
        description={
          "Tell the customer why you cannot accept this event request."
        }
        submitLabel="Decline Request"
        cancelLabel="Cancel"
        loading={actionPending}
        error={actionError ?? undefined}
        onSubmit={handleReject}
      >
        <div className="grid gap-2">
          <label
            htmlFor="provider-request-rejection-reason"
            className="text-sm font-medium"
          >
            Reason
          </label>

          <textarea
            id="provider-request-rejection-reason"
            value={rejectionReason}
            disabled={actionPending}
            minLength={5}
            maxLength={500}
            required
            rows={5}
            className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Explain why you cannot accept this request."
            onChange={(event) => {
              setRejectionReason(
                event.target.value,
              );

              if (actionError) {
                setActionError(null);
              }
            }}
          />

          <div className="flex justify-between gap-4 text-xs text-muted-foreground">
            <span>
              Minimum 5 characters
            </span>

            <span>
              {rejectionReason.length}/500
            </span>
          </div>
        </div>
      </ManagementModal>
    </div>;
}

function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date not provided";
  return new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeZone: "Asia/Manila"}).format(new Date(value));
}
