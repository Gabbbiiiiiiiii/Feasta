"use client";

import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  MapPin,
  Phone,
  Search,
  Store,
  UserRound,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  approveVerificationAction,
  rejectVerificationAction,
} from "@/app/admin/providers/actions";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import {
  canApproveVerification,
  verificationFilterLabels,
  verificationFilters,
  type ProviderVerificationApplication,
  type VerificationApplicationStatus,
  type VerificationFilter,
} from "@/lib/admin/provider-verification/provider-verification-types";
import { cn } from "@/lib/utils";

type ProviderVerificationClientProps = {
  initialApplications: ProviderVerificationApplication[];
};

function statusLabel(
  status: VerificationApplicationStatus,
) {
  switch (status) {
    case "under_review":
      return "Under Review";

    case "approved":
      return "Approved";

    case "rejected":
      return "Rejected";

    case "pending":
      return "Pending";
  }
}

function statusClass(
  status: VerificationApplicationStatus,
) {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-700";

    case "under_review":
      return "bg-blue-100 text-blue-700";

    case "rejected":
      return "bg-red-100 text-red-700";

    case "pending":
      return "bg-amber-100 text-amber-700";
  }
}

function ProviderVerificationClient({
  initialApplications,
}: ProviderVerificationClientProps) {
  const router = useRouter();

  const [isPending, startTransition] =
    useTransition();

  const [applications, setApplications] =
    useState(initialApplications);

  const [filter, setFilter] =
    useState<VerificationFilter>("all");

  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] =
    useState<string | null>(
      initialApplications[0]?.id ?? null,
    );

  const [pendingAction, setPendingAction] =
    useState<"approve" | "reject" | null>(null);

  const [showRejectForm, setShowRejectForm] =
    useState(false);

  const [rejectionReason, setRejectionReason] =
    useState("");

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [actionSuccess, setActionSuccess] =
    useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: applications.length,

      pending: applications.filter(
        (application) =>
          application.status === "pending",
      ).length,

      under_review: applications.filter(
        (application) =>
          application.status === "under_review",
      ).length,

      approved: applications.filter(
        (application) =>
          application.status === "approved",
      ).length,

      rejected: applications.filter(
        (application) =>
          application.status === "rejected",
      ).length,
    }),
    [applications],
  );

  const visibleApplications = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return applications.filter((application) => {
      const matchesFilter =
        filter === "all" ||
        application.status === filter;

      const matchesSearch =
        !normalizedSearch ||
        [
          application.businessName,
          application.ownerName,
          application.email,
          application.providerType,
          application.location,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [applications, filter, search]);

  const selected =
    visibleApplications.find(
      (application) =>
        application.id === selectedId,
    ) ??
    visibleApplications[0] ??
    null;

  const selectApplication = (
    applicationId: string,
  ) => {
    setSelectedId(applicationId);
    setShowRejectForm(false);
    setRejectionReason("");
    setActionError(null);
    setActionSuccess(null);
  };

  const approveSelected = () => {
    if (
      !selected ||
      !canApproveVerification(selected) ||
      isPending
    ) {
      return;
    }

    const selectedApplication = selected;

    setActionError(null);
    setActionSuccess(null);
    setPendingAction("approve");

    startTransition(async () => {
      try {
        const result =
          await approveVerificationAction(
            selectedApplication.id,
            selectedApplication.providerId,
          );

        if (!result.success) {
          setActionError(result.error);
          return;
        }

        setApplications((current) =>
          current.map((application) =>
            application.id ===
            selectedApplication.id
              ? {
                  ...application,
                  status: "approved",
                  rejectionReason: null,
                }
              : application,
          ),
        );

        setShowRejectForm(false);
        setRejectionReason("");

        setActionSuccess(
          `${selectedApplication.businessName} has been approved.`,
        );

        router.refresh();
      } catch {
        setActionError(
          "Unable to approve the verification application.",
        );
      } finally {
        setPendingAction(null);
      }
    });
  };

  const rejectSelected = () => {
    if (!selected || isPending) {
      return;
    }

    const normalizedReason =
      rejectionReason.trim();

    if (normalizedReason.length < 10) {
      setActionError(
        "Provide a rejection reason with at least 10 characters.",
      );
      return;
    }

    const selectedApplication = selected;

    setActionError(null);
    setActionSuccess(null);
    setPendingAction("reject");

    startTransition(async () => {
      try {
        const result =
          await rejectVerificationAction(
            selectedApplication.id,
            selectedApplication.providerId,
            normalizedReason,
          );

        if (!result.success) {
          setActionError(result.error);
          return;
        }

        setApplications((current) =>
          current.map((application) =>
            application.id ===
            selectedApplication.id
              ? {
                  ...application,
                  status: "rejected",
                  rejectionReason:
                    normalizedReason,
                }
              : application,
          ),
        );

        setShowRejectForm(false);
        setRejectionReason("");

        setActionSuccess(
          `${selectedApplication.businessName} has been rejected.`,
        );

        router.refresh();
      } catch {
        setActionError(
          "Unable to reject the verification application.",
        );
      } finally {
        setPendingAction(null);
      }
    });
  };

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <PageHeading
          eyebrow="Account Administration"
          title="Provider Verification"
          description="Review and verify catering and event-service providers."
        />

        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-center">
            <p className="text-xl font-black text-amber-600">
              {counts.pending}
            </p>

            <p className="text-xs font-semibold text-amber-700">
              Pending
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-center">
            <p className="text-xl font-black text-blue-600">
              {counts.under_review}
            </p>

            <p className="text-xs font-semibold text-blue-700">
              Under Review
            </p>
          </div>

          <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-center">
            <p className="text-xl font-black text-green-600">
              {counts.approved}
            </p>

            <p className="text-xs font-semibold text-green-700">
              Approved
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          />

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.currentTarget.value)
            }
            placeholder="Search providers..."
            className="min-h-12 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />

          <span className="sr-only">
            Search provider applications
          </span>
        </label>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card">
          <div className="flex overflow-x-auto border-b border-border">
            {verificationFilters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setFilter(item);
                  setShowRejectForm(false);
                  setRejectionReason("");
                  setActionError(null);
                  setActionSuccess(null);
                }}
                className={cn(
                  "relative min-h-12 shrink-0 px-4 text-sm font-semibold text-muted-foreground",
                  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  filter === item &&
                    "text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary",
                )}
              >
                {verificationFilterLabels[item]}

                {item === "all"
                  ? ` (${counts.all})`
                  : ` (${counts[item]})`}
              </button>
            ))}
          </div>

          <div className="grid max-h-[48rem] gap-3 overflow-y-auto p-4">
            {visibleApplications.length === 0 ? (
              <div className="grid min-h-56 place-items-center text-center">
                <div>
                  <Store className="mx-auto size-10 text-muted-foreground" />

                  <p className="mt-3 font-bold">
                    No applications found
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    No providers match the current filters.
                  </p>
                </div>
              </div>
            ) : (
              visibleApplications.map((application) => {
                const active =
                  application.id === selected?.id;

                return (
                  <button
                    key={application.id}
                    type="button"
                    onClick={() =>
                      selectApplication(
                        application.id,
                      )
                    }
                    className={cn(
                      "flex min-w-0 items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
                      <Building2
                        aria-hidden="true"
                        className="size-6"
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {application.businessName}
                      </span>

                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        Submitted{" "}
                        {application.submittedAt}
                      </span>

                      <span
                        className={cn(
                          "mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                          statusClass(
                            application.status,
                          ),
                        )}
                      >
                        {statusLabel(
                          application.status,
                        )}
                      </span>
                    </span>

                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 text-muted-foreground"
                    />
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="min-w-0 rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
          {!selected ? (
            <div className="grid min-h-[36rem] place-items-center text-center">
              <div>
                <Eye className="mx-auto size-10 text-muted-foreground" />

                <p className="mt-3 font-bold">
                  Select an application
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a provider to review its
                  application.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              <header className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="grid size-16 shrink-0 place-items-center rounded-full bg-orange-100 text-orange-600">
                    <Store
                      aria-hidden="true"
                      className="size-8"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words text-xl font-black">
                        {selected.businessName}
                      </h2>

                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          statusClass(
                            selected.status,
                          ),
                        )}
                      >
                        {statusLabel(selected.status)}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Submitted {selected.submittedAt} ·
                      ID: {selected.id}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                  >
                    <Eye aria-hidden="true" />
                    View Profile
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      setShowRejectForm(true);
                      setActionError(null);
                      setActionSuccess(null);
                    }}
                    disabled={
                      isPending ||
                      selected.status === "approved" ||
                      selected.status === "rejected"
                    }
                  >
                    <XCircle aria-hidden="true" />
                    Reject
                  </Button>

                  <Button
                    type="button"
                    onClick={approveSelected}
                    disabled={
                      isPending ||
                      !canApproveVerification(
                        selected,
                      ) ||
                      selected.status === "approved" ||
                      selected.status === "rejected"
                    }
                    className="bg-green-600 text-white hover:bg-green-700 disabled:bg-green-600/50"
                  >
                    <CheckCircle2 aria-hidden="true" />

                    {pendingAction === "approve"
                      ? "Approving…"
                      : "Approve"}
                  </Button>
                </div>
              </header>

              {actionError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                >
                  {actionError}
                </div>
              ) : null}

              {actionSuccess ? (
                <div
                  role="status"
                  className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700"
                >
                  {actionSuccess}
                </div>
              ) : null}

              {showRejectForm ? (
                <section className="grid gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <div>
                    <h3 className="font-bold text-red-800">
                      Reject verification application
                    </h3>

                    <p className="mt-1 text-sm text-red-700">
                      Explain why this provider cannot be
                      verified. This reason may be shown
                      to the provider.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <label
                      htmlFor="rejection-reason"
                      className="text-sm font-semibold text-red-800"
                    >
                      Rejection reason
                    </label>

                    <textarea
                      id="rejection-reason"
                      value={rejectionReason}
                      onChange={(event) => {
                        setRejectionReason(
                          event.currentTarget.value,
                        );

                        if (actionError) {
                          setActionError(null);
                        }
                      }}
                      placeholder="Explain what is missing, invalid, or needs correction."
                      minLength={10}
                      maxLength={500}
                      rows={4}
                      disabled={isPending}
                      className="w-full resize-y rounded-xl border border-red-200 bg-white px-3 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />

                    <p className="text-right text-xs text-red-600">
                      {rejectionReason.length}/500
                    </p>
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isPending}
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectionReason("");
                        setActionError(null);
                      }}
                    >
                      Cancel
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={rejectSelected}
                      disabled={
                        isPending ||
                        rejectionReason.trim().length <
                          10
                      }
                    >
                      <XCircle aria-hidden="true" />

                      {pendingAction === "reject"
                        ? "Rejecting…"
                        : "Confirm rejection"}
                    </Button>
                  </div>
                </section>
              ) : null}

              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">
                    Business Type
                  </dt>

                  <dd className="mt-1 text-sm font-medium">
                    {selected.providerType}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">
                    Owner
                  </dt>

                  <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                    <UserRound className="size-4 text-blue-500" />
                    {selected.ownerName}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">
                    Contact
                  </dt>

                  <dd className="mt-1 grid gap-1 text-sm">
                    <span className="flex items-center gap-2">
                      <Phone className="size-4 text-green-500" />
                      {selected.phone}
                    </span>

                    <span>{selected.email}</span>
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">
                    Location
                  </dt>

                  <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                    <MapPin className="size-4 text-red-500" />
                    {selected.location}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">
                    Business Since
                  </dt>

                  <dd className="mt-1 text-sm font-medium">
                    {selected.businessSince}
                  </dd>
                </div>
              </dl>

              <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                <section className="overflow-hidden rounded-xl border border-border">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="flex items-center gap-2 font-bold">
                      <FileText className="size-5 text-blue-500" />
                      Submitted Documents
                    </h3>

                    <span className="text-sm font-semibold text-green-600">
                      {
                        selected.documents.filter(
                          (document) =>
                            document.status ===
                            "verified",
                        ).length
                      }{" "}
                      of {selected.documents.length}{" "}
                      verified
                    </span>
                  </div>

                  {selected.documents.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No documents have been submitted.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {selected.documents.map(
                        (document) => (
                          <div
                            key={document.id}
                            className="flex min-w-0 items-center gap-3 p-4"
                          >
                            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                              <FileText className="size-5" />
                            </span>

                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">
                                {document.title}
                              </p>

                              <p className="truncate text-xs text-muted-foreground">
                                {document.fileName} ·{" "}
                                {document.fileSize}
                              </p>
                            </div>

                            <span
                              className={cn(
                                "rounded-full px-2 py-1 text-xs font-semibold capitalize",
                                document.status ===
                                  "verified"
                                  ? "bg-green-100 text-green-700"
                                  : document.status ===
                                      "invalid"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700",
                              )}
                            >
                              {document.status}
                            </span>

                            {document.fileUrl ? (
                              <a
                                href={document.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Download ${document.title}`}
                                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border hover:bg-muted"
                              >
                                <Download className="size-4" />
                              </a>
                            ) : null}
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </section>

                <section className="overflow-hidden rounded-xl border border-border">
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="font-bold">
                      Verification Timeline
                    </h3>
                  </div>

                  <ol className="grid gap-0 p-4">
                    {selected.timeline.map(
                      (entry, index) => (
                        <li
                          key={entry.id}
                          className="relative flex gap-3 pb-5 last:pb-0"
                        >
                          {index <
                          selected.timeline.length -
                            1 ? (
                            <span className="absolute bottom-0 left-[9px] top-5 w-px bg-border" />
                          ) : null}

                          <span
                            className={cn(
                              "relative z-10 mt-1 size-5 shrink-0 rounded-full border-4",
                              entry.status ===
                                "completed" &&
                                "border-green-100 bg-green-500",
                              entry.status ===
                                "in_progress" &&
                                "border-blue-100 bg-blue-500",
                              entry.status ===
                                "pending" &&
                                "border-slate-100 bg-slate-300",
                              entry.status ===
                                "failed" &&
                                "border-red-100 bg-red-500",
                            )}
                          />

                          <div>
                            <p className="text-sm font-semibold">
                              {entry.title}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {entry.description}
                            </p>

                            {entry.timestamp ? (
                              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock3 className="size-3" />
                                {entry.timestamp}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ),
                    )}
                  </ol>
                </section>
              </div>

              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="font-bold text-amber-800">
                  Notes
                </h3>

                <p className="mt-2 text-sm text-amber-700">
                  {selected.adminNotes ||
                    "No administrative notes have been added."}
                </p>
              </section>

              <section className="rounded-xl border border-border">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="font-bold">
                    Activity History
                  </h3>
                </div>

                {selected.activities.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No activity has been recorded.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {selected.activities.map(
                      (activity) => (
                        <div
                          key={activity.id}
                          className="grid gap-1 p-4 sm:grid-cols-[1fr_auto]"
                        >
                          <div>
                            <p className="font-semibold">
                              {activity.actorName ||
                                "System"}
                            </p>

                            <p className="text-sm text-muted-foreground">
                              {activity.description}
                            </p>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            {activity.timestamp}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export {
  ProviderVerificationClient,
  type ProviderVerificationClientProps,
};