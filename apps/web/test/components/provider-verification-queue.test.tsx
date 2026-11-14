import {act, fireEvent, render, screen, within, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const push = vi.fn();
const refresh = vi.fn();
const queueLoad = vi.hoisted(() => vi.fn());
vi.mock("@/app/admin/providers/actions", () => ({loadProviderVerificationQueueAction: queueLoad}));
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

beforeEach(() => {
  queueLoad.mockReset().mockResolvedValue({page, selected: null,
    summary: {submitted: 1, underReview: 0, approvedToday: 0, needsResubmission: 0}});
});
afterEach(() => vi.useRealTimers());

it("keeps Submitted and Under review distinct and preserves remarks while automatically refreshing", async () => {
  vi.useFakeTimers();
  render(<ProviderVerificationQueue page={page} filters={filters}
    summary={{submitted: 2, underReview: 3, approvedToday: 1, needsResubmission: 0}}
    selected={selected} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
  fireEvent.change(screen.getByLabelText("Admin remarks"), {target: {value: "Review in progress; retain these notes."}});
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(queueLoad).toHaveBeenCalledWith(filters, selected.id);
  expect(screen.getByLabelText("Admin remarks")).toHaveValue("Review in progress; retain these notes.");
  expect(screen.getByRole("dialog", {name: selected.business.name})).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

describe("provider restoration", () => {
  beforeEach(() => {vi.mocked(reviewProviderVerification).mockReset(); refresh.mockReset();});
  function show(status: ProviderVerificationReviewDetail["status"]) {
    render(<ProviderVerificationQueue page={page} filters={filters}
      summary={{submitted: 0, underReview: 0, approvedToday: 0, needsResubmission: 0}}
      selected={{...selected, status}} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
  }
  it("offers restore only for suspended providers and requires a reason", () => {
    show("suspended");
    expect(screen.getByRole("button", {name: "Restore provider"})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Suspend/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Restore provider"}));
    expect(reviewProviderVerification).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("at least 10 characters");
  });
  it("does not offer restore for approved providers", () => {
    show("approved");
    expect(screen.queryByRole("button", {name: "Restore provider"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Suspend provider"})).toBeInTheDocument();
  });
  it("displays optional pending permits independently of required and one-of labels", () => {
    render(<ProviderVerificationQueue page={page} filters={filters}
      summary={{submitted: 0, underReview: 0, approvedToday: 0, needsResubmission: 0}}
      selected={{...selected, status: "suspended", documents: [
        {...selected.documents[0], id: "mayors", title: "Mayor's permit", isRequired: false, requirementKind: "optional"},
        {...selected.documents[0], id: "sanitary", title: "Sanitary permit", isRequired: true, requirementKind: "required"},
        {...selected.documents[0], id: "alternative", title: "Alternative permit", isRequired: false, requirementKind: "one_of"},
      ]}} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
    expect(screen.getByText("Mayor's permit")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByText("Sanitary permit")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Alternative permit")).toBeInTheDocument();
    expect(screen.getByText("One of the required documents")).toBeInTheDocument();
  });
  it("sends only trusted decision inputs and refreshes after success", async () => {
    queueLoad.mockResolvedValueOnce({page, selected: {...selected, status: "approved"},
      summary: {submitted: 0, underReview: 0, approvedToday: 1, needsResubmission: 0}});
    vi.mocked(reviewProviderVerification).mockResolvedValue({success: true, verificationId: selected.id,
      providerId: selected.providerId, previousStatus: "suspended", status: "approved", idempotentReplay: false});
    show("suspended");
    fireEvent.change(screen.getByLabelText("Admin remarks"), {target: {value: "Accidental suspension during administrator testing."}});
    fireEvent.click(screen.getByRole("button", {name: "Restore provider"}));
    const dialog = screen.getByRole("dialog", {name: "Restore this provider?"});
    expect(dialog).toHaveTextContent("rechecks the current verification requirements");
    expect(queueLoad).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", {name: "Restore provider"}));
    await waitFor(() => expect(queueLoad).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("button", {name: "Restore provider"})).not.toBeInTheDocument());
    expect(reviewProviderVerification).toHaveBeenCalledWith({verificationId: selected.id, action: "restore",
      remarks: "Accidental suspension during administrator testing.", idempotencyKey: expect.any(String)});
  });
});

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
      name: "Provider verification",
    })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", {
      name: "Search provider verification applications",
    })).toBeInTheDocument();
    expect(screen.getByRole("combobox", {
      name: "Verification status",
    })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Draft" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", {
      name: "Provider service type",
    })).toBeInTheDocument();
    expect(screen.getByRole("table", {
      name: "Provider verification",
    })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Status: Submitted").length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", {
      name: "Table pagination",
    })).toBeInTheDocument();
  });

  it("opens provider review without a route refresh", async () => {
    queueLoad.mockResolvedValueOnce({
      page,
      selected,
      summary: {
        submitted: 1,
        underReview: 0,
        approvedToday: 0,
        needsResubmission: 0,
      },
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
        selected={null}
        serviceCategoryOptions={
          TEST_SERVICE_CATEGORY_OPTIONS
        }
      />,
    );

    fireEvent.click(
      screen.getAllByRole(
        "button",
        {
          name:
            "Review A very long FEASTA catering provider business name",
        },
      )[0],
    );

    expect(push).not.toHaveBeenCalled();

    const drawer =
      screen.getByRole(
        "dialog",
        {
          name:
            "A very long FEASTA catering provider business name",
        },
      );

    expect(
      within(drawer).getByText(
        "Loading application...",
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(queueLoad).toHaveBeenCalledWith(
        filters,
        selected.id,
      );
    });

    await waitFor(() => {
      expect(
        within(drawer).getByText(
          "Ada Lovelace",
        ),
      ).toBeInTheDocument();
    });

    expect(push).not.toHaveBeenCalled();
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

  it("offers every verification status and clears the status and cursor when returning to all", () => {
    query = "status=approved&cursor=old-page&direction=next&selected=verification-one";
    render(<ProviderVerificationQueue
      page={page} filters={{...filters, status: "approved", cursor: "old-page"}}
      summary={{submitted: 2, underReview: 3, approvedToday: 1, needsResubmission: 1}}
      selected={null} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
    />);
    const statusSelect = screen.getByRole("combobox", { name: "Verification status" });
    expect(within(statusSelect).getAllByRole("option").map((option) => (option as HTMLOptionElement).value)).toEqual([
      "all", "pending", "draft", "submitted", "under_review", "approved", "resubmission_required", "rejected", "suspended",
    ]);
    fireEvent.change(statusSelect, { target: { value: "all" } });
    expect(push).toHaveBeenLastCalledWith("/admin/providers?");
    fireEvent.change(statusSelect, { target: { value: "draft" } });
    expect(push).toHaveBeenLastCalledWith("/admin/providers?status=draft");
    fireEvent.change(statusSelect, { target: { value: "pending" } });
    expect(push).toHaveBeenLastCalledWith("/admin/providers?status=pending");
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
      "Provider verification, mobile view",
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
    expect(within(dialog).getByRole("link", {name: "View document"}))
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
      expect(queueLoad).toHaveBeenCalledTimes(1);
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

    expect(screen.getByText("Additional business information").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Additional business information"));
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
      name: "Request updated documents",
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "at least 10 characters",
    );
    expect(screen.queryByRole("dialog", {
      name: "Request updated documents?",
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
        name: "Provider verification",
      });
      expect(table.parentElement).toHaveClass(
        "max-w-full",
        "overflow-x-auto",
      );
      expect(screen.getByLabelText(
        "Provider verification, mobile view",
      )).toHaveClass("md:hidden");
      expect(screen.getAllByRole("button", {
        name: "Review A very long FEASTA catering provider business name",
      }).every((button) => button.classList.contains("min-h-12"))).toBe(true);
    });
  },
);
