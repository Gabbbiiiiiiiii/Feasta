"use client";

import {
  Ban,
  Eye,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  loadAdminUserDetailsAction,
  loadAdminUsersAction,
  manageAccountAccessAction,
} from "@/app/admin/users/actions";
import {
  CursorPagination,
  DataTable,
  DetailDrawer,
  FilterToolbar,
  SummaryCard,
  type DataTableColumn,
} from "@/components/data";
import { Button } from "@/components/ui/button";
import {
  ConfirmationDialog,
} from "@/components/shared/confirmation-dialog";
import type {
  AdminAccountAccessDecision,
  AdminAccountStatus,
  AdminManagedRole,
  AdminUser,
  AdminUserDetails,
  AdminUserFilters,
  AdminUserPage,
} from "@/lib/admin/users/admin-user-types";
import type { ServiceCategoryOption } from "@/lib/service-categories/service-category-types";
import { PageHeading } from "@/components/layout/page-heading";
import { AdminUserAvatar } from "@/components/admin/users/admin-user-avatar";
import { UserDetailsContent } from "@/components/admin/users/user-details-content";
import {useAdminAutoRefresh} from "@/lib/admin/use-admin-auto-refresh";
import {accountAccessLabel, restrictionDecision, restrictionReasons, restrictionReasonDescriptions, meaningfulRestrictionExplanation, type RestrictionReason} from "@/lib/admin/users/admin-account-labels";
import { cn } from "@/lib/utils";

type UserManagementClientProps = {
  initialPage: AdminUserPage;
  serviceCategoryOptions: readonly ServiceCategoryOption[];
};

type PendingAccountAction = {
  user: AdminUser;
} | null;

type UserModalView =
| "closed"
| "details"
| "access";

const defaultFilters: AdminUserFilters = {
  search: "",
  role: "all",
  accountStatus: "all",
  verificationStatus: "all",
  pageSize: 10,
  cursor: null,
};

const dateFormatter = new Intl.DateTimeFormat(
  "en-US",
  {
    dateStyle: "medium",
  },
);

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : dateFormatter.format(date);
}

function roleBadgeClass(role: AdminManagedRole) {
  return role === "provider"
    ? "bg-primary-tint text-primary-strong"
    : "bg-blue-100 text-blue-700";
}

function accountStatusBadgeClass(
  status: AdminAccountStatus,
) {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700";

    case "blocked":
      return "bg-red-100 text-red-700";

    case "disabled":
      return "bg-slate-200 text-slate-700";
  }
}

