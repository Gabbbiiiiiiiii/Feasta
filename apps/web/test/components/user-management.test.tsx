import {
  render,
  act,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  AdminUser,
  AdminUserPage,
} from "@/lib/admin/users/admin-user-types";

const mocks = vi.hoisted(() => ({
  loadUsers: vi.fn(),
  manageAccess: vi.fn(),
}));

vi.mock(
  "@/app/admin/users/actions",
  () => ({
    loadAdminUsersAction:
      mocks.loadUsers,

    manageAccountAccessAction:
      mocks.manageAccess,
  }),
);

import {
  UserManagementClient,
} from "@/components/admin/users/user-management-client";
import {
  UserDetailsContent,
} from "@/components/admin/users/user-details-content";
import type {
  ServiceCategoryOption,
} from "@/lib/service-categories/service-category-types";
import { TEST_SERVICE_CATEGORY_OPTIONS } from "../fixtures/service-category-options";
import {restrictionDecision, restrictionReasons} from "@/lib/admin/users/admin-account-labels";

afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadUsers.mockResolvedValue(adminUserPage());
});

it.each(restrictionReasons)("preserves the existing internal action for %s", reason => {
  expect(restrictionDecision(reason)).toBe(reason === "Temporary investigation" || reason === "Other" ? "disable" : "block");
});

