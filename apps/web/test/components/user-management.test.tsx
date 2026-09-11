import {
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  beforeEach,
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
          />,
        );

        expect(
          screen.getByRole(
            "button",
            {
              name:
                "Manage access for Test Customer",
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
          />,
        );

        await user.click(
          screen.getByRole(
            "button",
            {
              name:
                "Manage access for Test Customer",
            },
          ),
        );

        await user.click(
          screen.getByRole(
            "radio",
            {
              name:
                /Security or policy restriction/i,
            },
          ),
        );

        const confirm =
          screen.getByRole(
            "button",
            {
              name: "Block account",
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
            /Internal administrative reason/i,
          ),
          "Security review reference SEC-2026-001 requires temporary restriction.",
        );

        expect(confirm).toBeEnabled();

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
        ).toHaveBeenCalledTimes(1);
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
          />,
        );

        await user.click(
          screen.getByRole(
            "button",
            {
              name:
                "Manage access for Test Customer",
            },
          ),
        );

        expect(
          screen.getByRole(
            "radio",
            {
              name:
                /Restore account access/i,
            },
          ),
        ).toBeChecked();

        expect(
          screen.getByLabelText(
            /Explanation for the user/i,
          ),
        ).toHaveValue(
          "Your FEASTA account access has been restored.",
        );

        await user.type(
          screen.getByLabelText(
            /Internal administrative reason/i,
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