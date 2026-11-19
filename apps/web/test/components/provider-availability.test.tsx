import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  ProviderAvailabilitySettings,
  UpdateProviderAvailabilitySettingsInput,
} from "@/lib/provider/availability/provider-availability-types";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateDate: vi.fn(),
  updateSettings: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: mocks.refresh}),
}));

vi.mock("@/lib/provider/availability/provider-availability-client", () => ({
  updateProviderAvailability: mocks.updateDate,
  updateProviderAvailabilitySettings: mocks.updateSettings,
}));

vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {
    success: mocks.success,
    error: mocks.error,
  },
}));

import ProviderAvailabilityLoading from "@/app/provider/availability/loading";
import {
  ProviderAvailabilityClient,
} from "@/app/provider/availability/provider-availability-client";

function settings(
  overrides: Partial<ProviderAvailabilitySettings> = {},
): ProviderAvailabilitySettings {
  return {
    providerId: "provider-1",
    providerServiceType: "catering",
    serviceCategories: ["catering_service"],
    operatingDays: ["monday", "tuesday", "wednesday"],
    unavailableDates: ["2099-09-10"],
    bookingLeadTimeDays: 3,
    acceptsMultipleEventsPerDay: false,
    maxEventsPerDay: 1,
    guestCapacity: {minimum: 20, maximum: 150},
    availableStaffCount: 10,
    availableEquipmentCount: 8,
    capacityCapabilities: {
      requiresGuestCapacity: true,
      usesStaffCapacity: true,
      usesEquipmentCapacity: true,
    },
    ...overrides,
  };
}

function successfulSettingsResult(
  input: UpdateProviderAvailabilitySettingsInput,
) {
  return {
    providerId: "provider-1",
    settings: input,
    capacityCapabilities: settings().capacityCapabilities,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateSettings.mockImplementation(async (
    input: UpdateProviderAvailabilitySettingsInput,
  ) => successfulSettingsResult(input));
  mocks.updateDate.mockResolvedValue({
    providerId: "provider-1",
    date: "2099-10-20",
    action: "mark_unavailable",
    unavailableDates: ["2099-09-10", "2099-10-20"],
  });
});

