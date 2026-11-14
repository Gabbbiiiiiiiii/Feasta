import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {assertHydration} from "../helpers/assert-hydration";

import type {
  PublicEventService,
  PublicPackageDetail,
} from "@/lib/customer/discovery/marketplace-types";
import type {CustomerProviderAvailability} from "@/lib/customer/bookings/customer-provider-availability-client";

const mocks = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
  loadCalendar: vi.fn(async (_providerId: string, month: string) => ({month, dates: []})),
  replace: vi.fn(),
  submitBooking: vi.fn(),
  loadRefundPolicies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({replace: mocks.replace}),
}));

vi.mock(
  "@/lib/customer/bookings/customer-provider-availability-client",
  () => ({
    checkCustomerProviderAvailability: mocks.checkAvailability,
    getCustomerProviderCalendarAvailability: mocks.loadCalendar,
  }),
);

vi.mock(
  "@/lib/customer/bookings/customer-booking-submission-client",
  () => ({
    submitCustomerBookingRequest: mocks.submitBooking,
    bookingSubmissionRequiresRefundPolicyRefresh: () => false,
  }),
);

vi.mock(
  "@/lib/customer/bookings/customer-refund-policy-client",
  () => ({
    getCustomerBookingRefundPolicyDisclosures: mocks.loadRefundPolicies,
    buildRefundPolicyAcknowledgements: (policies: Array<{providerId: string; effectivePolicyKey: string}>) =>
      policies.map(({providerId, effectivePolicyKey}) => ({providerId, effectivePolicyKey})),
  }),
);

import {EventCustomizationExperience} from "@/components/customer/bookings/event-customization-experience";

const PRIMARY_PROVIDER_ID = "provider_primary_12345678";
const ADDON_PROVIDER_ID = "provider_photo_12345678";

