"use client";

import {
  AlertTriangle,
  Eye,
  FileWarning,
  MessageSquareWarning,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  loadAdminComplaintsAction,
  manageAdminComplaintAction,
} from "@/app/admin/complaints/actions";
import {
  CursorPagination,
} from "@/components/data/cursor-pagination";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data/data-table";
import {
  DetailDrawer,
} from "@/components/data/detail-drawer";
import {
  FilterToolbar,
} from "@/components/data/filter-toolbar";
import {
  SummaryCard,
} from "@/components/data/summary-card";
import {
  feastaToast,
} from "@/components/feedback/toast";
import {
  PageHeading,
} from "@/components/layout/page-heading";
import {
  ConfirmationDialog,
} from "@/components/shared/confirmation-dialog";
import {
  Badge,
} from "@/components/ui/badge";
import {
  Button,
} from "@/components/ui/button";
import {
  Select,
} from "@/components/ui/select";
import {
  Textarea,
} from "@/components/ui/textarea";
import type {
  AdminComplaint,
  AdminComplaintDecision,
  AdminComplaintFilters,
  AdminComplaintPage,
} from "@/lib/admin/complaints/admin-complaint-types";
import {
  cn,
} from "@/lib/utils";

type ComplaintManagementClientProps = {
  initialPage: AdminComplaintPage;
};

const DEFAULT_FILTERS: AdminComplaintFilters = {
  search: "",
  status: "all",
  priority: "all",
  pageSize: 10,
  cursor: null,
};

const decisionLabels: Record<
  AdminComplaintDecision,
  string
> = {
  start_review: "Start review",
  request_customer_response:
    "Request customer response",
  request_provider_response:
    "Request provider response",
  escalate: "Escalate complaint",
  resolve: "Resolve complaint",
  dismiss: "Dismiss complaint",
  close: "Close complaint",
  reopen: "Reopen review",
};