describe("provider availability workspace", () => {
  it("renders the server-loaded settings with one page heading and semantic sections", () => {
    render(<ProviderAvailabilityClient initialSettings={settings()} />);

    expect(screen.getByRole("heading", {
      level: 1,
      name: "Availability & Scheduling",
    })).toBeVisible();
    expect(screen.getByRole("heading", {name: "Operating Days"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Minimum booking notice (days)"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Daily Event Capacity"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Guest Capacity"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Unavailable Dates"})).toBeVisible();
    expect(screen.getByRole("checkbox", {name: "Monday"})).toBeChecked();
    expect(screen.getByRole("spinbutton", {name: /^Minimum booking notice/u})).toHaveValue(3);
    expect(screen.getByText("September 10, 2099")).toBeVisible();
    expect(screen.queryByRole("checkbox", {name: "Accept multiple events per day"})).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Available staff")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Available equipment")).not.toBeInTheDocument();
  });

  it("tracks operating-day and lead-time edits as unsaved changes", async () => {
    const user = userEvent.setup();
    render(<ProviderAvailabilityClient initialSettings={settings()} />);
    const save = screen.getByRole("button", {name: "Save Availability Settings"});

    expect(save).toBeDisabled();
    await user.click(screen.getByRole("checkbox", {name: "Thursday"}));
    expect(save).toBeEnabled();
    expect(screen.getByText("You have unsaved settings changes.")).toBeVisible();

    const leadTime = screen.getByRole("spinbutton", {name: /^Minimum booking notice/u});
    await user.clear(leadTime);
    await user.type(leadTime, "5");
    expect(leadTime).toHaveValue(5);
  });

  it("does not offer multiple daily events, staff, or equipment controls", () => {
    render(<ProviderAvailabilityClient initialSettings={settings()} />);

    expect(screen.queryByRole("checkbox", {
      name: "Accept multiple events per day",
    })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Maximum events per day")).not.toBeInTheDocument();
    expect(screen.queryByText("Daily limit: 1 active event")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Available staff")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Available equipment")).not.toBeInTheDocument();
  });

  it("renders only capacity fields enabled by canonical capabilities", () => {
    const {rerender} = render(
      <ProviderAvailabilityClient initialSettings={settings()} />,
    );

    expect(screen.getByLabelText("Minimum guests")).toBeVisible();
    expect(screen.getByLabelText("Maximum guests")).toBeVisible();
    expect(screen.queryByLabelText("Available staff")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Available equipment")).not.toBeInTheDocument();

    rerender(
      <ProviderAvailabilityClient
        initialSettings={settings({
          providerId: "provider-2",
          serviceCategories: ["event_host_emcee"],
          guestCapacity: null,
          availableEquipmentCount: null,
          capacityCapabilities: {
            requiresGuestCapacity: false,
            usesStaffCapacity: true,
            usesEquipmentCapacity: false,
          },
        })}
      />,
    );

    expect(screen.queryByLabelText("Minimum guests")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Maximum guests")).not.toBeInTheDocument();
    expect(screen.getByText(/do not require additional capacity settings/u)).toBeVisible();
    expect(screen.queryByLabelText("Available staff")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Available equipment")).not.toBeInTheDocument();
  });

  it("saves canonical settings, refreshes data, and resets dirty state", async () => {
    const user = userEvent.setup();
    render(<ProviderAvailabilityClient initialSettings={settings()} />);

    const leadTime = screen.getByRole("spinbutton", {name: /^Minimum booking notice/u});
    await user.clear(leadTime);
    await user.type(leadTime, "7");
    await user.click(screen.getByRole("button", {name: "Save Availability Settings"}));

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingLeadTimeDays: 7,
          operatingDays: ["monday", "tuesday", "wednesday"],
          acceptsMultipleEventsPerDay: false,
          maxEventsPerDay: 1,
          availableStaffCount: 10,
          availableEquipmentCount: 8,
        }),
      );
      expect(mocks.refresh).toHaveBeenCalled();
      expect(mocks.success).toHaveBeenCalledWith("Availability settings saved.");
    });
    expect(screen.getByRole("button", {name: "Save Availability Settings"}))
      .toBeDisabled();
    expect(screen.getByText("All settings changes are saved.")).toBeVisible();
  });

  it("preserves unsaved input and reports a safe settings error", async () => {
    mocks.updateSettings.mockRejectedValueOnce(new Error("The settings are invalid."));
    const user = userEvent.setup();
    render(<ProviderAvailabilityClient initialSettings={settings()} />);

    const leadTime = screen.getByRole("spinbutton", {name: /^Minimum booking notice/u});
    await user.clear(leadTime);
    await user.type(leadTime, "9");
    await user.click(screen.getByRole("button", {name: "Save Availability Settings"}));

    expect(await screen.findByRole("alert")).toHaveTextContent("The settings are invalid.");
    expect(leadTime).toHaveValue(9);
    expect(screen.getByRole("button", {name: "Save Availability Settings"}))
      .toBeEnabled();
  });

  it("adds an unavailable date through the canonical callable", async () => {
    const user = userEvent.setup();
    render(<ProviderAvailabilityClient initialSettings={settings()} />);

    fireEvent.change(screen.getByLabelText("Date to make unavailable"), {
      target: {value: "2099-10-20"},
    });
    mocks.updateDate.mockResolvedValueOnce({
      date: "2099-10-20", action: "mark_unavailable", providerId: "provider-1",
      unavailableDates: ["2099-09-10", "2099-10-20"],
      unavailableDateReasons: {"2099-10-20": "Maintenance"},
    });
    await user.type(screen.getByLabelText("Reason (optional)"), "Maintenance");
    await user.click(screen.getByRole("button", {name: "Block date"}));

    await waitFor(() => {
      expect(mocks.updateDate).toHaveBeenCalledWith({
        date: "2099-10-20",
        action: "mark_unavailable",
        reason: "Maintenance",
      });
    });
    expect(screen.getByText("October 20, 2099")).toBeVisible();
    expect(screen.getByText("Blocked · Maintenance")).toBeVisible();
    expect(screen.getByRole("heading", {name: "Blocked dates (2)"})).toBeVisible();
  });

  it("removes a future unavailable date through the canonical callable", async () => {
    mocks.updateDate.mockResolvedValueOnce({
      providerId: "provider-1",
      date: "2099-09-10",
      action: "mark_available",
      unavailableDates: [],
    });
    const user = userEvent.setup();
    render(<ProviderAvailabilityClient initialSettings={settings()} />);

    await user.click(screen.getByRole("button", {
      name: "Make September 10, 2099 available",
    }));

    await waitFor(() => {
      expect(mocks.updateDate).toHaveBeenCalledWith({
        date: "2099-09-10",
        action: "mark_available",
      });
    });
    expect(screen.getByText("No unavailable dates")).toBeVisible();
  });

  it("prevents duplicate unavailable dates without invoking the callable", () => {
    render(<ProviderAvailabilityClient initialSettings={settings()} />);

    fireEvent.change(screen.getByLabelText("Date to make unavailable"), {
      target: {value: "2099-09-10"},
    });

    expect(screen.getByText("This date is already unavailable.")).toBeVisible();
    expect(screen.getByRole("button", {name: "Block date"})).toBeDisabled();
    expect(mocks.updateDate).not.toHaveBeenCalled();
  });

  it("renders an accessible empty and loading state", () => {
    const {unmount} = render(
      <ProviderAvailabilityClient
        initialSettings={settings({unavailableDates: []})}
      />,
    );
    expect(screen.getByText("No unavailable dates")).toBeVisible();
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);

    unmount();
    render(<ProviderAvailabilityLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading availability settings");
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
  });

  it("keeps the settings controls inside labelled, keyboard-operable regions", () => {
    render(<ProviderAvailabilityClient initialSettings={settings()} />);

    const operatingSection = screen.getByRole("heading", {name: "Operating Days"})
      .closest("section");
    expect(operatingSection).toHaveAttribute("aria-labelledby");
    expect(within(operatingSection!).getByRole("group", {
      name: "Select operating days",
    })).toBeVisible();
    expect(screen.getByRole("button", {name: "Save Availability Settings"}))
      .toHaveAttribute("type", "button");
  });
});