function UserManagementClient({
  initialPage,
  serviceCategoryOptions,
}: UserManagementClientProps) {
  const [page, setPage] =
    useState<AdminUserPage>(initialPage);

  const [filters, setFilters] =
    useState<AdminUserFilters>(defaultFilters);

  const [searchValue, setSearchValue] =
    useState("");

  const [selectedUser, setSelectedUser] =
    useState<AdminUser | null>(null);

  const [
    selectedUserDetails,
    setSelectedUserDetails,
  ] = useState<AdminUserDetails | null>(
    null,
  );

  const [
    userModalView,
    setUserModalView,
  ] = useState<UserModalView>("closed");

  const [
    userDetailsLoading,
    setUserDetailsLoading,
  ] = useState(false);

  const [
    userDetailsError,
    setUserDetailsError,
  ] = useState<string | null>(null);

  const userDetailsRequestId =
    useRef(0);

  const [
    pendingAccountAction,
    setPendingAccountAction,
  ] = useState<PendingAccountAction>(null);

  const [restrictionReason, setRestrictionReason] = useState<RestrictionReason | "">("");
  const [accountMutationPending, setAccountMutationPending] = useState(false);
  const accessDecision: AdminAccountAccessDecision = pendingAccountAction?.user.accountStatus !== "active"
    ? "restore" : restrictionDecision(restrictionReason || "Temporary investigation");

  const [
    userExplanation,
    setUserExplanation,
  ] = useState("");

  const [
    internalReason,
    setInternalReason,
  ] = useState("");

  const [
    accountActionError,
    setAccountActionError,
  ] = useState<string | null>(null);

  const [pageHistory, setPageHistory] = useState<
    Array<{page: AdminUserPage; filters: AdminUserFilters}>
  >([]);

  const [error, setError] =
    useState<string | null>(null);

  const [isPending, startTransition] =
    useTransition();

  const queryRequestId = useRef(0);
  const executeQuery = async (
    nextFilters: AdminUserFilters,
    options: {
      clearHistory?: boolean;
    } = {},
  ) => {
    const requestId = ++queryRequestId.current;
    setError(null);

    try {
      const result =
        await loadAdminUsersAction(nextFilters);

      if (requestId !== queryRequestId.current) return;
      setPage(result);
      setFilters(nextFilters);

      if (options.clearHistory !== false) {
        setPageHistory([]);
      }
      return true;
    } catch (queryError) {
      if (requestId !== queryRequestId.current) return;
      setError(
        queryError instanceof Error
          ? queryError.message
          : "Unable to load user accounts.",
      );
      return false;
    }
  };

  useAdminAutoRefresh(async (isCurrent) => {
    const requestId = queryRequestId.current;
    const result = await loadAdminUsersAction(filters);
    if (!isCurrent() || requestId !== queryRequestId.current) return;
    setPage(result);
    setSelectedUser(current => current ? result.users.find(user => user.id === current.id) ?? current : null);
  }, JSON.stringify(filters), isPending || accountMutationPending);

  const loadSelectedUserDetails =
    useCallback((
      user: AdminUser,
    ) => {
    const requestId =
      userDetailsRequestId.current + 1;

    userDetailsRequestId.current =
      requestId;

    setUserDetailsLoading(true);
    setUserDetailsError(null);

    void loadAdminUserDetailsAction(
      user.id,
    )
      .then((result) => {
        if (
          userDetailsRequestId.current !==
          requestId
        ) {
          return;
        }

        setSelectedUserDetails(
          result.details,
        );
      })
      .catch((caughtError: unknown) => {
        if (
          userDetailsRequestId.current !==
          requestId
        ) {
          return;
        }

        setSelectedUserDetails(null);
        setUserDetailsError(
          caughtError instanceof Error &&
            caughtError.message.trim()
            ? caughtError.message
            : "Account details could not be loaded.",
        );
      })
      .finally(() => {
        if (
          userDetailsRequestId.current ===
          requestId
        ) {
          setUserDetailsLoading(false);
        }
      });
    }, []);

  const openUserDetails = useCallback(
    (user: AdminUser) => {
      setSelectedUser(user);
      setSelectedUserDetails(null);
      setUserDetailsError(null);
      setUserModalView("details");

      loadSelectedUserDetails(user);
    },
    [loadSelectedUserDetails],
  );

  const closeUserDetails = useCallback(() => {
    userDetailsRequestId.current += 1;

    setUserModalView("closed");
    setSelectedUser(null);
    setSelectedUserDetails(null);
    setUserDetailsError(null);
    setUserDetailsLoading(false);
  }, []);

  const retrySelectedUserDetails =
    useCallback(() => {
      if (!selectedUser) {
        return;
      }

      loadSelectedUserDetails(
        selectedUser,
      );
    }, [
      loadSelectedUserDetails,
      selectedUser,
    ]);

  const clearFilters = () => {
    setSearchValue("");

    startTransition(async () => {
      await executeQuery(defaultFilters);
    });
  };

  const updateRole = (value: string) => {
    const role: AdminUserFilters["role"] =
      value === "customer" || value === "provider"
        ? value
        : "all";

    const nextFilters: AdminUserFilters = {
      ...filters,
      role,
      verificationStatus:
        role === "provider"
          ? filters.verificationStatus
          : "all",
      cursor: null,
    };

    startTransition(async () => {
      await executeQuery(nextFilters);
    });
  };

  const updateAccountStatus = (value: string) => {
    const accountStatus:
      AdminUserFilters["accountStatus"] =
      value === "active" ||
      value === "restricted"
        ? value
        : "all";

    startTransition(async () => {
      await executeQuery({
        ...filters,
        accountStatus,
        cursor: null,
      });
    });
  };

  const openAccessManagement = (
    user: AdminUser,
    returnToDetails = false,
  ) => {
    setAccountActionError(null);

    setRestrictionReason("");

    setUserExplanation(
      user.accountStatus === "active"
        ? ""
        : "Your FEASTA account access has been restored.",
    );

    setInternalReason("");

    setPendingAccountAction({
      user,
    });

    if (returnToDetails) {
      setSelectedUser(user);
    } else {
      setSelectedUser(null);
      setSelectedUserDetails(null);
    }

    setUserModalView("access");
  };

const closeAccessManagement = (
  restoreUserDetails = true,
) => {
  setPendingAccountAction(null);
  setAccountActionError(null);
  setUserExplanation("");
  setInternalReason("");

  setUserModalView(
    restoreUserDetails && selectedUser
      ? "details"
      : "closed",
  );
};

const accessActionCopy = accessDecision === "restore" ? {
  title: "Restore account access?",
  description: "Remove the restriction and restore access according to the account's role and provider verification state.",
  confirmLabel: "Restore access", loadingLabel: "Restoring access", destructive: false,
} : {
  title: "Restrict account access?",
  description: "Temporarily prevent this account from accessing FEASTA.",
  confirmLabel: "Restrict access", loadingLabel: "Restricting access", destructive: true,
};

const normalizedUserExplanation =
  userExplanation
    .trim()
    .replace(/\s+/g, " ");

const normalizedInternalReason =
  internalReason
    .trim()
    .replace(/\s+/g, " ");

const selectedDecisionMatchesStatus =
  pendingAccountAction
    ? (
        accessDecision === "restore" &&
        pendingAccountAction.user.accountStatus ===
          "active"
      ) ||
      (
        accessDecision === "disable" &&
        pendingAccountAction.user.accountStatus ===
          "disabled"
      ) ||
      (
        accessDecision === "block" &&
        pendingAccountAction.user.accountStatus ===
          "blocked"
      )
    : false;

const accessFormIsValid =
  normalizedUserExplanation.length >= 10 &&
  normalizedUserExplanation.length <= 500 &&
  normalizedInternalReason.length >= 10 &&
  normalizedInternalReason.length <= 1000 &&
  !selectedDecisionMatchesStatus &&
  (accessDecision === "restore" || restrictionReason !== "") &&
  (restrictionReason !== "Other" || meaningfulRestrictionExplanation(normalizedUserExplanation));

const confirmAccountAction =
  async () => {
    if (
      !pendingAccountAction ||
      !accessFormIsValid
    ) {
      return;
    }

    setAccountMutationPending(true);
    setAccountActionError(null);
    setError(null);

    try {
      await manageAccountAccessAction({
        userId:
          pendingAccountAction.user.id,
        decision:
          accessDecision,
        userExplanation:
          normalizedUserExplanation,
        internalReason:
          normalizedInternalReason,
      });

      await executeQuery(filters, {clearHistory: false});

      closeAccessManagement(false);
      closeUserDetails();
    } catch (actionError) {
      const message =
        actionError instanceof Error
          ? actionError.message
          : "The account access decision could not be completed.";

      setAccountActionError(message);
      setError(message);
    } finally {
      setAccountMutationPending(false);
    }
  };

  const columns = useMemo<
    readonly DataTableColumn<AdminUser>[]
  >(
    () => [
      {
        id: "account",
        header: "Account",
        cell: (user) => (
          <button
            type="button"
            onClick={() => openUserDetails(user)}
            className="flex min-w-[15rem] items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <AdminUserAvatar user={user} />

            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground">
                {user.role === "provider" &&
                user.businessName
                  ? user.businessName
                  : user.fullName}
              </span>

              <span className="block truncate text-xs text-muted-foreground">
                {user.email || "No email"}
              </span>

              {user.phoneNumber ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {user.phoneNumber}
                </span>
              ) : null}
            </span>
          </button>
        ),
      },
      {
        id: "role",
        header: "Role",
        cell: (user) => (
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
              roleBadgeClass(user.role),
            )}
          >
            {user.role}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (user) => (
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
              accountStatusBadgeClass(
                user.accountStatus,
              ),
            )}
          >
            {accountAccessLabel(user.accountStatus)}
          </span>
        ),
      },
      {
        id: "registered",
        header: "Registered",
        cell: (user) => formatDate(user.createdAt),
      },
      {
        id: "lastLogin",
        header: "Last login",
        cell: (user) => formatDate(user.lastLoginAt),
      },
    ],
    [openUserDetails],
  );

  const statistics = page.statistics;

  const restrictedPercentage =
    statistics.totalAccounts === 0
      ? 0
      : (statistics.restrictedAccounts /
          statistics.totalAccounts) *
        100;

  const activeFilters = [
    filters.role !== "all"
      ? `Role: ${filters.role}`
      : null,
    filters.accountStatus !== "all"
      ? `Status: ${filters.accountStatus === "restricted" ? "Restricted" : "Active"}`
      : null,
  ].filter((value): value is string => value !== null);

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Users"
        description="Monitor and manage customer and provider accounts."
    />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="User account statistics"
      >
        <SummaryCard
          label="Total accounts"
          value={statistics.totalAccounts.toLocaleString()}
          icon={<Users className="size-6" />}

        />

        <SummaryCard label="Customers" value={statistics.customers.toLocaleString()} icon={<Users className="size-6" />} />
        <SummaryCard label="Providers" value={statistics.providers.toLocaleString()} icon={<UserRoundCheck className="size-6" />} />

        <SummaryCard
          label="Restricted accounts"
          value={statistics.restrictedAccounts.toLocaleString()}
          icon={<Ban className="size-6 text-red-500" />}
          trend={{
            direction: "neutral",
            label: `${restrictedPercentage.toFixed(1)}% of accounts`,
          }}
        />
      </section>

      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={(search) => {
          startTransition(async () => {
            await executeQuery({
              ...filters,
              search,
              cursor: null,
            });
          });
        }}
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        loading={isPending}
        searchLabel="Search user accounts"
        searchPlaceholder="Search by name, email, phone, or business name"
        filterControls={
          <>
            <label className="grid gap-1 text-sm font-semibold">
              Role
              <select
                value={filters.role}
                disabled={isPending}
                onChange={(event) =>
                  updateRole(event.currentTarget.value)
                }
                className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="all">All Roles</option>
                <option value="customer">
                  Customers
                </option>
                <option value="provider">
                  Providers
                </option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-semibold">
              Account status
              <select
                value={filters.accountStatus}
                disabled={isPending}
                onChange={(event) =>
                  updateAccountStatus(
                    event.currentTarget.value,
                  )
                }
                className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="all">
                  All Statuses
                </option>
                <option value="active">Active</option>
                <option value="restricted">Restricted</option>
              </select>
            </label>

          </>
        }
      />

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={page.users}
        getRowId={(user) => user.id}
        caption="Customer and provider accounts"
        loading={isPending}
        emptyTitle="No accounts found"
        emptyDescription={
          filters.search
            ? "No accounts match the current search and filters."
            : "No customer or provider accounts are available."
        }
        rowActionsLabel="Actions"
        rowActions={(user) => (
        <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openUserDetails(user)}
              aria-label={`View ${user.fullName}`}
              title="View details"
              className="bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
              >
              <Eye aria-hidden="true" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                openAccessManagement(user)
              }
              aria-label={`${user.accountStatus === "active" ? "Restrict account access" : "Restore account access"} for ${user.fullName}`}
              title={user.accountStatus === "active" ? "Restrict account access" : "Restore account access"}
              className={cn(
                user.accountStatus === "active"
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                  : "bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800",
              )}
            >
              <ShieldCheck aria-hidden="true" />
            </Button>
        </div>
        )}
        renderMobileRow={(user) => (
          <article className="rounded-card border border-border bg-card p-4 shadow-card">
            <div className="flex items-start gap-3">
              <AdminUserAvatar user={user} />

              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {user.role === "provider" &&
                  user.businessName
                    ? user.businessName
                    : user.fullName}
                </p>

                <p className="truncate text-sm text-muted-foreground">
                  {user.email}
                </p>
                <p className="mt-2 text-sm capitalize">
                  {user.role} · {accountAccessLabel(user.accountStatus)}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  openUserDetails(user)
                }
                aria-label={`View ${user.fullName}`}
              >
                <Eye aria-hidden="true" />
              </Button>
            </div>
          </article>
        )}
      />

      <CursorPagination
        previousCursor={
          pageHistory.length > 0
            ? "previous"
            : null
        }
        nextCursor={page.nextCursor}
        loading={isPending}
        pageLabel={`Showing ${page.users.length} account${
          page.users.length === 1 ? "" : "s"
        }`}
        onPrevious={() => {
          const previousPage =
            pageHistory.at(-1);

          if (!previousPage) {
            return;
          }

          startTransition(async () => {
            if (await executeQuery(previousPage.filters, {clearHistory: false})) {
              setPageHistory((current) => current.slice(0, -1));
            }
          });
        }}
        onNext={(cursor) => {
          startTransition(async () => {
            const requestId = ++queryRequestId.current;
            setError(null);

            try {
              const nextPage =
                await loadAdminUsersAction({
                  ...filters,
                  cursor,
                });

              if (requestId !== queryRequestId.current) return;
              setPageHistory((current) => [
                ...current,
                {page, filters},
              ]);

              setPage(nextPage);
              setFilters((current) => ({
                ...current,
                cursor,
              }));
            } catch (paginationError) {
              setError(
                paginationError instanceof Error
                  ? paginationError.message
                  : "Unable to load the next page.",
              );
            }
          });
        }}
      />

      <DetailDrawer
        open={
          userModalView === "details" &&
          selectedUser !== null
        }
        onOpenChange={(open) => {
          if (!open) {
            closeUserDetails();
          }
        }}
        title="User Details"
        description={
          selectedUser
            ? `Review ${selectedUser.fullName}'s account information.`
            : "Review account information."
        }
        footer={
          selectedUser ? (
            <Button
              className="w-full sm:w-auto"
              variant={
                selectedUser.accountStatus ===
                  "active"
                  ? "destructive"
                  : "primary"
              }
              onClick={() =>
                openAccessManagement(
                  selectedUser,
                  true,
                )
              }
              disabled={isPending}
            >
              <ShieldCheck
                aria-hidden="true"
              />

              {selectedUser.accountStatus === "active" ? "Restrict account access" : "Restore account access"}
            </Button>
          ) : null
        }
      >
        {selectedUser ? (
        <UserDetailsContent
          user={selectedUser}

          serviceCategoryOptions={serviceCategoryOptions}
          details={selectedUserDetails}
          loading={userDetailsLoading}
          error={userDetailsError}
          onRetry={
            retrySelectedUserDetails
          }
        />
      ) : null}
      </DetailDrawer>

      <ConfirmationDialog
        open={
          userModalView === "access" &&
          pendingAccountAction !== null
        }
        contentClassName="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-xl"
        bodyClassName="overflow-y-auto overscroll-contain pr-3 [scrollbar-gutter:stable]"
        onOpenChange={(open) => {
          if (!open) {
            closeAccessManagement();
          }
        }}
        title={accessActionCopy.title}
        description={
          accessActionCopy.description
        }
        confirmLabel={
          accessActionCopy.confirmLabel
        }
        loading={accountMutationPending}
        loadingLabel={
          accessActionCopy.loadingLabel
        }
        destructive={
          accessActionCopy.destructive
        }
        confirmDisabled={
          !accessFormIsValid
        }
        onConfirm={confirmAccountAction}
      >
        {pendingAccountAction ? (
          <div className="grid gap-5">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="font-semibold text-foreground">
                {
                  pendingAccountAction
                    .user.fullName
                }
              </p>

              <p className="mt-1 break-all text-sm text-muted-foreground">
                {pendingAccountAction
                  .user.email ||
                  "No email address"}
              </p>

              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {
                  pendingAccountAction
                    .user.role
                }{" "}
                account ·{" "}
                {
                  pendingAccountAction
                    .user.accountStatus === "active" ? "Active" : "Restricted"
                }
              </p>
            </div>

            {accessDecision !== "restore" ? (
              <label className="grid gap-2">
                <span className="font-semibold">Reason for restriction</span>
                <select aria-label="Reason for restriction" aria-describedby={restrictionReason ? "restriction-reason-description" : undefined} value={restrictionReason} onChange={(event) => setRestrictionReason(event.currentTarget.value as RestrictionReason | "")} className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm">
                  <option value="">Select a reason</option>
                  {restrictionReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                </select>
                {restrictionReason ? <span id="restriction-reason-description" className="text-sm text-muted-foreground">{restrictionReasonDescriptions[restrictionReason]}</span> : null}
              </label>
            ) : null}

            <label className="grid gap-2">
              <span className="font-semibold text-foreground">
                Explanation for the user
              </span>

              <span className="text-sm text-muted-foreground">
                This message may be shown to the
                account owner. Do not include
                confidential investigation details.
              </span>

              <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Both explanations are required and must contain at least 10 characters.
              </p>

              <textarea
                value={userExplanation}
                onChange={(event) =>
                  setUserExplanation(
                    event.target.value,
                  )
                }
                rows={3}
                maxLength={500}
                placeholder="Explain the access decision clearly and respectfully."
                className="min-h-24 w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />

              <span
                className={cn(
                  "text-right text-xs",
                  normalizedUserExplanation.length > 0 &&
                    normalizedUserExplanation.length < 10
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {restrictionReason === "Other" && normalizedUserExplanation.length >= 10 && !meaningfulRestrictionExplanation(normalizedUserExplanation) ? "Enter a clear explanation, not a placeholder. " : ""}
                {normalizedUserExplanation.length}/500
                {normalizedUserExplanation.length < 10
                  ? " · Minimum 10"
                  : ""}
              </span>
            </label>

            <label className="grid gap-2">
              <span className="font-semibold text-foreground">
                {accessDecision === "restore" ? "Reason for restoration" : "Internal note"}
              </span>

              <span className="text-sm text-muted-foreground">
                Private audit information visible
                only to authorized administrators.
              </span>

              <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Both explanations are required and must contain at least 10 characters.
              </p>

              <textarea
                value={internalReason}
                onChange={(event) =>
                  setInternalReason(
                    event.target.value,
                  )
                }
                rows={3}
                maxLength={1000}
                placeholder="Record the evidence, policy, request, or operational reason supporting this decision."
                className="min-h-24 w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />

              <span
                className={cn(
                  "text-right text-xs",
                  normalizedInternalReason.length > 0 &&
                    normalizedInternalReason.length < 10
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {normalizedInternalReason.length}/1000
                {normalizedInternalReason.length < 10
                  ? " · Minimum 10"
                  : ""}
              </span>
            </label>

            {accountActionError ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {accountActionError}
              </p>
            ) : null}
          </div>
        ) : null}
      </ConfirmationDialog>
    </div>
  );
}

export {
  UserManagementClient,
  type UserManagementClientProps,
};