it("focuses Users on account summaries and account filters", () => {
  render(<UserManagementClient initialPage={adminUserPage()} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
  for (const label of ["Total accounts", "Customers", "Providers", "Restricted accounts"]) {
    expect(screen.getByRole("region", {name: label})).toBeInTheDocument();
  }
  expect(screen.queryByRole("columnheader", {name: "Verification"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Verification")).not.toBeInTheDocument();
  expect(screen.getByRole("option", {name: "Restricted"})).toHaveValue("restricted");
  expect(screen.queryByRole("option", {name: "Disabled"})).not.toBeInTheDocument();
  expect(screen.queryByRole("option", {name: "Blocked"})).not.toBeInTheDocument();
});

it("requires a category and valid explanations and calls disable for a temporary investigation restriction", async () => {
  mocks.manageAccess.mockResolvedValue({userId: "customer-1", accountStatus: "disabled", changed: true});
  mocks.loadUsers.mockResolvedValue(adminUserPage({...adminUser(), accountStatus: "disabled", isActive: false}));
  render(<UserManagementClient initialPage={adminUserPage()} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
  fireEvent.click(screen.getByRole("button", {name: "Restrict account access for Test Customer"}));
  const confirm = screen.getByRole("button", {name: "Restrict access"});
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Explanation for the user/), {target: {value: "Access paused at your request."}});
  fireEvent.change(screen.getByLabelText(/Internal note/), {target: {value: "Temporary administrative restriction requested."}});
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for restriction"), {target: {value: "Temporary investigation"}});
  expect(confirm).toBeEnabled();
  fireEvent.change(screen.getByLabelText(/Explanation for the user/), {target: {value: "short"}});
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Explanation for the user/), {target: {value: "Access paused at your request."}});
  await act(async () => {fireEvent.click(confirm);});
  expect(mocks.manageAccess).toHaveBeenCalledWith(expect.objectContaining({decision: "disable"}));
  expect(screen.getByRole("button", {name: "Restore account access for Test Customer"})).toBeInTheDocument();
});

it("keeps the access dialog and form values during automatic refresh", async () => {
  vi.useFakeTimers();
  mocks.loadUsers.mockReset().mockResolvedValue(adminUserPage());
  render(<UserManagementClient initialPage={adminUserPage()} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
  fireEvent.click(screen.getByRole("button", {name: "Restrict account access for Test Customer"}));
  fireEvent.change(screen.getByLabelText("Reason for restriction"), {target: {value: "Policy violation"}});
  fireEvent.change(screen.getByLabelText(/Explanation for the user/), {target: {value: "A policy review is in progress."}});
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(mocks.loadUsers).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog", {name: "Restrict account access?"})).toBeInTheDocument();
  expect(screen.getByLabelText("Reason for restriction")).toHaveValue("Policy violation");
  expect(screen.getByLabelText(/Explanation for the user/)).toHaveValue("A policy review is in progress.");
});

describe(
  "admin user provider category display",
  () => {
    it(
      "renders the File Maintenance master name for a provider category",
      () => {
        const providerUser: AdminUser = {
          ...adminUser(),
          id: "provider-user-1",
          firstName: "Test",
          lastName: "Provider",
          fullName: "Test Provider",
          initials: "TP",
          role: "provider",
          providerId: "provider-1",
          businessName: "Test Catering",
          providerServiceType: "catering",
          providerCategory:
            "catering_service",
        };

        const renamedCategories:
          readonly ServiceCategoryOption[] =
          TEST_SERVICE_CATEGORY_OPTIONS.map(
            (category) =>
              category.code ===
              "catering_service"
                ? {
                    ...category,
                    name:
                      "Full-Service Catering",
                  }
                : category,
          );

        render(
          <UserDetailsContent
            user={providerUser}
            serviceCategoryOptions={
              renamedCategories
            }
          />,
        );

        expect(
          screen.getByText(
            "Full-Service Catering",
          ),
        ).toBeInTheDocument();

        expect(
          screen.queryByText(
            "catering service",
            {
              exact: false,
            },
          ),
        ).not.toBeInTheDocument();
      },
    );
  },
);
describe(
  "admin provider verification status display",
  () => {
    const cases = [
      ["not_submitted", "Not verified"],
      ["submitted", "Verification pending"],
      ["under_review", "Under review"],
      ["verified", "Verified"],
      ["action_required", "Action required"],
      ["rejected", "Rejected"],
      ["suspended", "Suspended"],
    ] as const;

    it.each(cases)(
      "renders %s as %s in provider details",
      (verificationStatus, expectedLabel) => {
        const providerUser: AdminUser = {
          ...adminUser(),
          id: "provider-status-user",
          firstName: "Status",
          lastName: "Provider",
          fullName: "Status Provider",
          initials: "SP",
          role: "provider",
          providerId: "provider-status-1",
          businessName: "Status Provider Services",
          providerServiceType: "addon",
          providerCategory: "photography",
          verificationStatus,
        };

        render(
          <UserDetailsContent
            user={providerUser}
            serviceCategoryOptions={
              TEST_SERVICE_CATEGORY_OPTIONS
            }
          />,
        );

        expect(
          screen.getAllByText(expectedLabel).length,
        ).toBeGreaterThanOrEqual(1);
      },
    );

    it(
      "does not describe a not-submitted provider as pending",
      () => {
        const providerUser: AdminUser = {
          ...adminUser(),
          id: "provider-not-submitted",
          firstName: "New",
          lastName: "Provider",
          fullName: "New Provider",
          initials: "NP",
          role: "provider",
          providerId: "provider-not-submitted-1",
          businessName: "New Provider Services",
          providerServiceType: "addon",
          providerCategory: "photography",
          verificationStatus: "not_submitted",
        };

        render(
          <UserDetailsContent
            user={providerUser}
            serviceCategoryOptions={
              TEST_SERVICE_CATEGORY_OPTIONS
            }
          />,
        );

        expect(
          screen.getAllByText("Not verified").length,
        ).toBeGreaterThanOrEqual(1);

        expect(
          screen.queryByText("pending", {
            exact: false,
          }),
        ).not.toBeInTheDocument();
      },
    );
  },
);

describe(
  "admin user access management",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.loadUsers.mockResolvedValue(
        adminUserPage(),
      );

      mocks.manageAccess.mockResolvedValue({
        userId: "customer-1",
        accountStatus: "blocked",
        changed: true,
      });
    });

    it(
      "replaces separate restriction actions with one manage-access action",
      () => {
        render(
          <UserManagementClient
            initialPage={adminUserPage()}
            serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
          />,
        );

        expect(
          screen.getByRole(
            "button",
            {
              name:
                "Restrict account access for Test Customer",
            },
          ),
        ).toBeInTheDocument();

        expect(
          screen.queryByRole(
            "button",
            {
              name:
                "Disable Test Customer",
            },
          ),
        ).not.toBeInTheDocument();

        expect(
          screen.queryByRole(
            "button",
            {
              name:
                "Block Test Customer",
            },
          ),
        ).not.toBeInTheDocument();
      },
    );

    it(
      "requires public and private reasons before blocking an account",
      async () => {
        const user =
          userEvent.setup();

        render(
          <UserManagementClient
            initialPage={adminUserPage()}
            serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
          />,
        );

        await user.click(
          screen.getByRole(
            "button",
            {
              name:
                "Restrict account access for Test Customer",
            },
          ),
        );

        expect(screen.queryByRole("radio")).not.toBeInTheDocument();
        expect(screen.queryByText("Restore account access")).not.toBeInTheDocument();
        const restrictionReasonField =
          screen.getByLabelText(
            "Reason for restriction",
          );

        expect(
          restrictionReasonField,
        ).toHaveClass("min-h-14");

        await user.selectOptions(
          restrictionReasonField,
          "Account security concern",
        );

        expect(
          screen.queryByText(
            "Both explanations are required and must contain at least 10 characters.",
          ),
        ).not.toBeInTheDocument();

        expect(
          screen.getByLabelText(
            /Explanation for the user/i,
          ),
        ).toHaveClass("min-h-28");

        expect(
          screen.getByLabelText(
            /Internal note|Reason for restoration/i,
          ),
        ).toHaveClass("min-h-28");

        const confirm =
          screen.getByRole(
            "button",
            {
              name: "Restrict access",
            },
          );

        expect(confirm).toBeDisabled();

        await user.type(
          screen.getByLabelText(
            /Explanation for the user/i,
          ),
          "Your account was restricted while a security concern is reviewed.",
        );

        expect(confirm).toBeDisabled();

        await user.type(
          screen.getByLabelText(
            /Internal note|Reason for restoration/i,
          ),
          "Security review reference SEC-2026-001 requires temporary restriction.",
        );

        expect(confirm).toBeEnabled();

        const readsBeforeRestriction = mocks.loadUsers.mock.calls.length;
        await user.click(confirm);

        await waitFor(() => {
          expect(
            mocks.manageAccess,
          ).toHaveBeenCalledWith({
            userId: "customer-1",
            decision: "block",
            userExplanation:
              "Your account was restricted while a security concern is reviewed.",
            internalReason:
              "Security review reference SEC-2026-001 requires temporary restriction.",
          });
        });

        expect(
          mocks.loadUsers,
        ).toHaveBeenCalledTimes(readsBeforeRestriction + 1);
      },
    );

    it(
      "defaults a restricted account to restoration",
      async () => {
        const user =
          userEvent.setup();

        const blockedUser: AdminUser = {
          ...adminUser(),
          isActive: false,
          isBlocked: true,
          accountStatus: "blocked",
        };

        mocks.loadUsers.mockResolvedValue(
          adminUserPage(blockedUser),
        );

        mocks.manageAccess.mockResolvedValue({
          userId: blockedUser.id,
          accountStatus: "active",
          changed: true,
        });

        render(
          <UserManagementClient
            initialPage={adminUserPage(
              blockedUser,
            )}
            serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
          />,
        );

        await user.click(
          screen.getByRole(
            "button",
            {
              name:
                "Restore account access for Test Customer",
            },
          ),
        );

        expect(screen.getByRole("dialog", {name: "Restore account access?"})).toBeInTheDocument();
        expect(screen.queryByRole("radio")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Reason for restriction")).not.toBeInTheDocument();

        expect(
          screen.getByLabelText(
            /Explanation for the user/i,
          ),
        ).toHaveValue(
          "Your FEASTA account access has been restored.",
        );

        await user.type(
          screen.getByLabelText(
            /Reason for restoration/i,
          ),
          "The security review was completed and the restriction was cleared.",
        );

        await user.click(
          screen.getByRole(
            "button",
            {
              name: "Restore access",
            },
          ),
        );

        await waitFor(() => {
          expect(
            mocks.manageAccess,
          ).toHaveBeenCalledWith({
            userId: "customer-1",
            decision: "restore",
            userExplanation:
              "Your FEASTA account access has been restored.",
            internalReason:
              "The security review was completed and the restriction was cleared.",
          });
        });
      },
    );
  },
);

