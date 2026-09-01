import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  CustomerRefundPolicyDisclosure,
} from "@/lib/customer/bookings/customer-refund-policy-client";
import type {
  PublicEventService,
  PublicPackageDetail,
} from "@/lib/customer/discovery/marketplace-types";

const mocks = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
  loadDisclosures: vi.fn(),
  submitBooking: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({replace: mocks.replace}),
}));

vi.mock("@/lib/customer/bookings/customer-provider-availability-client", () => ({
  checkCustomerProviderAvailability: mocks.checkAvailability,
}));

vi.mock("@/lib/customer/bookings/customer-booking-submission-client", () => ({
  submitCustomerBookingRequest: mocks.submitBooking,
  bookingSubmissionRequiresRefundPolicyRefresh: (error: unknown) =>
    Boolean((error as {refreshRefundPolicies?: boolean})?.refreshRefundPolicies),
}));

vi.mock("@/lib/customer/bookings/customer-refund-policy-client", () => ({
  getCustomerBookingRefundPolicyDisclosures: mocks.loadDisclosures,
  buildRefundPolicyAcknowledgements: (
    policies: readonly CustomerRefundPolicyDisclosure[],
  ) => policies.map(({providerId, effectivePolicyKey}) => ({
    providerId,
    effectivePolicyKey,
  })),
}));

import {EventCustomizationExperience} from "@/components/customer/bookings/event-customization-experience";

const PRIMARY_PROVIDER_ID = "provider_primary_private_123";
const ADDON_PROVIDER_ID = "provider_addon_private_456";

