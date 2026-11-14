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
  catalog: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: mocks.refresh}),
}));

vi.mock("@/lib/provider/availability/provider-availability-client", () => ({
  getProviderAvailabilityOccasions: mocks.catalog,
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
  mocks.catalog.mockResolvedValue({revision: 7, items: [{id: "birthday", label: "Birthday"}, {id: "wedding", label: "Wedding"}]});
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
    expect(screen.queryByRole("heading", {name: "Daily Booking Capacity"})).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Event Capacity"})).toBeVisible();
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
    await user.click(screen.getByRole("button", {name: "Add unavailable date"}));

    await waitFor(() => {
      expect(mocks.updateDate).toHaveBeenCalledWith({
        date: "2099-10-20",
        action: "mark_unavailable",
      });
    });
    expect(screen.getByText("October 20, 2099")).toBeVisible();
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
    expect(screen.getByRole("button", {name: "Add unavailable date"})).toBeDisabled();
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

 describe("supported event types", () => {
  it("loads saved IDs, toggles individuals, selects all and clears all", async () => {
    const user = userEvent.setup();
    render(<ProviderAvailabilityClient initialSettings={settings({supportedOccasionIds: ["birthday"]})} />);
    expect(await screen.findByRole("checkbox", {name: "Birthday"})).toBeChecked();
    expect(screen.getByRole("checkbox", {name: "Wedding"})).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", {name: "Birthday"}));
    expect(screen.getByRole("checkbox", {name: "Birthday"})).not.toBeChecked();
    await user.click(screen.getByRole("button", {name: "Select all"}));
    expect(screen.getByRole("checkbox", {name: "Wedding"})).toBeChecked();
    await user.click(screen.getByRole("button", {name: "Deselect all"}));
    expect(screen.getByRole("checkbox", {name: "Birthday"})).not.toBeChecked();
    expect(screen.getByRole("checkbox", {name: "Wedding"})).not.toBeChecked();
  });
  it("saves IDs with concurrency tokens and restores them on reload", async () => {
    const user = userEvent.setup();
    const view = render(<ProviderAvailabilityClient initialSettings={settings()} />);
    await user.click(await screen.findByRole("checkbox", {name: "Wedding"}));
    await user.click(screen.getByRole("button", {name: "Save Availability Settings"}));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      supportedOccasionIds: ["wedding"], expectedSettingsRevision: 0, occasionCatalogRevision: 7,
      operatingDays: ["monday", "tuesday", "wednesday"], minGuestsPerEvent: 20, maxGuestsPerEvent: 150,
    })));
    view.unmount();
    render(<ProviderAvailabilityClient initialSettings={settings({supportedOccasionIds: ["wedding"], availabilitySettingsRevision: 1})} />);
    expect(await screen.findByRole("checkbox", {name: "Wedding"})).toBeChecked();
  });
  it("preserves selected IDs on a failed or stale save", async () => {
    mocks.updateSettings.mockRejectedValueOnce(new Error("Event types changed. Reload and review your selections before saving."));
    const user = userEvent.setup();
    render(<ProviderAvailabilityClient initialSettings={settings()} />);
    await user.click(await screen.findByRole("checkbox", {name: "Birthday"}));
    await user.click(screen.getByRole("button", {name: "Save Availability Settings"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Event types changed");
    expect(screen.getByRole("checkbox", {name: "Birthday"})).toBeChecked();
    expect(screen.getByRole("button", {name: "Save Availability Settings"})).toBeEnabled();
  });
  it("shows an empty catalog without selecting defaults", async () => {
    mocks.catalog.mockResolvedValueOnce({revision: 8, items: []});
    render(<ProviderAvailabilityClient initialSettings={settings()} />);
    expect(await screen.findByText(/No approved event types/)).toBeVisible();
    expect(screen.getByRole("button", {name: "Select all"})).toBeDisabled();
  });
  it("reports loading failures and permits retry", async () => {
    mocks.catalog.mockRejectedValueOnce(new Error("Event types unavailable"));
    const user = userEvent.setup();
    render(<ProviderAvailabilityClient initialSettings={settings()} />);
    await user.click(await screen.findByRole("button", {name: "Retry event types"}));
    expect(await screen.findByRole("checkbox", {name: "Birthday"})).not.toBeChecked();
  });
  it("requires explicit removal of saved types that became ineligible", async () => {
    const user = userEvent.setup();
    render(<ProviderAvailabilityClient initialSettings={settings({supportedOccasionIds: ["retired"]})} />);
    await user.click(await screen.findByRole("button", {name: "Remove unavailable event types"}));
    expect(screen.queryByText(/Some saved event types/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Save Availability Settings"})).toBeEnabled();
  });
});

it("preserves event selections when saving schedule edits during a catalog failure", async () => {
  mocks.catalog.mockRejectedValueOnce(new Error("Event types unavailable"));
  const user = userEvent.setup();
  render(<ProviderAvailabilityClient initialSettings={settings({supportedOccasionIds: ["birthday"]})} />);
  await screen.findByRole("button", {name: "Retry event types"});
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
  await user.click(await screen.findByRole("checkbox", {name: "Birthday"}));
  const save = screen.getByRole("button", {name: "Save Availability Settings"});
  fireEvent.click(save);
  fireEvent.click(save);
  expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("checkbox", {name: "Birthday"})).toBeDisabled();
  await act(async () => finish(successfulSettingsResult(mocks.updateSettings.mock.calls[0][0])));
  expect(screen.getByRole("checkbox", {name: "Birthday"})).toBeChecked();
  expect(screen.getByRole("button", {name: "Save Availability Settings"})).toBeDisabled();
});
