import {fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {DetailDrawer} from "@/components/data/detail-drawer";
import {DetailReviewLoadingSkeleton} from "@/components/feedback/detail-review-loading-skeleton";
import {ProviderRequestDetailDrawer} from "@/app/provider/requests/provider-request-detail-drawer";
import {ProviderBookingDetailDrawer} from "@/app/provider/bookings/provider-booking-detail-drawer";
import {buildPrintableBookingSheetHtml} from "@/lib/provider/print-booking-sheet";
import {requestPackageSnapshot} from "@/lib/provider/requests/provider-request-package-snapshot";
import type {ProviderRequestListItem} from "@/lib/provider/requests/provider-request-types";
import type {ProviderBooking} from "@/lib/provider/bookings/provider-booking-types";

vi.mock("@/lib/payments/arranged-payment-client", () => ({
  respondToArrangedPayment: vi.fn(),
}));
vi.mock("@/lib/provider/payments/company-advance-client", () => ({
  requestCompanyAdvance: vi.fn(),
}));

const sampleRequest: ProviderRequestListItem = {
  id: "req-1",
  mainEventId: "evt-1",
  bookingReference: "BK-514641333B",
  providerId: "prov-1",
  type: "catering",
  status: "pending",
  customer: {id: "cust-1", name: "Sophia Ranalan", email: "sophia@example.com", phoneNumber: "+639518159572"},
  package: {id: "pkg-1", name: "Fiesta Package"},
  services: [],
  event: {
    eventType: "birthday",
    eventDate: "2026-12-10T00:00:00.000Z",
    eventTime: "14:00",
    guestCount: 50,
    venueAddress: "123 Event Hall",
    city: "Cebu City",
    notes: "Please arrive 1 hour early.",
  },
  amount: 25000,
  commissionAmount: 2500,
  providerNetAmount: 22500,
  downPaymentAmount: 12500,
  downPaymentPercentage: 50,
  paymentPolicy: "deposit_then_balance",
  canOfferArrangedPayment: true,
  rejectionReason: null,
  createdAt: "2026-11-20T08:00:00.000Z",
  updatedAt: "2026-11-20T08:00:00.000Z",
  respondedAt: null,
  packageSnapshot: requestPackageSnapshot(
    {
      serviceTier: "full_service",
      packageThemeName: "Emerald Classic",
      packageThemeDescription: "Green and white setup",
      packageOfferSnapshotV2: {
        tier: "full_service",
        pricingModel: "per_bundle",
        unitCentavos: 2500000,
        foodInclusions: ["Steamed Rice"],
        serviceInclusions: ["Waiters"],
      },
    },
    {
      packagePrice: 25000,
      foodChoiceSelections: [
        {groupId: "mains", title: "Main Dishes", options: [{id: "adobo", name: "Chicken Adobo"}]},
      ],
    },
  ),
};

const sampleBooking: ProviderBooking = {
  providerRequestId: "req-2",
  mainEventId: "evt-2",
  providerId: "prov-1",
  customerId: "cust-1",
  customerDisplayName: "Sophia Ranalan",
  requestType: "catering",
  providerRequestStatus: "confirmed",
  mainEventStatus: "confirmed",
  eventType: "wedding",
  eventDate: "2026-12-20T00:00:00.000Z",
  eventTime: "18:00",
  eventEndTime: "22:00",
  guestCount: 80,
  venueAddress: "Grand Ballroom",
  locationSummary: "Grand Ballroom, Cebu City",
  packageId: "pkg-1",
  packageName: "Wedding Banquet",
  serviceCategory: "catering_service",
  serviceSummary: "Wedding Banquet",
  services: [],
  requestedAmount: 50000,
  acceptedAmount: 50000,
  downPaymentAmount: 25000,
  commissionAmount: 5000,
  providerNetAmount: 45000,
  paymentAmount: 25000,
  paymentStatus: "partially_paid",
  remainingBalance: 25000,
  currency: "PHP",
  payment: null,
  rejectionReason: null,
  cancellationReason: null,
  acceptedAt: "2026-11-20T09:00:00.000Z",
  confirmedAt: "2026-11-21T09:00:00.000Z",
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancellationActor: null,
  canStartEvent: true,
  canCompleteEvent: false,
  companyAdvanceRequestStatus: null,
  companyAdvanceStatus: null,
  companyAdvanceRequestAttemptCount: 0,
  companyAdvanceRequestMaxAttempts: 2,
  companyAdvanceRequestRemainingAttempts: 2,
  refundEligibility: {
    evidenceStatus: "legacy",
    currentStage: null,
    canMarkPreparationStarted: false,
    reconciliationLocked: false,
    activeCancellationLocked: false,
  },
  timelineCount: 0,
  createdAt: "2026-11-20T08:00:00.000Z",
  updatedAt: "2026-11-20T08:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const frame of document.querySelectorAll("iframe[data-feasta-print-frame]")) {
    frame.remove();
  }
});

