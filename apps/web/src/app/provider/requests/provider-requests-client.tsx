"use client";

import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Eye,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  acceptProviderRequest,
  rejectProviderRequest,
} from "@/lib/provider/requests/provider-request-client";

import {
  DataTable,
  FilterToolbar,
  SummaryCard,
  ManagementConfirmationModal,
  ManagementModal,
  type DataTableColumn,
} from "@/components/data";
import {
  PageHeading,
} from "@/components/layout/page-heading";
import {
  PriceDisplay,
} from "@/components/shared/price-display";
import {
  StatusBadge,
} from "@/components/shared/status-badge";
import {
  Button,
} from "@/components/ui/button";
import type {
  ProviderRequestListItem,
  ProviderRequestSummary,
} from "@/lib/provider/requests/provider-request-types";

import {
  ProviderRequestDetailDrawer,
} from "./provider-request-detail-drawer";

type ProviderRequestsClientProps = {
  initialRequests:
    ProviderRequestListItem[];

  initialSummary:
    ProviderRequestSummary;
};

export function ProviderRequestsClient({
  initialRequests,
  initialSummary,
}: ProviderRequestsClientProps) {

  const router =
  useRouter();

  const [
    action,
    setAction,
  ] = useState<
    "accept" | "reject" | null
  >(null);

  const [
    rejectionReason,
    setRejectionReason,
  ] = useState("");

  const [
    actionError,
    setActionError,
  ] = useState<string | null>(
    null,
  );

  const [
    actionPending,
    setActionPending,
  ] = useState(false);
  const [
    search,
    setSearch,
  ] = useState("");

  const [
    submittedSearch,
    setSubmittedSearch,
  ] = useState("");

  const [
    selectedRequest,
    setSelectedRequest,
  ] = useState<
    ProviderRequestListItem | null
  >(null);

  const filteredRequests =
    useMemo(() => {
      const term =
        submittedSearch
          .trim()
          .toLowerCase();

      if (!term) {
        return initialRequests;
      }
      return initialRequests.filter(
        (request) => {
          const searchableValues = [
            request.customer.name,
            request.customer.email,
            request.package?.name,
            request.event.eventType,
            request.event.venueAddress,
            request.event.city,
            request.type,
            request.status,
          ];

          return searchableValues.some(
            (value) =>
              value
                ?.toLowerCase()
                .includes(term),
          );
        },
      );
    }, [
      initialRequests,
      submittedSearch,
    ]);

  async function handleAccept(): Promise<void> {
    if (
      !selectedRequest ||
      actionPending
    ) {
      return;
    }

    setActionPending(true);
    setActionError(null);

    try {
      await acceptProviderRequest({
        providerRequestId:
          selectedRequest.id,
      });

      setAction(null);
      setSelectedRequest(null);

      router.refresh();
    } catch (error) {
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
        "Please provide a rejection reason of at least 5 characters.",
      );

      return;
    }

    if (reason.length > 500) {
      setActionError(
        "The rejection reason cannot exceed 500 characters.",
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

      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to reject this request.",
      );
    } finally {
      setActionPending(false);
    }
  }

  const columns =
    useMemo<
      readonly DataTableColumn<
        ProviderRequestListItem
      >[]
    >(
      () => [
        {
          id: "customer",
          header: "Customer",
          sortable: true,
          cell: (request) => (
            <div className="grid gap-1">
              <span className="font-medium text-foreground">
                {request.customer.name}
              </span>

              <span className="text-sm text-muted-foreground">
                {formatRequestType(
                  request.type,
                )}
              </span>
            </div>
          ),
        },
        {
          id: "event",
          header: "Event",
          cell: (request) => (
            <div className="grid gap-1">
              <span className="font-medium text-foreground">
                {formatEventType(
                  request.event.eventType,
                )}
              </span>

              {request.package?.name ? (
                <span className="text-sm text-muted-foreground">
                  {request.package.name}
                </span>
              ) : null}
            </div>
          ),
        },
        {
          id: "date",
          header: "Event date",
          sortable: true,
          cell: (request) => (
            <span className="whitespace-nowrap">
              {formatDate(
                request.event.eventDate,
              )}
            </span>
          ),
        },
        {
          id: "guests",
          header: "Guests",
          cell: (request) => (
            <span className="whitespace-nowrap">
              {request.event.guestCount !==
              null
                ? request.event.guestCount
                    .toLocaleString(
                      "en-PH",
                    )
                : "—"}
            </span>
          ),
        },
        {
          id: "amount",
          header: "Amount",
          sortable: true,
          cell: (request) => (
            <PriceDisplay
              amount={request.amount}
            />
          ),
        },
        {
          id: "status",
          header: "Status",
          cell: (request) => (
            <StatusBadge
              status={request.status}
            />
          ),
        },
        {
          id: "actions",
          header: "Actions",
          cell: (request) => (
            <Button
              type="button"
              variant="ghost"
              size="compact"
              aria-label={
                `View request from ${request.customer.name}`
              }
              onClick={() => {
                setSelectedRequest(
                  request,
                );
              }}
            >
              <Eye
                className="size-4"
                aria-hidden="true"
              />

              <span>View</span>
            </Button>
          ),
        },
      ],
      [],
    );

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Provider management"
        title="Requests"
        description={
          "Review customer event requests assigned to your FEASTA business."
        }
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Request summary"
      >
        <SummaryCard
          label="New requests"
          value={
            initialSummary.pending
          }
          icon={
            <ClipboardCheck className="size-6" />
          }
        />

        <SummaryCard
          label="Awaiting payment"
          value={
            initialSummary.awaitingPayment
          }
          icon={
            <Clock3 className="size-6" />
          }
        />

        <SummaryCard
          label="Confirmed"
          value={
            initialSummary.confirmed
          }
          icon={
            <CalendarDays className="size-6" />
          }
        />

        <SummaryCard
          label="Completed"
          value={
            initialSummary.completed
          }
          icon={
            <CheckCircle2 className="size-6" />
          }
        />
      </section>

      <FilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={
          setSubmittedSearch
        }
        onClearFilters={() => {
          setSearch("");
          setSubmittedSearch("");
        }}
        activeFilters={
          submittedSearch
            ? [
                `Search: ${submittedSearch}`,
              ]
            : []
        }
        searchPlaceholder="Search requests"
      />

      <DataTable
        columns={columns}
        rows={filteredRequests}
        getRowId={(request) =>
          request.id
        }
        caption="Provider request results"
        emptyKind={
          submittedSearch
            ? "search"
            : undefined
        }
        emptyTitle={
          submittedSearch
            ? "No matching requests"
            : "No requests yet"
        }
        emptyDescription={
          submittedSearch
            ? "No provider requests match your current search."
            : "Customer booking requests assigned to your business will appear here."
        }
      />

      <ProviderRequestDetailDrawer
        request={selectedRequest}
        open={
          selectedRequest !== null
        }
        actionPending={actionPending}
        onAccept={() => {
          setActionError(null);
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
            setAction(null);
            setActionError(null);
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
          }
        }}
        title="Accept this request?"
        description={
          selectedRequest?.downPaymentAmount
            ? "The customer will be asked to complete the required down payment after you accept."
            : "This request will be confirmed after you accept it."
        }
        confirmLabel={
          actionPending
            ? "Accepting..."
            : "Accept request"
        }
        cancelLabel="Cancel"
        destructive={false}
        onConfirm={() => {
          void handleAccept();
        }}
      />

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
        title="Reject request"
        description={
          "Tell the customer why you cannot accept this event request."
        }
        submitLabel="Reject request"
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
    </div>
  );
}

function formatEventType(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function formatRequestType(
  value: string,
): string {
  return value === "addon"
    ? "Event service"
    : "Catering";
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "medium",
      timeZone: "Asia/Manila",
    },
  ).format(date);
}