describe("Customer booking refund policy disclosure and agreement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-09-01T02:00:00.000Z"));
    mocks.checkAvailability.mockResolvedValue([
      available(PRIMARY_PROVIDER_ID),
      available(ADDON_PROVIDER_ID),
    ]);
    mocks.loadDisclosures.mockResolvedValue(disclosureResult([primaryPolicy()]));
    mocks.submitBooking.mockResolvedValue({
      bookingId: "booking_created_123",
      mainEventId: "booking_created_123",
      providerRequestIds: ["request_created_123"],
      created: true,
    });
  });

  it("shows a single Provider default policy, exact stages, optional terms, and requires acknowledgement", async () => {
    const user = userEvent.setup();
    renderExperience();
    await reachReview();

    const refundSection = await screen.findByRole("region", {name: "Refund Policy"});
    expect(within(refundSection).getByRole("heading", {name: "Maria's Catering"}))
      .toBeVisible();
    expect(within(refundSection).getByText("Provider default policy")).toBeVisible();
    expect(within(refundSection).getByText("Preparation Not Started")).toBeVisible();
    expect(within(refundSection).getByText("Preparation Started")).toBeVisible();
    expect(within(refundSection).getByText("Service Started")).toBeVisible();
    expect(within(refundSection).getByText("100%")).toBeVisible();
    expect(within(refundSection).getByText("50.25%")).toBeVisible();
    expect(within(refundSection).getByText("Written notice is appreciated."))
      .toBeVisible();
    expect(within(refundSection).queryByText(/₱|PHP|estimated refund/iu))
      .not.toBeInTheDocument();

    const submit = screen.getByRole("button", {name: "Submit booking request"});
    expect(submit).toBeDisabled();
    const acknowledgement = within(refundSection).getByRole("checkbox", {
      name: /I have reviewed Maria's Catering's refund policy/iu,
    });
    expect(acknowledgement).not.toBeChecked();
    acknowledgement.focus();
    await user.keyboard(" ");
    expect(acknowledgement).toHaveFocus();
    expect(submit).toBeEnabled();
    expect(document.body).not.toHaveTextContent(PRIMARY_PROVIDER_ID);

    await user.click(submit);
    await waitFor(() => expect(mocks.submitBooking).toHaveBeenCalledTimes(1));
    const payload = mocks.submitBooking.mock.calls[0][0];
    expect(payload.policyAcknowledgements).toEqual([{
      providerId: PRIMARY_PROVIDER_ID,
      effectivePolicyKey: "provider_default:primary:v4",
    }]);
    expect(payload).not.toHaveProperty("refundPolicy");
    expect(JSON.stringify(payload.policyAcknowledgements))
      .not.toMatch(/rules|terms|refundBasisPoints|policyVersion/u);
  });

  it("requires every policy in a multi-Provider booking and submits one acknowledgement per Provider", async () => {
    const user = userEvent.setup();
    mocks.loadDisclosures.mockResolvedValue(disclosureResult([
      {
        ...primaryPolicy(),
        effectivePolicyKey: "package_override:wedding:v2",
        sourceKind: "package_override",
      },
      addonPolicy(),
    ]));
    renderExperience();
    await reachReview({selectAddon: true});

    const refundSection = await screen.findByRole("region", {name: "Refund Policy"});
    expect(within(refundSection).getAllByRole("article")).toHaveLength(2);
    expect(within(refundSection).getByText("Provider default policy")).toBeVisible();
    expect(within(refundSection).getByText("Package-specific policy")).toBeVisible();

    const checkboxes = within(refundSection).getAllByRole("checkbox");
    const submit = screen.getByRole("button", {name: "Submit booking request"});
    await user.click(checkboxes[0]);
    expect(submit).toBeDisabled();
    await user.click(checkboxes[1]);
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(mocks.submitBooking).toHaveBeenCalledTimes(1));
    const acknowledgements = mocks.submitBooking.mock.calls[0][0]
      .policyAcknowledgements as Array<{providerId: string; effectivePolicyKey: string}>;
    expect(acknowledgements).toHaveLength(2);
    expect(new Set(acknowledgements.map((item) => item.providerId)).size).toBe(2);
  });

  it("blocks submission while disclosures are unavailable and supports an accessible retry", async () => {
    mocks.loadDisclosures
      .mockRejectedValueOnce(new Error("Refund policy details could not be loaded."))
      .mockResolvedValueOnce(disclosureResult([primaryPolicy()]));
    renderExperience();
    await reachReview();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Refund policy details could not be loaded",
    );
    expect(screen.getByRole("button", {name: "Submit booking request"}))
      .toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Try again"}));
    expect(await screen.findByRole("checkbox", {
      name: /I have reviewed Maria's Catering's refund policy/iu,
    })).not.toBeChecked();
  });

  it("refreshes a changed policy, clears agreement, and requires acknowledgement again", async () => {
    const user = userEvent.setup();
    const changedPolicy = {
      ...primaryPolicy(),
      effectivePolicyKey: "provider_default:primary:v5",
      rules: [
        {stage: "preparation_not_started" as const, refundBasisPoints: 9_000},
        {stage: "preparation_started" as const, refundBasisPoints: 4_000},
        {stage: "service_started" as const, refundBasisPoints: 0},
      ],
    };
    mocks.loadDisclosures
      .mockResolvedValueOnce(disclosureResult([primaryPolicy()]))
      .mockResolvedValueOnce(disclosureResult([changedPolicy]));
    const stale = Object.assign(new Error("stale"), {
      refreshRefundPolicies: true,
    });
    mocks.submitBooking
      .mockRejectedValueOnce(stale)
      .mockResolvedValueOnce({
        bookingId: "booking_created_123",
        mainEventId: "booking_created_123",
        providerRequestIds: ["request_created_123"],
        created: true,
      });

    renderExperience();
    await reachReview();
    await user.click(await screen.findByRole("checkbox", {
      name: /I have reviewed Maria's Catering's refund policy/iu,
    }));
    await user.click(screen.getByRole("button", {name: "Submit booking request"}));

    expect(await screen.findByText(/policy changed.*acknowledge it again/iu))
      .toBeVisible();
    expect(await screen.findByText("90%")).toBeVisible();
    const refreshedAcknowledgement = screen.getByRole("checkbox", {
      name: /I have reviewed Maria's Catering's refund policy/iu,
    });
    expect(refreshedAcknowledgement).not.toBeChecked();
    expect(screen.getByRole("button", {name: "Submit booking request"}))
      .toBeDisabled();

    await user.click(refreshedAcknowledgement);
    await user.click(screen.getByRole("button", {name: "Submit booking request"}));
    await waitFor(() => expect(mocks.submitBooking).toHaveBeenCalledTimes(2));
    expect(mocks.submitBooking.mock.calls[1][0].policyAcknowledgements)
      .toEqual([{
        providerId: PRIMARY_PROVIDER_ID,
        effectivePolicyKey: "provider_default:primary:v5",
      }]);
  });
});