function adminUser(): AdminUser {
  return {
    id: "customer-1",
    firstName: "Test",
    lastName: "Customer",
    fullName: "Test Customer",
    initials: "TC",
    email: "test.customer@example.com",
    phoneNumber: "+639171234567",
    role: "customer",
    profileImageUrl: null,

    isEmailVerified: true,
    isPhoneVerified: false,
    isActive: true,
    isBlocked: false,
    accountStatus: "active",

    createdAt:
      "2026-08-01T00:00:00.000Z",
    updatedAt:
      "2026-08-01T00:00:00.000Z",
    lastLoginAt:
      "2026-08-01T00:00:00.000Z",

    providerId: null,
    businessName: null,
    providerServiceType: null,
    providerCategory: null,
    verificationStatus: null,
  };
}

function adminUserPage(
  user: AdminUser = adminUser(),
): AdminUserPage {
  return {
    users: [user],

    statistics: {
      totalAccounts: 1,
      customers: 1,
      providers: 0,
      verifiedProviders: 0,
      pendingProviders: 0,
      restrictedAccounts:
        user.accountStatus === "active"
          ? 0
          : 1,
      registeredThisMonth: 1,
      registeredLastMonth: 0,
      accountGrowthPercentage: null,
    },

    nextCursor: null,
    hasMore: false,
  };
}