describe("customer provider availability planning", () => {
  it("hydrates the booking calendar trigger across Manila midnight", async () => {
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-08-27T15:59:59Z"));
    try {
      await assertHydration(<EventCustomizationExperience detail={detailFixture()} eventServices={serviceFixtures()} />, (container) => {
        expect(within(container).getByRole("button", {name: "Event date"})).toHaveAttribute("aria-haspopup", "dialog");
        vi.setSystemTime(new Date("2026-08-27T16:00:01Z"));
      }, (container) => {
        expect(within(container).getByRole("button", {name: "Event date"})).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(within(container).getByRole("button", {name: "Event date"}));
        // After Manila midnight, the new current date is unavailable; the next
        // day remains disabled until calendar availability has actually loaded.
        expect(screen.getByRole("button", {name: "August 28, 2026, Unavailable"})).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("button", {name: "August 29, 2026, Availability unknown"})).toHaveAttribute("aria-disabled", "true");
      });
    } finally {
      vi.useRealTimers();
    }
  });
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    mocks.loadCalendar.mockImplementation(async (_providerId: string, month: string) => ({month, dates: []}));
    vi.useRealTimers();
    vi.setSystemTime(new Date("2026-08-27T04:00:00.000Z"));
    mocks.checkAvailability.mockResolvedValue(availableResults());
    mocks.loadRefundPolicies.mockResolvedValue({
      acknowledgementsRequired: true,
      policies: [],
    });
  });

  it("renders accessible schedule fields and batches a valid precheck", async () => {
    renderExperience();

    expect(screen.getByRole("button", {name: "Event date"})).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByLabelText("Start time")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("End time")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText(/^Number of guests/iu)).toHaveAttribute("type", "number");

    await fillAvailabilityFields("2026-09-10");

    await waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalledTimes(1));
    expect(mocks.checkAvailability).toHaveBeenCalledWith({
      packageId: "package_wedding_12345678",
      addonIds: ["addon_photo_12345678"],
      eventDate: "2026-09-10",
      eventTime: "18:00",
      eventEndTime: "22:00",
      guestCount: 100,
    }, [PRIMARY_PROVIDER_ID, ADDON_PROVIDER_ID]);
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();
    expect(screen.getByText("Available for your selected event.")).toBeVisible();
  });

  it("prefills marketplace event context and still runs the CW1D-A revalidation", async () => {
    renderExperience({
      eventDate: "2026-09-10",
      eventTime: "18:00",
      eventEndTime: "22:00",
      guestCount: 100,
      serviceType: "catering",
    });

    expect(screen.getByRole("button", {name: "Event date: September 10, 2026"})).toBeVisible();
    expect(screen.getByLabelText("Start time")).toHaveValue("18:00");
    expect(screen.getByLabelText("End time")).toHaveValue("22:00");
    expect(screen.getByLabelText(/^Number of guests/iu)).toHaveValue(100);
    await waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalledTimes(1));
    expect(mocks.checkAvailability).toHaveBeenCalledWith(expect.objectContaining({
      packageId: "package_wedding_12345678",
      eventDate: "2026-09-10",
      eventTime: "18:00",
      eventEndTime: "22:00",
      guestCount: 100,
    }), [PRIMARY_PROVIDER_ID, ADDON_PROVIDER_ID]);
  });

  it("invalidates a prior result immediately when event inputs change", async () => {
    renderExperience();
    await fillAvailabilityFields("2026-09-10");
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();

    await chooseEventDate("2026-09-11");

    expect(screen.queryByText("Maria's Catering is available")).not.toBeInTheDocument();
    expect(screen.getByText(/Checking provider availability/iu)).toBeVisible();
    await waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalledTimes(2));
  });

  it("does not let an older response overwrite a newer event check", async () => {
    const first = deferredAvailability();
    const second = deferredAvailability();
    mocks.checkAvailability
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderExperience();
    await fillAvailabilityFields("2026-09-10");
    await waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalledTimes(1));

    await chooseEventDate("2026-09-11");
    await waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalledTimes(2));

    await act(async () => second.resolve(availableResults()));
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();

    await act(async () => first.resolve(unavailableResults(
      "LEAD_TIME_NOT_MET",
      "Requires booking at least 14 days in advance.",
    )));
    expect(screen.getByText("Maria's Catering is available")).toBeVisible();
    expect(screen.queryByText(/14 days/iu)).not.toBeInTheDocument();
  });

  it("ignores a pending response after unmount", async () => {
    const pending = deferredAvailability();
    mocks.checkAvailability.mockReturnValueOnce(pending.promise);
    const view = renderExperience();
    await fillAvailabilityFields("2026-09-10");
    await waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalledTimes(1));

    view.unmount();
    await act(async () => pending.resolve(availableResults()));

    expect(screen.queryByText("Maria's Catering is available")).not.toBeInTheDocument();
  });

  it.each([
    ["LEAD_TIME_NOT_MET", "Requires booking at least 14 days in advance."],
    ["BLOCKED_DATE", "Not available on this date."],
    ["TIME_CONFLICT", "Not available during the selected time."],
    ["GUEST_CAPACITY_EXCEEDED", "Guest count exceeds this provider's supported capacity."],
  ] as const)("shows customer-safe %s feedback and blocks progress", async (reasonCode, message) => {
    mocks.checkAvailability.mockResolvedValueOnce(
      unavailableResults(reasonCode, message),
    );
    renderExperience();
    await fillAvailabilityFields("2026-09-10");

    expect(await screen.findByText("Maria's Catering is unavailable")).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Event details"})).toBeVisible();
    expect(document.body.textContent).not.toMatch(/booking_private|owner_private|provider_primary_12345678/u);
  });

  it("keeps available services selectable and blocks unavailable new selections", async () => {
    mocks.checkAvailability.mockResolvedValueOnce([
      availableResult(PRIMARY_PROVIDER_ID),
      {
        providerId: ADDON_PROVIDER_ID,
        available: false,
        reasonCode: "TIME_CONFLICT",
        message: "Not available during the selected time.",
      },
    ]);
    renderExperience();
    await fillAvailabilityFields("2026-09-10");
    await screen.findByText("Maria's Catering is available");
    goToEventServices();

    const serviceCard = screen.getByText("Event photography").closest("label");
    expect(serviceCard).not.toBeNull();
    const checkbox = within(serviceCard as HTMLElement).getByRole("checkbox");
    expect(checkbox).toBeDisabled();
    expect(within(serviceCard as HTMLElement).getByText(
      "Not available during the selected time.",
    )).toBeVisible();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("flags, retains, and lets the customer remove a selected provider that becomes unavailable", async () => {
    mocks.checkAvailability
      .mockResolvedValueOnce(availableResults())
      .mockResolvedValueOnce([
        availableResult(PRIMARY_PROVIDER_ID),
        {
          providerId: ADDON_PROVIDER_ID,
          available: false,
          reasonCode: "BLOCKED_DATE",
          message: "Not available on this date.",
        },
      ]);
    renderExperience();
    await fillAvailabilityFields("2026-09-10");
    await screen.findByText("Maria's Catering is available");
    goToEventServices();

    const firstCard = screen.getByText("Event photography").closest("label");
    expect(firstCard).not.toBeNull();
    fireEvent.click(within(firstCard as HTMLElement).getByRole("checkbox"));
    expect(within(firstCard as HTMLElement).getByRole("checkbox")).toBeChecked();

    fireEvent.click(screen.getByRole("button", {name: "Back"}));
    fireEvent.click(screen.getByRole("button", {name: "Back"}));
    await chooseEventDate("2026-09-11");
    await waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalledTimes(2));
    await screen.findByText("Maria's Catering is available");
    goToEventServices();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Photo Studio is no longer available",
    );
    const updatedCard = screen.getByRole("heading", {name: "Event photography"}).closest("label");
    expect(updatedCard).not.toBeNull();
    const selectedCheckbox = within(updatedCard as HTMLElement).getByRole("checkbox");
    expect(selectedCheckbox).toBeChecked();
    expect(selectedCheckbox).toBeEnabled();
    expect(updatedCard).toHaveTextContent("Selected, but no longer available");
    fireEvent.click(selectedCheckbox);
    expect(selectedCheckbox).not.toBeChecked();
  });

  it("renders a retryable error without issuing requests for incomplete inputs", async () => {
    mocks.checkAvailability.mockRejectedValueOnce(
      new Error("Provider availability could not be checked. Please try again."),
    ).mockResolvedValueOnce(availableResults());
    renderExperience();

    await chooseEventDate("2026-09-10");
    expect(mocks.checkAvailability).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Start time"), {target: {value: "18:00"}});
    fireEvent.change(screen.getByLabelText("End time"), {target: {value: "22:00"}});
    fireEvent.change(screen.getByLabelText(/^Number of guests/iu), {target: {value: "100"}});

    await waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert", {}, {timeout: 3_000})).toHaveTextContent(
      "Provider availability could not be checked",
    );
    fireEvent.click(screen.getByRole("button", {name: "Try again"}));
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();
    expect(mocks.checkAvailability).toHaveBeenCalledTimes(2);
  });
  it("hides Browse More Services when only one service is loaded", async () => {
    renderExperience();
    await fillAvailabilityFields("2026-09-10");
    await screen.findByText("Maria's Catering is available");
    goToEventServices();

    expect(screen.queryByRole("button", {name: "Browse More Services"}))
      .not.toBeInTheDocument();
  });

  it("browses five loaded services in a searchable modal and preserves selections", async () => {
    const base = serviceFixtures()[0]!;
    const services: PublicEventService[] = [
      base,
      {...base, id: "addon_video_12345678", name: "Event videography", price: 12_000},
      {...base, id: "addon_style_12345678", name: "Event styling", price: 8_000},
      {...base, id: "addon_booth_12345678", name: "Photo booth", price: 6_000},
      {...base, id: "addon_sound_12345678", name: "Sound system", price: 9_000},
    ];

    render(
      <EventCustomizationExperience
        detail={detailFixture()}
        eventServices={services}
      />,
    );

    await fillAvailabilityFields("2026-09-10");
    await screen.findByText("Maria's Catering is available");
    goToEventServices();

    const browse = screen.getByRole("button", {name: "Browse More Services"});
    expect(browse).toBeVisible();

    const visibleCards = services.filter((service) =>
      screen.queryByRole("heading", {name: service.name}) !== null
    );
    expect(visibleCards).toHaveLength(4);

    fireEvent.click(browse);

    const dialog = await screen.findByRole("dialog", {
      name: "Browse FEASTA Event Services",
    });

    expect(within(dialog).getByRole("searchbox", {name: "Search services"}))
      .toBeVisible();

    fireEvent.change(
      within(dialog).getByRole("searchbox", {name: "Search services"}),
      {target: {value: "Event videography"}},
    );

    const card = within(dialog)
      .getByRole("heading", {name: "Event videography"})
      .closest("label");

    expect(card).not.toBeNull();

    expect(within(dialog).queryByRole("heading", {name: "Photo booth"}))
      .not.toBeInTheDocument();

    fireEvent.click(within(card as HTMLElement).getByRole("checkbox"));

    expect(within(card as HTMLElement).getByRole("checkbox"))
      .toBeChecked();

    expect(within(dialog).getByText("1 optional service selected"))
      .toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", {name: "Done"}));

    expect(screen.queryByRole("dialog", {name: "Browse FEASTA Event Services"}))
      .not.toBeInTheDocument();

    const summary = screen.getByRole("region", {
      name: "Selected optional services",
    });

    expect(within(summary).getByText("Event videography")).toBeVisible();
    expect(within(summary).getByText("1 optional service")).toBeVisible();

    fireEvent.click(screen.getByRole("button", {name: "Browse More Services"}));

    const reopened = await screen.findByRole("dialog", {
      name: "Browse FEASTA Event Services",
    });

    expect(within(reopened).getByRole("heading", {name: "Photo booth"}))
      .toBeVisible();

    const selectedCard = within(reopened)
      .getByRole("heading", {name: "Event videography"})
      .closest("label");

    expect(within(selectedCard as HTMLElement).getByRole("checkbox"))
      .toBeChecked();

    fireEvent.click(within(reopened).getByRole("button", {name: "Close"}));

    fireEvent.click(
      within(summary).getByRole("button", {
        name: "Remove Event videography from Photo Studio",
      }),
    );

    expect(within(summary).getByText("0 optional services")).toBeVisible();
    expect(within(summary).queryByText("Event videography"))
      .not.toBeInTheDocument();
  });
});