function ComplaintManagementClient({
  initialPage,
}: ComplaintManagementClientProps) {
  const [
    page,
    setPage,
  ] = useState(initialPage);

  const [
    filters,
    setFilters,
  ] = useState(DEFAULT_FILTERS);

  const [
    searchValue,
    setSearchValue,
  ] = useState("");

  const [
    cursorHistory,
    setCursorHistory,
  ] = useState<(string | null)[]>([
    null,
  ]);

  const [
    selected,
    setSelected,
  ] = useState<AdminComplaint | null>(
    null,
  );

  const [
    drawerOpen,
    setDrawerOpen,
  ] = useState(false);

  const [
    decisionOpen,
    setDecisionOpen,
  ] = useState(false);

  const [
    decision,
    setDecision,
  ] =
    useState<AdminComplaintDecision>(
      "start_review",
    );

  const [
    priority,
    setPriority,
  ] = useState<
    AdminComplaint["priority"]
  >("normal");

  const [
    publicResponse,
    setPublicResponse,
  ] = useState("");

  const [
    internalReason,
    setInternalReason,
  ] = useState("");

  const [
    pageError,
    setPageError,
  ] = useState<string>();

  const [
    mutation,
    setMutation,
  ] = useState(false);

  const [
    isPending,
    startTransition,
  ] = useTransition();

  const loadPage = useCallback(
    (
      nextFilters:
        AdminComplaintFilters,
      cursor: string | null,
      history:
        (string | null)[],
    ) => {
      setPageError(undefined);

      const request = {
        ...nextFilters,
        cursor,
      };

      startTransition(
        async () => {
          try {
            const result =
              await loadAdminComplaintsAction(
                request,
              );

            setPage(result);
            setFilters(request);
            setCursorHistory(
              history,
            );
          } catch (
            caughtError: unknown
          ) {
            setPageError(
              errorMessage(
                caughtError,
              ),
            );
          }
        },
      );
    },
    [],
  );

  const reloadFirstPage =
    useCallback(
      async () => {
        const request = {
          ...filters,
          cursor: null,
        };

        const result =
          await loadAdminComplaintsAction(
            request,
          );

        setPage(result);
        setFilters(request);
        setCursorHistory([
          null,
        ]);
        setSelected(null);
        setDrawerOpen(false);
      },
      [filters],
    );

  const applyFilters =
    useCallback(
      (
        changes: Partial<AdminComplaintFilters>,
      ) => {
        loadPage(
          {
            ...filters,
            ...changes,
            cursor: null,
          },
          null,
          [null],
        );
      },
      [
        filters,
        loadPage,
      ],
    );

  const clearFilters =
    useCallback(() => {
      setSearchValue("");

      loadPage(
        DEFAULT_FILTERS,
        null,
        [null],
      );
    }, [loadPage]);

  const activeFilters =
    useMemo(
      () =>
        complaintFilterLabels(
          filters,
        ),
      [filters],
    );

  const openDetails = (
    complaint: AdminComplaint,
  ) => {
    setSelected(complaint);
    setDrawerOpen(true);
  };

  const openDecision = () => {
    if (!selected) {
      return;
    }

    const options =
      availableDecisions(
        selected.status,
      );

    setDecision(
      options[0] ??
        "start_review",
    );

    setPriority(
      selected.priority,
    );

    setPublicResponse("");
    setInternalReason("");

    /*
     * Avoid stacking the decision dialog over the
     * details drawer. Restore the drawer if cancelled.
     */
    setDrawerOpen(false);
    setDecisionOpen(true);
  };

  const handleDecisionOpenChange = (
    open: boolean,
  ) => {
    if (mutation) {
      return;
    }

    setDecisionOpen(open);

    if (
      !open &&
      selected
    ) {
      setDrawerOpen(true);
    }
  };

  const submitDecision =
    async () => {
      if (
        !selected ||
        mutation
      ) {
        return;
      }

      setMutation(true);

      try {
        await manageAdminComplaintAction(
          {
            complaintId:
              selected.id,
            decision,
            priority,
            publicResponse,
            internalReason,
          },
        );

        await reloadFirstPage();

        setDecisionOpen(false);

        feastaToast.success(
          "Complaint decision recorded.",
        );
      } catch (
        caughtError: unknown
        ) {
        feastaToast.error(
            errorMessage(
            caughtError,
            ),
        );
        } finally {
        setMutation(false);
      }
    };

  const columns =
    useMemo<
      readonly DataTableColumn<AdminComplaint>[]
    >(
      () => [
        {
          id: "complaint",
          header: "Complaint",
          cell: (complaint) => (
            <div className="grid gap-1">
              <span className="font-bold text-foreground">
                {categoryLabel(
                  complaint.category,
                )}
              </span>

              <span className="line-clamp-2 text-sm text-muted-foreground">
                {
                  complaint.description
                }
              </span>

              <span className="font-mono text-xs text-muted-foreground">
                {complaint.id}
              </span>
            </div>
          ),
        },
        {
          id: "complainant",
          header: "Complainant",
          cell: (complaint) => (
            <div className="grid gap-1">
              <span className="font-semibold">
                {
                  complaint.complainantName
                }
              </span>

              <span className="text-sm text-muted-foreground">
                {
                  complaint.complainantEmail ||
                  "Email unavailable"
                }
              </span>
            </div>
          ),
        },
        {
          id: "status",
          header: "Status",
          cell: (complaint) => (
            <ComplaintStatusBadge
              status={
                complaint.status
              }
            />
          ),
        },
        {
          id: "priority",
          header: "Priority",
          cell: (complaint) => (
            <ComplaintPriorityBadge
              priority={
                complaint.priority
              }
            />
          ),
        },
        {
          id: "createdAt",
          header: "Submitted",
          cell: (complaint) =>
            formatDate(
              complaint.createdAt,
            ),
        },
      ],
      [],
    );

  const openComplaintCount =
    page.statistics.submitted +
    page.statistics.underReview +
    page.statistics
      .awaitingResponse +
    page.statistics.escalated;

  const publicResponseRequired =
    decision !==
      "start_review";

  const confirmationDisabled =
    internalReason.trim().length <
      10 ||
    (
      publicResponseRequired &&
      publicResponse.trim().length <
        10
    );

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Complaints"
        description="Review, investigate, resolve, and audit customer and provider complaints."
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Complaint statistics"
      >
        <SummaryCard
          label="All complaints"
          value={
            page.statistics
              .totalComplaints
          }
          icon={
            <MessageSquareWarning />
          }
        />

        <SummaryCard
          label="Open cases"
          value={
            openComplaintCount
          }
          icon={<FileWarning />}
        />

        <SummaryCard
          label="Under review"
          value={
            page.statistics
              .underReview
          }
          icon={<SearchCheck />}
        />

        <SummaryCard
          label="Escalated"
          value={
            page.statistics
              .escalated
          }
          icon={
            <AlertTriangle />
          }
        />
      </section>

      <FilterToolbar
        searchValue={
          searchValue
        }
        onSearchChange={
          setSearchValue
        }
        onSearchSubmit={(
          search,
        ) =>
          applyFilters({
            search,
          })
        }
        onClearFilters={
          clearFilters
        }
        activeFilters={
          activeFilters
        }
        loading={isPending}
        searchLabel="Search complaints"
        searchPlaceholder="Search ID, complainant, category, or description"
        filterControls={
          <>
            <label className="grid gap-2 text-sm font-bold">
              Status

              <Select
                value={
                  filters.status
                }
                disabled={
                  isPending
                }
                onChange={(
                  event,
                ) =>
                  applyFilters({
                    status:
                      event
                        .currentTarget
                        .value as
                        AdminComplaintFilters["status"],
                  })
                }
              >
                <option value="all">
                  All statuses
                </option>
                <option value="submitted">
                  Submitted
                </option>
                <option value="under_review">
                  Under review
                </option>
                <option value="awaiting_customer">
                  Awaiting customer
                </option>
                <option value="awaiting_provider">
                  Awaiting provider
                </option>
                <option value="escalated">
                  Escalated
                </option>
                <option value="resolved">
                  Resolved
                </option>
                <option value="dismissed">
                  Dismissed
                </option>
                <option value="closed">
                  Closed
                </option>
              </Select>
            </label>

            <label className="grid gap-2 text-sm font-bold">
              Priority

              <Select
                value={
                  filters.priority
                }
                disabled={
                  isPending
                }
                onChange={(
                  event,
                ) =>
                  applyFilters({
                    priority:
                      event
                        .currentTarget
                        .value as
                        AdminComplaintFilters["priority"],
                  })
                }
              >
                <option value="all">
                  All priorities
                </option>
                <option value="low">
                  Low
                </option>
                <option value="normal">
                  Normal
                </option>
                <option value="high">
                  High
                </option>
                <option value="urgent">
                  Urgent
                </option>
              </Select>
            </label>
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={page.complaints}
        getRowId={(
          complaint,
        ) => complaint.id}
        caption="FEASTA complaint records"
        loading={isPending}
        error={pageError}
        emptyTitle={
          activeFilters.length > 0
            ? "No matching complaints"
            : "No complaints submitted"
        }
        emptyDescription={
          activeFilters.length > 0
            ? "Try changing your search or clearing a filter."
            : "Customer and provider complaints will appear here after submission."
        }
        rowActionsLabel="Details"
        rowActions={(
          complaint,
        ) => (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() =>
              openDetails(
                complaint,
              )
            }
            aria-label={`View complaint ${complaint.id}`}
          >
            <Eye aria-hidden="true" />
            View
          </Button>
        )}
        renderMobileRow={(
          complaint,
        ) => (
          <ComplaintMobileCard
            complaint={
              complaint
            }
            onView={() =>
              openDetails(
                complaint,
              )
            }
          />
        )}
      />

      {page.complaints.length >
      0 ? (
        <CursorPagination
          previousCursor={
            cursorHistory.length >
            1
              ? "previous"
              : null
          }
          nextCursor={
            page.nextCursor
          }
          onPrevious={() => {
            const history =
              cursorHistory.slice(
                0,
                -1,
              );

            loadPage(
              filters,
              history.at(-1) ??
                null,
              history,
            );
          }}
          onNext={(cursor) => {
            const history = [
              ...cursorHistory,
              cursor,
            ];

            loadPage(
              filters,
              cursor,
              history,
            );
          }}
          pageLabel={`Showing ${page.complaints.length} complaint${
            page.complaints
              .length === 1
              ? ""
              : "s"
          }`}
          loading={isPending}
        />
      ) : null}

      <DetailDrawer
        open={drawerOpen}
        onOpenChange={
          setDrawerOpen
        }
        title="Complaint details"
        description="Review the complaint, involved accounts, lifecycle status, evidence, and administrative resolution."
        footer={
          selected ? (
            <Button
              type="button"
              className="w-full"
              onClick={
                openDecision
              }
            >
              <ShieldCheck aria-hidden="true" />
              Manage complaint
            </Button>
          ) : undefined
        }
      >
        {selected ? (
          <ComplaintDetails
            complaint={
              selected
            }
          />
        ) : null}
      </DetailDrawer>

      {selected ? (
        <ConfirmationDialog
          open={decisionOpen}
          onOpenChange={
            handleDecisionOpenChange
          }
          title="Manage complaint"
          description={`Record a controlled and auditable decision for complaint ${selected.id}.`}
          confirmLabel={
            decisionLabels[
              decision
            ]
          }
          loading={mutation}
          loadingLabel="Recording decision"
          confirmDisabled={
            confirmationDisabled
          }
          destructive={
            decision ===
              "dismiss" ||
            decision === "close"
          }
          contentClassName="sm:max-w-3xl"
          bodyClassName="max-h-[65vh] overflow-y-auto pr-2"
          onConfirm={
            submitDecision
          }
        >
          <div className="grid gap-5">
            <label className="grid gap-2 font-semibold">
              Decision

              <Select
                value={decision}
                disabled={mutation}
                onChange={(
                  event,
                ) =>
                  setDecision(
                    event
                      .currentTarget
                      .value as
                      AdminComplaintDecision,
                  )
                }
              >
                {availableDecisions(
                  selected.status,
                ).map(
                  (
                    option,
                  ) => (
                    <option
                      key={
                        option
                      }
                      value={
                        option
                      }
                    >
                      {
                        decisionLabels[
                          option
                        ]
                      }
                    </option>
                  ),
                )}
              </Select>
            </label>

            <label className="grid gap-2 font-semibold">
              Priority

              <Select
                value={priority}
                disabled={mutation}
                onChange={(
                  event,
                ) =>
                  setPriority(
                    event
                      .currentTarget
                      .value as
                      AdminComplaint["priority"],
                  )
                }
              >
                <option value="low">
                  Low
                </option>
                <option value="normal">
                  Normal
                </option>
                <option value="high">
                  High
                </option>
                <option value="urgent">
                  Urgent
                </option>
              </Select>
            </label>

            <label className="grid gap-2 font-semibold">
              Response for the affected user

              <span className="text-sm font-normal text-muted-foreground">
                This message may be shown to the complaint owner or provider. Do not include confidential investigation details.
              </span>

              <Textarea
                value={
                  publicResponse
                }
                disabled={mutation}
                maxLength={2000}
                placeholder={
                  publicResponseRequired
                    ? "Explain the decision clearly and respectfully."
                    : "Optional message explaining that the complaint is under review."
                }
                onChange={(
                  event,
                ) =>
                  setPublicResponse(
                    event
                      .currentTarget
                      .value,
                  )
                }
              />

              <span className="text-right text-xs text-muted-foreground">
                {
                  publicResponse.length
                }
                /2000
                {publicResponseRequired
                  ? " · Minimum 10"
                  : " · Optional"}
              </span>
            </label>

            <label className="grid gap-2 font-semibold">
              Internal administrative reason

              <span className="text-sm font-normal text-muted-foreground">
                Private audit information visible only to authorized administrators.
              </span>

              <Textarea
                value={
                  internalReason
                }
                disabled={mutation}
                maxLength={2000}
                placeholder="Record the evidence, policy, request, or operational reason supporting this decision."
                onChange={(
                  event,
                ) =>
                  setInternalReason(
                    event
                      .currentTarget
                      .value,
                  )
                }
              />

              <span className="text-right text-xs text-muted-foreground">
                {
                  internalReason.length
                }
                /2000 · Minimum 10
              </span>
            </label>
          </div>
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}

function ComplaintDetails({
  complaint,
}: {
  complaint: AdminComplaint;
}) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <ComplaintStatusBadge
            status={
              complaint.status
            }
          />

          <ComplaintPriorityBadge
            priority={
              complaint.priority
            }
          />
        </div>

        <h3 className="text-lg font-bold">
          {categoryLabel(
            complaint.category,
          )}
        </h3>

        <p className="whitespace-pre-wrap text-muted-foreground">
          {complaint.description}
        </p>
      </section>

      <DetailSection
        title="Complainant"
        rows={[
          [
            "Name",
            complaint.complainantName,
          ],
          [
            "Email",
            complaint.complainantEmail ||
              "Unavailable",
          ],
          [
            "Role",
            complaint.complainantRole ||
              "Unavailable",
          ],
        ]}
      />

      {complaint.providerId ? (
        <DetailSection
          title="Related provider"
          rows={[
            [
              "Provider",
              complaint.providerName ||
                "Unnamed provider",
            ],
            [
              "Provider ID",
              complaint.providerId,
            ],
          ]}
        />
      ) : null}

      <DetailSection
        title="Case information"
        rows={[
          [
            "Complaint ID",
            complaint.id,
          ],
          [
            "Submitted",
            formatDate(
              complaint.createdAt,
            ),
          ],
          [
            "Last updated",
            formatDate(
              complaint.updatedAt,
            ),
          ],
          [
            "Resolved",
            formatDate(
              complaint.resolvedAt,
            ),
          ],
        ]}
      />

      {complaint.resolution ? (
        <section className="rounded-xl border border-border bg-muted/30 p-4">
          <h3 className="font-bold">
            Resolution
          </h3>

          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {
              complaint.resolution
            }
          </p>
        </section>
      ) : null}

      <section>
        <h3 className="font-bold">
          Evidence
        </h3>

        {complaint.evidenceUrls
          .length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {complaint.evidenceUrls.map(
              (
                evidenceUrl,
                index,
              ) => (
                <li
                  key={`${evidenceUrl}-${index}`}
                  className="rounded-lg border border-border p-3 text-sm"
                >
                  Evidence item{" "}
                  {index + 1}
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No evidence files were attached.
          </p>
        )}
      </section>
    </div>
  );
}

function DetailSection({
  title,
  rows,
}: {
  title: string;
  rows: readonly (
    readonly [
      string,
      string,
    ]
  )[];
}) {
  return (
    <section>
      <h3 className="font-bold">
        {title}
      </h3>

      <dl className="mt-3 divide-y divide-border rounded-xl border border-border bg-card px-4">
        {rows.map(
          ([label, value]) => (
            <div
              key={label}
              className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]"
            >
              <dt className="text-sm font-semibold text-muted-foreground">
                {label}
              </dt>

              <dd className="min-w-0 break-words text-sm">
                {value}
              </dd>
            </div>
          ),
        )}
      </dl>
    </section>
  );
}

function ComplaintMobileCard({
  complaint,
  onView,
}: {
  complaint: AdminComplaint;
  onView: () => void;
}) {
  return (
    <article className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <ComplaintStatusBadge
            status={
              complaint.status
            }
          />

          <ComplaintPriorityBadge
            priority={
              complaint.priority
            }
          />
        </div>

        <h3 className="font-bold">
          {categoryLabel(
            complaint.category,
          )}
        </h3>

        <p className="line-clamp-3 text-sm text-muted-foreground">
          {complaint.description}
        </p>
      </div>

      <div className="text-sm">
        <p className="font-semibold">
          {complaint.complainantName}
        </p>

        <p className="text-muted-foreground">
          {formatDate(
            complaint.createdAt,
          )}
        </p>
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={onView}
      >
        <Eye aria-hidden="true" />
        View complaint
      </Button>
    </article>
  );
}

function ComplaintStatusBadge({
  status,
}: {
  status: AdminComplaint["status"];
}) {
  return (
    <Badge
      className={cn(
        "capitalize",
        status === "resolved" &&
          "bg-success-subtle text-success",
        status === "closed" &&
          "bg-muted text-muted-foreground",
        status === "dismissed" &&
          "bg-destructive-subtle text-destructive",
        status === "escalated" &&
          "bg-warning-subtle text-warning",
      )}
    >
      {status.replaceAll(
        "_",
        " ",
      )}
    </Badge>
  );
}

function ComplaintPriorityBadge({
  priority,
}: {
  priority:
    AdminComplaint["priority"];
}) {
  return (
    <Badge
      className={cn(
        "capitalize",
        priority === "urgent" &&
          "bg-destructive-subtle text-destructive",
        priority === "high" &&
          "bg-warning-subtle text-warning",
        priority === "low" &&
          "bg-muted text-muted-foreground",
      )}
    >
      {priority}
    </Badge>
  );
}

function availableDecisions(
  status: AdminComplaint["status"],
): AdminComplaintDecision[] {
  switch (status) {
    case "submitted":
      return [
        "start_review",
        "escalate",
        "dismiss",
      ];

    case "under_review":
      return [
        "request_customer_response",
        "request_provider_response",
        "resolve",
        "escalate",
        "dismiss",
      ];

    case "awaiting_customer":
    case "awaiting_provider":
      return [
        "start_review",
        "resolve",
        "escalate",
        "dismiss",
      ];

    case "escalated":
      return [
        "start_review",
        "request_customer_response",
        "request_provider_response",
        "resolve",
        "dismiss",
      ];

    case "resolved":
    case "dismissed":
      return [
        "close",
        "reopen",
      ];

    case "closed":
      return [
        "reopen",
      ];
  }
}

function complaintFilterLabels(
  filters: AdminComplaintFilters,
) {
  const labels: string[] = [];

  if (filters.search) {
    labels.push(
      `Search: ${filters.search}`,
    );
  }

  if (
    filters.status !== "all"
  ) {
    labels.push(
      `Status: ${filters.status.replaceAll(
        "_",
        " ",
      )}`,
    );
  }

  if (
    filters.priority !== "all"
  ) {
    labels.push(
      `Priority: ${filters.priority}`,
    );
  }

  return labels;
}

function categoryLabel(
  value: string,
) {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/gu,
      (character) =>
        character.toUpperCase(),
    );
}

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "Not available";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone:
        "Asia/Manila",
    },
  ).format(date);
}

function errorMessage(
  error: unknown,
) {
  return error instanceof Error &&
    error.message.trim()
    ? error.message
    : "The complaint operation could not be completed.";
}

export {
  ComplaintManagementClient,
  type ComplaintManagementClientProps,
};