it("renders the final reasons and rejects placeholder Other explanations", async () => {
  mocks.manageAccess.mockResolvedValue({userId: "customer-1", accountStatus: "disabled", changed: true});
  mocks.loadUsers.mockResolvedValue(adminUserPage({...adminUser(), accountStatus: "disabled", isActive: false}));
  render(<UserManagementClient initialPage={adminUserPage()} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
  fireEvent.click(screen.getByRole("button", {name: "Restrict account access for Test Customer"}));
  for (const reason of restrictionReasons) expect(screen.getByRole("option", {name: reason})).toBeInTheDocument();
  expect(screen.queryByRole("option", {name: "Administrative reason"})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reason for restriction"), {target: {value: "Other"}});
  fireEvent.change(screen.getByLabelText(/Internal note/), {target: {value: "Duplicate ownership report is being reviewed."}});
  for (const placeholder of ["test", "12345", "asdf", "other", "none", "n/a", "test test test", "12345 12345", "other other", "none none none", "  n/a n/a n/a  "]) {
    fireEvent.change(screen.getByLabelText(/Explanation for the user/), {target: {value: placeholder}});
    expect(screen.getByRole("button", {name: "Restrict access"})).toBeDisabled();
  }
  expect(mocks.manageAccess).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Explanation for the user/), {target: {value: "  Account temporarily restricted while duplicate business ownership information is being reviewed.  "}});
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Restrict access"}));});
  expect(mocks.manageAccess).toHaveBeenCalledWith(expect.objectContaining({decision: "disable", userExplanation: "Account temporarily restricted while duplicate business ownership information is being reviewed."}));
  expect(screen.getByRole("button", {name: "Restore account access for Test Customer"})).toBeInTheDocument();
});