function renderExperience(initialEventContext?: {
  eventDate: string;
  eventTime: string;
  eventEndTime: string;
  guestCount: number;
  serviceType: "catering";
}) {
  return render(
    <EventCustomizationExperience
      detail={detailFixture()}
      eventServices={serviceFixtures()}
      initialEventContext={initialEventContext}
    />,
  );
}

async function fillAvailabilityFields(eventDate: string) {
  await chooseEventDate(eventDate);
  fireEvent.change(screen.getByLabelText("Start time"), {target: {value: "18:00"}});
  fireEvent.change(screen.getByLabelText("End time"), {target: {value: "22:00"}});
  fireEvent.change(screen.getByLabelText(/^Number of guests/iu), {target: {value: "100"}});
  // Wait for the debounced request phase before asserting its rendered result.
  // Deferred-response tests still control resolution independently.
  await waitFor(() => expect(mocks.checkAvailability).toHaveBeenCalled());
}

async function chooseEventDate(value: string) {
  fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  // The empty picker starts in August; previously selected dates open September.
  if (screen.getByRole("button", {name: "Previous month"}).hasAttribute("disabled")) {
    fireEvent.click(screen.getByRole("button", {name: "Next month"}));
  }
  const day = Number(value.slice(-2));
  fireEvent.click(await screen.findByRole("button", {name: `September ${day}, 2026, Available`}));
}

