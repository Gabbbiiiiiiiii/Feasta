import {fireEvent, render, screen, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const push = vi.fn();
const refresh = vi.fn();
let query = "";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/providers",
  useRouter: () => ({push, refresh}),
  useSearchParams: () => new URLSearchParams(query),
}));

import {ProviderVerificationQueue} from "@/components/admin/provider-verification/provider-verification-queue";
import {
  reviewProviderTaxProfile,
  reviewProviderVerification,
} from "@/lib/admin/provider-verification/provider-verification-client";
import type {
  ProviderVerificationQueueFilters,
  ProviderVerificationQueuePage,
  ProviderVerificationReviewDetail,
} from "@/lib/admin/provider-verification/provider-verification-types";

vi.mock(
  "@/lib/admin/provider-verification/provider-verification-client",
  () => ({
    reviewProviderTaxProfile:
      vi.fn(),

    reviewProviderVerification:
      vi.fn(),
  }),
);

const filters: ProviderVerificationQueueFilters = {
  search: "",
  status: "all",
  serviceType: "all",
  from: "",
  to: "",
  cursor: null,
  direction: "next",
};

const page: ProviderVerificationQueuePage = {
  items: [{
    id: "verification-one",
    providerId: "provider-one",
    businessName: "A very long FEASTA catering provider business name",
    ownerName: "Ada Lovelace",
    email: "provider@feasta.test",
    providerServiceType: "catering",
    submittedAt: "Jul 28, 2026",
    status: "submitted",
  }],
  previousCursor: "previous-cursor",
  nextCursor: "next-cursor",
  pageSize: 20,
};

const selected: ProviderVerificationReviewDetail = {
  id: "verification-one",
  providerId: "provider-one",
  owner: {
    name: "Ada Lovelace",
    email: "owner@feasta.test",
    phone: "+639171234567",
  },
  business: {
    name: "A very long FEASTA catering provider business name",
    email: "provider@feasta.test",
    phone: "+639181234567",
    description: "Accessible full-service catering.",
    serviceType: "catering",
    address: "123 Event Street",
    city: "Ormoc City",
    province: "Leyte",
  },
  operations: {
    serviceCategories: ["catering_service"],
    eventTypes: ["wedding"],
    serviceAreas: ["Ormoc City"],
    maximumServiceDistance: "50 km",
    guestCapacity: "10–200 guests",
    eventsPerDay: "One event per day",
    staffCount: "10 staff",
    equipmentCount: "20 equipment units",
    operatingDays: ["monday", "tuesday"],
    bookingLeadTime: "3 days",
    unavailableDates: [],
  },
  media: {
    logoUrl: null,
    coverImageUrl: null,
  },

  taxProfile: null,

  status: "submitted",
  submittedAt: "Jul 28, 2026, 9:00 AM",
  reviewedAt: "Not available",
  reviewedBy: null,
  remarks: null,
  rejectionReason: null,
  resubmissionReason: null,
  suspensionReason: null,
  termsPolicyVersion: "2026-01",
  privacyPolicyVersion: "2026-01",
  documents: [{
    id: "business_permit",
    documentType: "business_permit",
    title: "Business permit",
    fileName: "permit.pdf",
    fileSize: "1.0 MB",
    contentType: "application/pdf",
    status: "pending",
    isRequired: true,
    reviewNote: null,
    uploadedAt: "Jul 28, 2026, 8:00 AM",
    viewPath:
      "/api/admin/provider-verifications/verification-one/documents/" +
      "business_permit?disposition=inline",
    downloadPath:
      "/api/admin/provider-verifications/verification-one/documents/" +
      "business_permit?disposition=attachment",
  }],
  history: [{
    id: "history-one",
    eventType: "verification_submitted",
    fromStatus: "draft",
    toStatus: "submitted",
    remarks: null,
    documentType: null,
    documentStatus: null,
    actorRole: "provider",
    actorId: "provider-owner",
    auditLogId: "audit-one",
    createdAt: "Jul 28, 2026, 9:00 AM",
  }],
};

import {TEST_SERVICE_CATEGORY_OPTIONS} from "../fixtures/service-category-options";