async function reachReview({selectAddon = false}: {selectAddon?: boolean} = {}) {
  fireEvent.change(screen.getByLabelText("Event date"), {target: {value: "2026-09-20"}});
  fireEvent.change(screen.getByLabelText("Start time"), {target: {value: "18:00"}});
  fireEvent.change(screen.getByLabelText("End time"), {target: {value: "22:00"}});
  fireEvent.change(screen.getByLabelText(/^Number of guests/iu), {target: {value: "100"}});
  await screen.findByText("Maria's Catering is available");
  fireEvent.change(screen.getByLabelText(/^Complete event address/iu), {
    target: {value: "Grand Ballroom, Ormoc City"},
  });
  fireEvent.click(screen.getByRole("button", {name: "Continue"}));
  fireEvent.click(screen.getByRole("button", {name: "Continue"}));
  if (selectAddon) {
    const card = screen.getByText("Event photography").closest("label");
    if (!card) throw new Error("Expected event service card.");
    fireEvent.click(within(card).getByRole("checkbox"));
  }
  fireEvent.click(screen.getByRole("button", {name: "Review booking"}));
  await screen.findByRole("heading", {name: "Review your booking request"});
  await waitFor(() => expect(mocks.loadDisclosures).toHaveBeenCalled());
}

function disclosureResult(policies: readonly CustomerRefundPolicyDisclosure[]) {
  return {acknowledgementsRequired: true, policies};
}

function primaryPolicy(): CustomerRefundPolicyDisclosure {
  return {
    providerId: PRIMARY_PROVIDER_ID,
    providerName: "Maria's Catering",
    effectivePolicyKey: "provider_default:primary:v4",
    sourceKind: "provider_default",
    rules: [
      {stage: "preparation_not_started", refundBasisPoints: 10_000},
      {stage: "preparation_started", refundBasisPoints: 5_025},
      {stage: "service_started", refundBasisPoints: 0},
    ],
    terms: "Written notice is appreciated.",
  };
}

function addonPolicy(): CustomerRefundPolicyDisclosure {
  return {
    providerId: ADDON_PROVIDER_ID,
    providerName: "Photo Studio",
    effectivePolicyKey: "provider_default:addon:v2",
    sourceKind: "provider_default",
    rules: [
      {stage: "preparation_not_started", refundBasisPoints: 8_000},
      {stage: "preparation_started", refundBasisPoints: 3_000},
      {stage: "service_started", refundBasisPoints: 0},
    ],
    terms: null,
  };
}

function renderExperience() {
  return render(
    <EventCustomizationExperience
      detail={detailFixture()}
      eventServices={serviceFixtures()}
    />,
  );
}

function detailFixture(): PublicPackageDetail {
  return {
    packageRecord: {
      id: "package_wedding_12345678",
      providerId: PRIMARY_PROVIDER_ID,
      providerName: "Maria's Catering",
      name: "Wedding celebration",
      description: "Complete package",
      eventType: "wedding",
      price: 100_000,
      imageUrl: null,
      minimumGuests: 50,
      maximumGuests: 150,
      inclusions: ["Buffet"],
    },
    provider: {
      id: PRIMARY_PROVIDER_ID,
      businessName: "Maria's Catering",
      description: "Catering provider",
      serviceType: "catering",
      primaryCategory: "catering_service",
      categories: ["catering_service"],
      location: "Ormoc City",
      serviceAreas: ["Ormoc City"],
      eventTypes: ["wedding"],
      operatingDays: ["sunday"],
      bookingLeadTimeDays: 7,
      minimumGuests: 50,
      maximumGuests: 150,
      logoUrl: null,
      coverImageUrl: null,
      approvalLabel: "Approved",
    },
    customization: {foods: [], decorations: [], furniture: [], services: []},
  };
}

function serviceFixtures(): PublicEventService[] {
  return [{
    id: "addon_photo_12345678",
    providerId: ADDON_PROVIDER_ID,
    providerName: "Photo Studio",
    name: "Event photography",
    description: "Photo coverage",
    category: "photographer",
    price: 25_000,
    imageUrl: null,
    source: "feasta_addon_provider",
  }];
}

function available(providerId: string) {
  return {
    providerId,
    available: true,
    reasonCode: null,
    message: "Available for your selected event.",
  } as const;
}