function goToEventServices() {
  fireEvent.change(screen.getByLabelText(/^Complete event address/iu), {
    target: {value: "Grand Ballroom, Ormoc City"},
  });
  fireEvent.click(screen.getByRole("button", {name: "Continue"}));
  expect(screen.getByRole("heading", {name: "Customize your package"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Continue"}));
  expect(screen.getByRole("heading", {name: "Add event services"})).toBeVisible();
}

function detailFixture(): PublicPackageDetail {
  return {
    packageRecord: {
      id: "package_wedding_12345678",
      providerId: PRIMARY_PROVIDER_ID,
      providerName: "Maria's Catering",
      name: "Wedding celebration",
      description: "A complete celebration package.",
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
      operatingDays: ["thursday"],
      bookingLeadTimeDays: 7,
      minimumGuests: 50,
      maximumGuests: 150,
      logoUrl: null,
      coverImageUrl: null,
      approvalLabel: "Approved",
    },
    customization: {
      foods: [],
      decorations: [],
      furniture: [],
      services: [],
    },
  };
}

function serviceFixtures(): PublicEventService[] {
  return [{
    id: "addon_photo_12345678",
    providerId: ADDON_PROVIDER_ID,
    providerName: "Photo Studio",
    name: "Event photography",
    description: "Event photo coverage",
    category: "photographer",
    price: 25_000,
    imageUrl: null,
    source: "feasta_addon_provider",
  }];
}

function availableResult(providerId: string) {
  return {
    providerId,
    available: true,
    reasonCode: null,
    message: "Available for your selected event.",
  } as const;
}

function availableResults() {
  return [
    availableResult(PRIMARY_PROVIDER_ID),
    availableResult(ADDON_PROVIDER_ID),
  ];
}

function unavailableResults(
  reasonCode: "LEAD_TIME_NOT_MET" | "BLOCKED_DATE" | "TIME_CONFLICT" | "GUEST_CAPACITY_EXCEEDED",
  message: string,
) {
  return [{
    providerId: PRIMARY_PROVIDER_ID,
    available: false,
    reasonCode,
    message,
  }, availableResult(ADDON_PROVIDER_ID)];
}

function deferredAvailability() {
  let resolve!: (value: readonly CustomerProviderAvailability[]) => void;
  const promise = new Promise<readonly CustomerProviderAvailability[]>((complete) => {
    resolve = complete;
  });

  return {promise, resolve};
}