describe("provider verification queue", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.mocked(
      reviewProviderTaxProfile,
    ).mockReset();

    vi.mocked(
      reviewProviderVerification,
    ).mockReset();

    query = "";
  });

  it("uses accessible shared table, filters, status, and cursor controls", () => {
    render(
      <ProviderVerificationQueue
        page={page}
        filters={filters}
        summary={{submitted: 2, underReview: 3, approvedToday: 1, needsResubmission: 1}}
        selected={null}
      serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
      />,
    );
    expect(screen.getByRole("heading", {
      level: 1,
      name: "Provider verification queue",
    })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", {
      name: "Search provider verification applications",
    })).toBeInTheDocument();
    expect(screen.getByRole("combobox", {
      name: "Verification status",
    })).toBeInTheDocument();
    expect(screen.queryByRole("option", {
      name: "Draft",
    })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", {
      name: "Provider service type",
    })).toBeInTheDocument();
    expect(screen.getByRole("table", {
      name: "Provider verification queue",
    })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Status: Submitted").length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", {
      name: "Table pagination",
    })).toBeInTheDocument();
  });

  it("persists server filter and pagination state in the URL", () => {
    render(
      <ProviderVerificationQueue
        page={page}
        filters={filters}
        summary={{submitted: 2, underReview: 3, approvedToday: 1, needsResubmission: 1}}
        selected={null}
      serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", {
      name: "Verification status",
    }), {target: {value: "submitted"}});
    expect(push).toHaveBeenCalledWith(
      expect.stringContaining("status=submitted"),
    );

    fireEvent.click(screen.getByRole("button", {name: "Next"}));
    expect(push).toHaveBeenCalledWith(
      expect.stringMatching(/cursor=next-cursor.*direction=next/u),
    );

    fireEvent.change(screen.getByRole("combobox", {
      name: "Provider service type",
    }), {target: {value: "addon"}});
    expect(push).toHaveBeenCalledWith(
      expect.stringContaining("serviceType=addon"),
    );

    fireEvent.change(screen.getByLabelText("Application from"), {
      target: {value: "2026-07-01"},
    });
    expect(push).toHaveBeenCalledWith(
      expect.stringContaining("from=2026-07-01"),
    );
  });

  it("provides a mobile-safe card and focus-managed detail drawer", () => {
    render(
      <ProviderVerificationQueue
        page={page}
        filters={filters}
        summary={{submitted: 2, underReview: 3, approvedToday: 1, needsResubmission: 1}}
        selected={selected}
      serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
      />,
    );
    const mobileView = screen.getByLabelText(
      "Provider verification queue, mobile view",
    );
    expect(mobileView).toHaveClass("md:hidden");
    expect(within(mobileView).getByRole("heading", {level: 2, hidden: true}))
      .toHaveTextContent("A very long FEASTA catering provider business name");
    const dialog = screen.getByRole("dialog", {
      name: "A very long FEASTA catering provider business name",
    });
    expect(dialog).toHaveClass(
      "w-[min(100vw,32rem)]",
      "max-w-[100vw]",
      "overflow-x-hidden",
    );
    expect(within(dialog).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", {name: "Securely view"}))
      .toHaveAttribute("href", selected.documents[0].viewPath);
    expect(within(dialog).getByLabelText("Status: Pending"))
      .toBeInTheDocument();
  });

  it("shows the standardized empty state only when the server page is empty", () => {
    render(
      <ProviderVerificationQueue
        page={{...page, items: []}}
        filters={{...filters, search: "missing"}}
        summary={{submitted: 0, underReview: 0, approvedToday: 0, needsResubmission: 0}}
        selected={null}
      serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
      />,
    );
    expect(screen.getByText("No verification applications")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms and submits the canonical start-review transition once", async () => {
    vi.mocked(reviewProviderVerification).mockResolvedValueOnce({
      success: true,
      verificationId: selected.id,
      providerId: selected.providerId,
      previousStatus: "submitted",
      status: "under_review",
      idempotentReplay: false,
    });
    render(
      <ProviderVerificationQueue
        page={page}
        filters={filters}
        summary={{submitted: 1, underReview: 0, approvedToday: 0, needsResubmission: 0}}
        selected={selected}
      serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
      />,
    );
    fireEvent.click(screen.getByRole("button", {name: "Start review"}));
    const confirmation = screen.getByRole("dialog", {
      name: "Start reviewing this provider?",
    });
    fireEvent.click(within(confirmation).getByRole("button", {
      name: "Start review",
    }));
    await vi.waitFor(() => {
      expect(reviewProviderVerification).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(1);
    });
    expect(reviewProviderVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationId: selected.id,
        action: "start_review",
      }),
    );
  });

  it("reviews a pending tax profile independently from provider approval", async () => {
    vi.mocked(
      reviewProviderTaxProfile,
    ).mockResolvedValueOnce({
      providerId:
        selected.providerId,

      verificationStatus:
        "verified",
    });

    render(
      <ProviderVerificationQueue
        page={page}
        filters={filters}
        summary={{
          submitted: 1,
          underReview: 0,
          approvedToday: 0,
          needsResubmission: 0,
        }}
        selected={{
          ...selected,

          taxProfile: {
            birRegisteredName:
              "FEASTA Sample Catering",

            tin:
              "123456789000",

            taxType:
              "vat_registered",

            verificationStatus:
              "pending",

            submittedAt:
              "Sep 25, 2026, 7:00 PM",

            verifiedAt:
              "Not available",

            rejectedAt:
              "Not available",

            rejectionReason:
              null,
          },
        }}
        serviceCategoryOptions={
          TEST_SERVICE_CATEGORY_OPTIONS
        }
      />,
    );

    expect(
      screen.getByRole(
        "heading",
        {
          name:
            "Tax profile verification",
        },
      ),
    ).toBeVisible();

    expect(
      screen.getByText(
        "FEASTA Sample Catering",
      ),
    ).toBeVisible();

    expect(
      screen.getByText(
        "123456789000",
      ),
    ).toBeVisible();

    expect(
      screen.getByText(
        "Vat Registered",
      ),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole(
        "button",
        {
          name:
            "Verify Tax Profile",
        },
      ),
    );

    const confirmation =
      screen.getByRole(
        "dialog",
        {
          name:
            "Verify this tax profile?",
        },
      );

    fireEvent.click(
      within(
        confirmation,
      ).getByRole(
        "button",
        {
          name:
            "Verify Tax Profile",
        },
      ),
    );

    await vi.waitFor(
      () => {
        expect(
          reviewProviderTaxProfile,
        ).toHaveBeenCalledWith({
          providerId:
            selected.providerId,

          action:
            "verify",

          reason:
            undefined,
        });

        expect(
          refresh,
        ).toHaveBeenCalled();
      },
    );

    expect(
      reviewProviderVerification,
    ).not.toHaveBeenCalled();
  });

  it("requires a meaningful reason before rejecting a tax profile", () => {
    render(
      <ProviderVerificationQueue
        page={page}
        filters={filters}
        summary={{
          submitted: 1,
          underReview: 0,
          approvedToday: 0,
          needsResubmission: 0,
        }}
        selected={{
          ...selected,

          taxProfile: {
            birRegisteredName:
              "FEASTA Sample Catering",

            tin:
              "123456789000",

            taxType:
              "non_vat",

            verificationStatus:
              "pending",

            submittedAt:
              "Sep 25, 2026, 7:00 PM",

            verifiedAt:
              "Not available",

            rejectedAt:
              "Not available",

            rejectionReason:
              null,
          },
        }}
        serviceCategoryOptions={
          TEST_SERVICE_CATEGORY_OPTIONS
        }
      />,
    );

    fireEvent.change(
      screen.getByLabelText(
        "Tax review reason",
      ),
      {
        target: {
          value: "short",
        },
      },
    );

    fireEvent.click(
      screen.getByRole(
        "button",
        {
          name:
            "Reject Tax Profile",
        },
      ),
    );

    expect(
      screen.getByRole(
        "alert",
      ),
    ).toHaveTextContent(
      "at least 10 characters",
    );

    expect(
      reviewProviderTaxProfile,
    ).not.toHaveBeenCalled();

    expect(
      screen.queryByRole(
        "dialog",
        {
          name:
            "Reject this tax profile?",
        },
      ),
    ).not.toBeInTheDocument();
  });

  it("requires meaningful remarks before an adverse decision is sent", async () => {
    render(
      <ProviderVerificationQueue
        page={page}
        filters={filters}
        summary={{submitted: 0, underReview: 1, approvedToday: 0, needsResubmission: 0}}
        selected={{...selected, status: "under_review"}}
      serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
      />,
    );
    fireEvent.change(screen.getByLabelText("Admin remarks"), {
      target: {value: "short"},
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Request resubmission",
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "at least 10 characters",
    );
    expect(screen.queryByRole("dialog", {
      name: "Request document resubmission?",
    })).not.toBeInTheDocument();
    expect(reviewProviderVerification).not.toHaveBeenCalled();
  });
});

describe.each([360, 390, 768, 1024, 1440])(
  "provider verification queue at %i px",
  (width) => {
    it("keeps overflow local and retains mobile/desktop alternatives", () => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      window.dispatchEvent(new Event("resize"));
      render(
        <ProviderVerificationQueue
          page={page}
          filters={filters}
          summary={{submitted: 2, underReview: 3, approvedToday: 1, needsResubmission: 1}}
          selected={null}
        serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
        />,
      );
      const table = screen.getByRole("table", {
        name: "Provider verification queue",
      });
      expect(table.parentElement).toHaveClass(
        "max-w-full",
        "overflow-x-auto",
      );
      expect(screen.getByLabelText(
        "Provider verification queue, mobile view",
      )).toHaveClass("md:hidden");
      expect(screen.getAllByRole("button", {
        name: "Inspect A very long FEASTA catering provider business name",
      }).every((button) => button.classList.contains("min-h-12"))).toBe(true);
    });
  },
);
