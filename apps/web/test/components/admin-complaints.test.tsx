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
  AdminComplaint,
  AdminComplaintPage,
} from "@/lib/admin/complaints/admin-complaint-types";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  manage: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock(
  "@/app/admin/complaints/actions",
  () => ({
    loadAdminComplaintsAction:
      mocks.load,
    manageAdminComplaintAction:
      mocks.manage,
  }),
);

vi.mock(
  "@/components/feedback/toast",
  () => ({
    feastaToast: {
      success: mocks.success,
      error: mocks.error,
    },
  }),
);

import {
  ComplaintManagementClient,
} from "@/components/admin/complaints/complaint-management-client";

describe(
  "admin complaints management",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.load.mockResolvedValue(
        pageFixture(),
      );

      mocks.manage.mockResolvedValue({
        complaintId:
          "complaint_test",
        status:
          "under_review",
        priority: "normal",
        changed: true,
      });
    });

    it(
      "renders the operational empty state",
      () => {
        render(
          <ComplaintManagementClient
            initialPage={pageFixture(
              [],
            )}
          />,
        );

        expect(
          screen.getByRole(
            "heading",
            {
              name: "Complaints",
            },
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            "No complaints submitted",
          ),
        ).toBeInTheDocument();
      },
    );

    it(
      "loads a bounded status filter",
      async () => {
        const user =
          userEvent.setup();

        render(
          <ComplaintManagementClient
            initialPage={pageFixture()}
          />,
        );

        await user.selectOptions(
          screen.getByLabelText(
            "Status",
          ),
          "under_review",
        );

        await waitFor(() => {
          expect(
            mocks.load,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                "under_review",
              pageSize: 10,
              cursor: null,
            }),
          );
        });
      },
    );

    it(
      "opens complaint details and the controlled decision dialog",
      async () => {
        const user =
          userEvent.setup();

        render(
          <ComplaintManagementClient
            initialPage={pageFixture()}
          />,
        );

        const viewButtons =
          screen.getAllByRole(
            "button",
            {
              name:
                "View complaint complaint_test",
            },
          );

        await user.click(
          viewButtons[0],
        );

        expect(
          screen.getByText(
            "Complaint details",
          ),
        ).toBeInTheDocument();

        await user.click(
          screen.getByRole(
            "button",
            {
              name:
                "Manage complaint",
            },
          ),
        );

        expect(
          screen.getByRole(
            "heading",
            {
              name:
                "Manage complaint",
            },
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByRole(
            "button",
            {
              name:
                "Start review",
            },
          ),
        ).toBeDisabled();
      },
    );

    it(
      "requires an internal reason and records an authorized decision",
      async () => {
        const user =
          userEvent.setup();

        render(
          <ComplaintManagementClient
            initialPage={pageFixture()}
          />,
        );

        await user.click(
          screen.getAllByRole(
            "button",
            {
              name:
                "View complaint complaint_test",
            },
          )[0],
        );

        await user.click(
          screen.getByRole(
            "button",
            {
              name:
                "Manage complaint",
            },
          ),
        );

        await user.type(
          screen.getByLabelText(
            /Internal administrative reason/i,
          ),
          "Initial administrative review opened.",
        );

        const confirmButton =
          screen.getByRole(
            "button",
            {
              name:
                "Start review",
            },
          );

        expect(
          confirmButton,
        ).toBeEnabled();

        await user.click(
          confirmButton,
        );

        await waitFor(() => {
          expect(
            mocks.manage,
          ).toHaveBeenCalledWith({
            complaintId:
              "complaint_test",
            decision:
              "start_review",
            priority: "normal",
            publicResponse: "",
            internalReason:
              "Initial administrative review opened.",
          });
        });

        expect(
          mocks.success,
        ).toHaveBeenCalledWith(
          "Complaint decision recorded.",
        );
      },
    );
  },
);

function pageFixture(
  complaints: AdminComplaint[] = [
    complaintFixture(),
  ],
): AdminComplaintPage {
  return {
    complaints,
    statistics: {
      totalComplaints:
        complaints.length,
      submitted:
        complaints.filter(
          (complaint) =>
            complaint.status ===
            "submitted",
        ).length,
      underReview: 0,
      awaitingResponse: 0,
      escalated: 0,
      resolved: 0,
      dismissed: 0,
      closed: 0,
    },
    nextCursor: null,
    hasMore: false,
  };
}

function complaintFixture(): AdminComplaint {
  return {
    id: "complaint_test",

    userId: "customer_test",
    complainantName:
      "Test Customer",
    complainantEmail:
      "customer@example.com",
    complainantRole:
      "customer",

    providerId:
      "provider_test",
    providerName:
      "Test Catering",
    providerOwnerId:
      "provider_owner_test",

    category:
      "service_quality",
    description:
      "The provider service did not match the confirmed booking details.",
    evidenceUrls: [],

    status: "submitted",
    priority: "normal",

    resolution: null,
    resolvedAt: null,
    resolvedBy: null,

    assignedAdminId: null,
    assignedAt: null,

    createdAt:
      "2026-08-07T00:00:00.000Z",
    updatedAt:
      "2026-08-07T00:00:00.000Z",
  };
}