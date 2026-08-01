"use client";

import {
  Ban,
  CheckCircle2,
  Eye,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import {
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  loadAdminUsersAction,
  updateAccountStatusAction,
  updateBlockedStatusAction,
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
import type {
  AdminAccountStatus,
  AdminManagedRole,
  AdminUser,
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

  const changeAccountActiveStatus = (
    user: AdminUser,
  ) => {
    const nextActiveStatus = !user.isActive;

    const confirmed = window.confirm(
      nextActiveStatus
        ? `Enable ${user.fullName}'s account?`
        : `Disable ${user.fullName}'s account?`,
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      setError(null);

      try {
        await updateAccountStatusAction({
          userId: user.id,
          isActive: nextActiveStatus,
        });

        setSelectedUser(null);

        await executeQuery({
          ...filters,
          cursor: null,
        });
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Unable to update the account.",
        );
      }
    });
  };

  const changeBlockedStatus = (
    user: AdminUser,
  ) => {
    const nextBlockedStatus = !user.isBlocked;

    const confirmed = window.confirm(
      nextBlockedStatus
        ? `Block ${user.fullName}'s account?`
        : `Unblock ${user.fullName}'s account?`,
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      setError(null);

      try {
        await updateBlockedStatusAction({
          userId: user.id,
          isBlocked: nextBlockedStatus,
        });

        setSelectedUser(null);

        await executeQuery({
          ...filters,
          cursor: null,
        });
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Unable to update the blocked status.",
        );
      }
    });
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
            onClick={() => setSelectedUser(user)}
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
    [],
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
            onClick={() => setSelectedUser(user)}
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
                changeAccountActiveStatus(user)
            }
            aria-label={
                user.isActive
                ? `Disable ${user.fullName}`
                : `Enable ${user.fullName}`
            }
            title={
                user.isActive
                ? "Disable account"
                : "Enable account"
            }
            className={cn(
                user.isActive
                ? "bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700"
                : "bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700",
            )}
            >
            {user.isActive ? (
                <Ban aria-hidden="true" />
            ) : (
                <CheckCircle2 aria-hidden="true" />
            )}
            </Button>

            <Button
            variant="ghost"
            size="icon"
            onClick={() => changeBlockedStatus(user)}
            aria-label={
                user.isBlocked
                ? `Unblock ${user.fullName}`
                : `Block ${user.fullName}`
            }
            title={
                user.isBlocked
                ? "Unblock account"
                : "Block account"
            }
            className={cn(
                user.isBlocked
                ? "bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700"
                : "bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700",
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
                onClick={() => setSelectedUser(user)}
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
        open={selectedUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUser(null);
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
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                onClick={() =>
                  changeAccountActiveStatus(
                    selectedUser,
                  )
                }
                disabled={isPending}
              >
                {selectedUser.isActive
                  ? "Disable account"
                  : "Enable account"}
              </Button>

              <Button
                variant="destructive"
                onClick={() =>
                  changeBlockedStatus(selectedUser)
                }
                disabled={isPending}
              >
                {selectedUser.isBlocked
                  ? "Unblock account"
                  : "Block account"}
              </Button>
            </div>
          ) : null
        }
      >
        {selectedUser ? (
            <UserDetailsContent user={selectedUser} />
        ) : null}
      </DetailDrawer>
    </div>
  );
}

export {
  UserManagementClient,
  type UserManagementClientProps,
};