describe("full-screen printable request and booking details", () => {
  it("builds a standalone A4 HTML booking sheet with zero browser margins and strict HTML escaping", () => {
    const html = buildPrintableBookingSheetHtml({
      documentTitle: "Booking Request Sheet",
      fileTitle: "FEASTA - BK-123",
      reference: "BK-123",
      status: "New",
      submittedAt: "Nov 23, 2026",
      eventDetails: [
        {label: "Date & Time", value: "Nov 28, 2026 · 2:59 PM"},
        {label: "Venue", value: "Hall <A> & Ballroom"},
      ],
      customerDetails: [{label: "Name", value: '<script>alert("xss")</script>'}],
      packageSummary: {
        name: "Fiesta Package",
        tier: "Buffet Setup",
        meta: "₱1,000 · Per bundle · 25 guests",
        selectedDishes: [{groupTitle: "Main Dish", dishes: ["Chicken Adobo", "Pork Menudo"]}],
        inclusionGroups: [{title: "Fixed food inclusions", items: ["Steamed Rice", "Bihon"]}],
      },
      notes: [{title: "Special Instructions", body: "Arrive early & setup tables."}],
      paymentSummary: {
        lines: [
          {label: "Request total (your share)", amount: "₱1,000"},
          {label: "Your net earning (after commission)", amount: "₱1,000", highlight: true, dividerAbove: true},
        ],
        details: ["Eligibility: Down payment or full payment"],
        footnote: "Original package terms: ₱500 upfront (50%)",
      },
      footerText: "FEASTA Provider Copy · Last updated Nov 23, 2026",
    });

    expect(html).toContain("@page");
    expect(html).toContain("margin: 0;");
    expect(html).toContain("Booking Request Sheet");
    expect(html).toContain("BK-123");
    expect(html).toContain("Chicken Adobo, Pork Menudo");
    expect(html).toContain("Steamed Rice");
    expect(html).toContain("Arrive early &amp; setup tables.");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders DetailDrawer full-screen and triggers fallback print while temporarily expanding collapsed details", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <DetailDrawer
        open
        onOpenChange={() => {}}
        fullScreen
        printable
        title="Printable Review"
        description="Full-screen printable review."
        footer={<button type="button">Action</button>}
      >
        <details>
          <summary>More details</summary>
          <p>Hidden until expanded</p>
        </details>
      </DetailDrawer>,
    );

    const dialog = screen.getByRole("dialog", {name: "Printable Review"});
    expect(dialog).toHaveClass("inset-0", "w-screen", "max-w-none");
    expect(dialog).toHaveAttribute("data-printable-detail-drawer", "true");

    const details = dialog.querySelector("details")!;
    expect(details.open).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", {name: "Print"}));
    expect(details.open).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);

    fireEvent(window, new Event("afterprint"));
    expect(details.open).toBe(false);
  });

  it("prints an isolated A4 Booking Request Sheet with expanded dishes, theme, and inclusions via hidden iframe", () => {
    const mainWindowPrintSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const onOpenChange = vi.fn();
    render(<ProviderRequestDetailDrawer request={sampleRequest} open onOpenChange={onOpenChange} />);

    const dialog = screen.getByRole("dialog", {name: "Request details"});
    expect(dialog).toHaveClass("inset-0", "w-screen", "max-w-none");
    expect(dialog).toHaveAttribute("data-printable-detail-drawer", "true");
    expect(within(dialog).queryByRole("button", {name: "Close dialog"})).toBeNull();
    expect(within(dialog).getByRole("button", {name: "Back to Requests"})).toBeVisible();
    expect(within(dialog).getByText("BK-514641333B")).toBeVisible();
    expect(within(dialog).getByText("Your net earning")).toBeVisible();
    expect(within(dialog).getByText("Event overview")).toBeVisible();
    expect(within(dialog).getByRole("link", {name: /Open in Maps/})).toHaveAttribute(
      "href",
      expect.stringContaining("google.com/maps/search"),
    );
    expect(within(dialog).getByRole("button", {name: "Offer arranged payment"})).toBeVisible();

    const toggle = within(dialog).getByRole("button", {name: "View full package details"});
    expect(toggle).toHaveAttribute("data-print-hidden");
    const expandable = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(expandable).toHaveAttribute("data-print-expand");

    let iframePrintSpy: ReturnType<typeof vi.fn> | null = null;
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      const appended = Node.prototype.appendChild.call(document.body, node);
      if (node instanceof HTMLIFrameElement && node.contentWindow) {
        iframePrintSpy = vi.fn();
        Object.defineProperty(node.contentWindow, "print", {
          value: iframePrintSpy,
          configurable: true,
        });
      }
      return appended as never;
    });

    fireEvent.click(within(dialog).getByRole("button", {name: "Print"}));

    expect(mainWindowPrintSpy).not.toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(iframePrintSpy).toHaveBeenCalledTimes(1);

    const frame = document.querySelector<HTMLIFrameElement>("iframe[data-feasta-print-frame='true']")!;
    expect(frame).not.toBeNull();
    const printedHtml = frame.contentDocument?.documentElement.outerHTML ?? "";
    expect(printedHtml).toContain("Booking Request Sheet");
    expect(printedHtml).toContain("BK-514641333B");
    expect(printedHtml).toContain("Sophia Ranalan");
    expect(printedHtml).toContain("Chicken Adobo");
    expect(printedHtml).toContain("Steamed Rice");
    expect(printedHtml).toContain("Waiters");
    expect(printedHtml).toContain("Emerald Classic");
    expect(printedHtml).toContain("Please arrive 1 hour early.");

    frame.contentWindow?.dispatchEvent(new Event("afterprint"));
    expect(document.querySelector("iframe[data-feasta-print-frame='true']")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", {name: "Back to Requests"}));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders ProviderBookingDetailDrawer full-screen with Back to Bookings, loading skeleton, and isolated Booking Order Sheet print", () => {
    const mainPrintSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const {rerender} = render(
      <ProviderBookingDetailDrawer
        booking={null}
        timeline={null}
        open
        loading
        error={null}
        actionPending={false}
        onOpenChange={() => {}}
        onRetry={() => {}}
        onStart={() => {}}
        onComplete={() => {}}
        onPreparationStarted={() => {}}
      />,
    );

    expect(screen.getByRole("status", {name: "Loading booking details"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Back to Bookings"})).toBeVisible();
    expect(screen.queryByRole("button", {name: "Close dialog"})).toBeNull();

    rerender(
      <ProviderBookingDetailDrawer
        booking={sampleBooking}
        timeline={null}
        open
        loading={false}
        error={null}
        actionPending={false}
        onOpenChange={() => {}}
        onRetry={() => {}}
        onStart={() => {}}
        onComplete={() => {}}
        onPreparationStarted={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", {name: "Booking details"});
    expect(dialog).toHaveClass("inset-0", "w-screen", "max-w-none");
    expect(dialog).toHaveAttribute("data-printable-detail-drawer", "true");

    let iframePrintSpy: ReturnType<typeof vi.fn> | null = null;
    vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      const appended = Node.prototype.appendChild.call(document.body, node);
      if (node instanceof HTMLIFrameElement && node.contentWindow) {
        iframePrintSpy = vi.fn();
        Object.defineProperty(node.contentWindow, "print", {
          value: iframePrintSpy,
          configurable: true,
        });
      }
      return appended as never;
    });

    fireEvent.click(within(dialog).getByRole("button", {name: "Print"}));
    expect(mainPrintSpy).not.toHaveBeenCalled();
    expect(iframePrintSpy).toHaveBeenCalledTimes(1);
    const frame = document.querySelector<HTMLIFrameElement>("iframe[data-feasta-print-frame='true']")!;
    expect(frame.contentDocument?.documentElement.outerHTML ?? "").toContain("Booking Order Sheet");
  });

  it("renders DetailReviewLoadingSkeleton with accessible busy status", () => {
    render(<DetailReviewLoadingSkeleton label="Loading request details…" />);
    const skeleton = screen.getByRole("status", {name: "Loading request details…"});
    expect(skeleton).toHaveAttribute("aria-busy", "true");
  });
});