it("preserves event selections when saving schedule edits without the event types card", async () => {
  const user = userEvent.setup();
  render(<ProviderAvailabilityClient initialSettings={settings({supportedOccasionIds: ["birthday"]})} />);
  expect(screen.queryByRole("heading", {name: "Supported Event Types"})).not.toBeInTheDocument();
  const notice = screen.getByRole("spinbutton", {name: /^Minimum booking notice/u});
  await user.clear(notice);
  await user.type(notice, "5");
  await user.click(screen.getByRole("button", {name: "Save Availability Settings"}));
  await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
    bookingLeadTimeDays: 5, expectedSettingsRevision: 0,
  })));
  expect(mocks.updateSettings.mock.calls[0][0]).not.toHaveProperty("supportedOccasionIds");
});

it("prevents duplicate settings submissions while preserving pending selections", async () => {
  let finish!: (value: ReturnType<typeof successfulSettingsResult>) => void;
  mocks.updateSettings.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const user = userEvent.setup();
  render(<ProviderAvailabilityClient initialSettings={settings()} />);
  await user.click(screen.getByRole("checkbox", {name: "Thursday"}));
  const save = screen.getByRole("button", {name: "Save Availability Settings"});
  fireEvent.click(save);
  fireEvent.click(save);
  expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("checkbox", {name: "Thursday"})).toBeDisabled();
  await act(async () => finish(successfulSettingsResult(mocks.updateSettings.mock.calls[0][0])));
  expect(screen.getByRole("checkbox", {name: "Thursday"})).toBeChecked();
  expect(screen.getByRole("button", {name: "Save Availability Settings"})).toBeDisabled();
});

it("warns when the proposed limit is below already occupied future slots", async () => {
  render(<ProviderAvailabilityClient initialSettings={settings({
    maxEventsPerDay: 3,
    acceptsMultipleEventsPerDay: true,
    occupiedSlotsByDate: {"2099-01-01": 3},
  })} />);
  fireEvent.change(screen.getByRole("spinbutton", {name: /Maximum events per day/i}), {target: {value: "2"}});
  expect(screen.getByText(/already has 3 occupied slots/i)).toBeVisible();
});


