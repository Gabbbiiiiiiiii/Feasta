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
  AdminVerificationStatus,
} from "@/lib/admin/users/admin-user-types";
import { PageHeading } from "@/components/layout/page-heading";
import { AdminUserAvatar } from "@/components/admin/users/admin-user-avatar";
import { UserDetailsContent } from "@/components/admin/users/user-details-content";
import { cn } from "@/lib/utils";

type UserManagementClientProps = {
  initialPage: AdminUserPage;
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
    ? "bg-orange-100 text-orange-700"
    : "bg-blue-100 text-blue-700";
}

function verificationBadgeClass(
  status: AdminVerificationStatus | null,
) {
  switch (status) {
    case "verified":
      return "bg-green-100 text-green-700";

    case "rejected":
      return "bg-red-100 text-red-700";

    case "pending":
      return "bg-amber-100 text-amber-700";

    default:
      return "bg-slate-100 text-slate-600";
  }
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

  const [
    accessDecision,
    setAccessDecision,
  ] =
    useState<AdminAccountAccessDecision>(
      "disable",
    );

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
    AdminUserPage[]
  >([]);

  const [error, setError] =
    useState<string | null>(null);

  const [isPending, startTransition] =
    useTransition();

  const executeQuery = async (
    nextFilters: AdminUserFilters,
    options: {
      clearHistory?: boolean;
    } = {},
  ) => {
    setError(null);

    try {
      const result =
        await loadAdminUsersAction(nextFilters);

      setPage(result);
      setFilters(nextFilters);

      if (options.clearHistory !== false) {
        setPageHistory([]);
      }
    } catch (queryError) {
      setError(
        queryError instanceof Error
          ? queryError.message
          : "Unable to load user accounts.",
      );
    }
  };

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
      value === "disabled" ||
      value === "blocked"
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

  const updateVerificationStatus = (
    value: string,
  ) => {
    const verificationStatus:
      AdminUserFilters["verificationStatus"] =
      value === "verified" ||
      value === "pending" ||
      value === "rejected"
        ? value
        : "all";

    startTransition(async () => {
      await executeQuery({
        ...filters,
        verificationStatus,
        cursor: null,
      });
    });
  };

  const openAccessManagement = (
    user: AdminUser,
    returnToDetails = false,
  ) => {
    setAccountActionError(null);

    setAccessDecision(
      user.accountStatus === "active"
        ? "disable"
        : "restore",
    );

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

const accessActionCopy = {
  disable: {
    title: "Disable account access?",
    description:
      "Use administrative deactivation when an account should temporarily stop accessing FEASTA without identifying it as a security or policy violation.",
    confirmLabel: "Disable access",
    loadingLabel: "Disabling access",
    destructive: true,
  },

  block: {
    title: "Block this account?",
    description:
      "Use a security restriction only for policy violations, abuse, fraud, compromised access, or another security concern.",
    confirmLabel: "Block account",
    loadingLabel: "Blocking account",
    destructive: true,
  },

  restore: {
    title: "Restore account access?",
    description:
      "The restriction will be removed and the account will regain access according to its role and provider verification state.",
    confirmLabel: "Restore access",
    loadingLabel: "Restoring access",
    destructive: false,
  },
}[accessDecision];

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
  !selectedDecisionMatchesStatus;

const confirmAccountAction =
  async () => {
    if (
      !pendingAccountAction ||
      !accessFormIsValid
    ) {
      return;
    }

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

      await executeQuery({
        ...filters,
        cursor: null,
      });

      closeAccessManagement(false);
      closeUserDetails();
    } catch (actionError) {
      const message =
        actionError instanceof Error
          ? actionError.message
          : "The account access decision could not be completed.";

      setAccountActionError(message);
      setError(message);
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
        id: "verification",
        header: "Verification",
        cell: (user) => (
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
              verificationBadgeClass(
                user.verificationStatus,
              ),
            )}
          >
            {user.role === "provider"
              ? user.verificationStatus ?? "pending"
              : "Not applicable"}
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
            {user.accountStatus}
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
        header: "Last Login",
        cell: (user) => formatDate(user.lastLoginAt),
      },
    ],
    [openUserDetails],
  );

  const statistics = page.statistics;

  const providerPercentage =
    statistics.providers === 0
      ? 0
      : (statistics.verifiedProviders /
          statistics.providers) *
        100;

  const pendingPercentage =
    statistics.providers === 0
      ? 0
      : (statistics.pendingProviders /
          statistics.providers) *
        100;

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
      ? `Status: ${filters.accountStatus}`
      : null,
    filters.verificationStatus !== "all"
      ? `Verification: ${filters.verificationStatus}`
      : null,
  ].filter((value): value is string => value !== null);

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="User Management"
        description="Monitor and manage customer and provider accounts."
    />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="User account statistics"
      >
        <SummaryCard
          label="Total Accounts"
          value={statistics.totalAccounts.toLocaleString()}
          icon={<Users className="size-6" />}
          trend={{
            direction:
              (statistics.accountGrowthPercentage ?? 0) >
              0
                ? "up"
                : (statistics.accountGrowthPercentage ??
                      0) < 0
                  ? "down"
                  : "neutral",
            label: `${Math.abs(
              statistics.accountGrowthPercentage ?? 0,
            ).toFixed(1)}% compared with last month`,
          }}
        />

        <SummaryCard
          label="Verified Providers"
          value={statistics.verifiedProviders.toLocaleString()}
          icon={
            <UserRoundCheck className="size-6 text-green-600" />
          }
          trend={{
            direction: "neutral",
            label: `${providerPercentage.toFixed(1)}% of providers`,
          }}
        />

        <SummaryCard
          label="Pending Verification"
          value={statistics.pendingProviders.toLocaleString()}
          icon={
            <ShieldCheck className="size-6 text-amber-600" />
          }
          trend={{
            direction: "neutral",
            label: `${pendingPercentage.toFixed(1)}% of providers`,
          }}
        />

        <SummaryCard
          label="Disabled / Blocked"
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
              Status
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
                <option value="disabled">
                  Disabled
                </option>
                <option value="blocked">Blocked</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-semibold">
              Verification
              <select
                value={filters.verificationStatus}
                disabled={
                  isPending ||
                  filters.role !== "provider"
                }
                onChange={(event) =>
                  updateVerificationStatus(
                    event.currentTarget.value,
                  )
                }
                className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="all">
                  All Verification
                </option>
                <option value="verified">
                  Verified
                </option>
                <option value="pending">
                  Pending
                </option>
                <option value="rejected">
                  Rejected
                </option>
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
              aria-label={`Manage access for ${user.fullName}`}
              title="Manage account access"
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

          setPage(previousPage);
          setPageHistory((current) =>
            current.slice(0, -1),
          );
        }}
        onNext={(cursor) => {
          startTransition(async () => {
            setError(null);

            try {
              const nextPage =
                await loadAdminUsersAction({
                  ...filters,
                  cursor,
                });

              setPageHistory((current) => [
                ...current,
                page,
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

              Manage account access
            </Button>
          ) : null
        }
      >
        {selectedUser ? (
        <UserDetailsContent
          user={selectedUser}
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
        contentClassName="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl"
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
                    .user.accountStatus
                }
              </p>
            </div>

            <fieldset>
              <legend className="mb-3 font-semibold text-foreground">
                Access decision
              </legend>

              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    {
                      value: "disable",
                      label:
                        "Administrative deactivation",
                      description:
                        "Temporarily disable access for an operational or administrative reason.",
                    },
                    {
                      value: "block",
                      label:
                        "Security or policy restriction",
                      description:
                        "Block access because of abuse, fraud, policy, or security concerns.",
                    },
                    {
                      value: "restore",
                      label:
                        "Restore account access",
                      description:
                        "Remove the current restriction and restore appropriate account access.",
                    },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-36 cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                      accessDecision ===
                        option.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="accessDecision"
                      value={option.value}
                      checked={
                        accessDecision ===
                        option.value
                      }
                      onChange={() => {
                        setAccessDecision(
                          option.value,
                        );

                        if (
                          option.value ===
                            "restore" &&
                          !userExplanation.trim()
                        ) {
                          setUserExplanation(
                            "Your FEASTA account access has been restored.",
                          );
                        }
                      }}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />

                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground">
                        {option.label}
                      </span>

                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {selectedDecisionMatchesStatus ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                This account already has the
                selected access state. Choose a
                different decision.
              </p>
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
                rows={4}
                maxLength={500}
                placeholder="Explain the access decision clearly and respectfully."
                className="min-h-32 w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
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
                {normalizedUserExplanation.length}/500
                {normalizedUserExplanation.length < 10
                  ? " · Minimum 10"
                  : ""}
              </span>
            </label>

            <label className="grid gap-2">
              <span className="font-semibold text-foreground">
                Internal administrative reason
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
                rows={4}
                maxLength={1000}
                placeholder="Record the evidence, policy, request, or operational reason supporting this decision."
                className="min-h-32 w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
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