it("saves operating days, notice and capacity together and points day capacity to Calendar", async () => {
  const user = userEvent.setup();
  render(<ProviderAvailabilityClient initialSettings={settings({
    operatingDays: [], unavailableDateReasons: {"2099-09-10": "Maintenance"},
  })} />);
  expect(screen.queryByRole("button", {name: "Save Capacity"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("View capacity for date")).not.toBeInTheDocument();
  const button = screen.getByRole("button", {name: "Save Availability Settings"});
  await user.click(screen.getByRole("checkbox", {name: "Wednesday"}));
  fireEvent.change(screen.getByRole("spinbutton", {name: /^Minimum booking notice/u}), {target: {value: "5"}});
  fireEvent.change(screen.getByRole("spinbutton", {name: /Maximum events per day/i}), {target: {value: "2"}});
  expect(screen.getByText(/Save to apply this daily limit/i)).toBeVisible();
  expect(screen.getByText(/Day-by-day booked and remaining slots stay on Calendar/i)).toBeVisible();
  await user.click(button);
  await waitFor(() => expect(button).toBeDisabled());
  expect(mocks.updateSettings).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    maxEventsPerDay: 2, bookingLeadTimeDays: 5, operatingDays: ["wednesday"], expectedSettingsRevision: 0,
  }));
  expect(screen.getByText(/Day-by-day booked and remaining slots stay on Calendar/i)).toBeVisible();
  expect(screen.queryByText(/Save to apply this daily limit/i)).not.toBeInTheDocument();
});

it("keeps all edits unsaved when the combined settings request fails", async () => {
  const user = userEvent.setup();
  mocks.updateSettings.mockRejectedValueOnce(new Error("Could not persist settings."));
  render(<ProviderAvailabilityClient initialSettings={settings()} />);
  await user.click(screen.getByRole("checkbox", {name: "Friday"}));
  fireEvent.change(screen.getByRole("spinbutton", {name: /Maximum events per day/i}), {target: {value: "2"}});
  const save = screen.getByRole("button", {name: "Save Availability Settings"});
  await user.click(save);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not persist settings.");
  expect(screen.getByRole("checkbox", {name: "Friday"})).toBeChecked();
  expect(screen.getByRole("spinbutton", {name: /Maximum events per day/i})).toHaveValue(2);
  expect(screen.getByText(/Save to apply this daily limit/i)).toBeVisible();
  expect(mocks.success).not.toHaveBeenCalled();
  expect(save).toBeEnabled();
});

it("highlights invalid schedule fields and sends no save request", async () => {
  const user = userEvent.setup();
  render(<ProviderAvailabilityClient initialSettings={settings({operatingDays: []})} />);
  const notice = screen.getByRole("spinbutton", {name: /^Minimum booking notice/u});
  const capacity = screen.getByRole("spinbutton", {name: /Maximum events per day/i});
  fireEvent.change(notice, {target: {value: ""}});
  fireEvent.change(capacity, {target: {value: "2.5"}});
  await user.click(screen.getByRole("button", {name: "Save Availability Settings"}));
  expect(screen.getByText("Select at least one operating day.")).toBeVisible();
  expect(notice).toHaveAccessibleDescription(/whole number from 0 to 365/i);
  expect(capacity).toHaveAccessibleDescription(/whole number from 1 to 100/i);
  expect(mocks.updateSettings).not.toHaveBeenCalled();
});

it("warns before blocking a date with reserved slots", () => {
  render(<ProviderAvailabilityClient initialSettings={settings({occupiedSlotsByDate: {"2099-10-20": 1}})} />);
  fireEvent.change(screen.getByLabelText("Date to make unavailable"), {target: {value: "2099-10-20"}});
  expect(screen.getByText(/confirmed or reserved bookings and cannot be blocked/i)).toBeVisible();
  expect(screen.getByRole("button", {name: "Block date"})).toBeDisabled();
  expect(mocks.updateDate).not.toHaveBeenCalled();
});

it("warns before leaving with unsaved settings", () => {
  render(<ProviderAvailabilityClient initialSettings={settings()} />);
  fireEvent.click(screen.getByRole("checkbox", {name: "Friday"}));
  const leaving = new Event("beforeunload", {cancelable: true});
  window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
});
