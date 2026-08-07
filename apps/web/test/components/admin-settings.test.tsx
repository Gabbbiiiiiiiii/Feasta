import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  updateAdminPlatformSettingsAction,
} from "@/app/admin/settings/actions";
import {
  AdminSettingsClient,
} from "@/components/admin/settings/admin-settings-client";
import type {
  AdminPlatformSettings,
} from "@/lib/admin/settings/admin-settings-types";

vi.mock(
  "@/app/admin/settings/actions",
  () => ({
    updateAdminPlatformSettingsAction:
      vi.fn(),
  }),
);

const initialSettings: AdminPlatformSettings = {
  platformName: "FEASTA",
  operatingCity: "Ormoc City",
  supportEmail: "support@feasta.ph",
  serviceAreaDescription:
    "FEASTA serves customers and verified event service providers in Ormoc City.",
  timezone: "Asia/Manila",
  currencyCode: "PHP",
  schemaVersion: 1,
  isPublic: true,
  updatedAt: null,
  updatedBy: null,
};

describe("Admin platform settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders editable and canonical settings", () => {
    render(
      <AdminSettingsClient
        initialSettings={initialSettings}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Platform Settings",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Platform name"),
    ).toHaveValue("FEASTA");

    expect(
      screen.getByLabelText("Operating city"),
    ).toHaveValue("Ormoc City");

    expect(
      screen.getByText("Asia/Manila"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("PHP"),
    ).toBeInTheDocument();
  });

  it("requires a change and an internal reason", () => {
    render(
      <AdminSettingsClient
        initialSettings={initialSettings}
      />,
    );

    const saveButton = screen.getByRole(
      "button",
      {
        name: "Save settings",
      },
    );

    expect(saveButton).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText("Platform name"),
      {
        target: {
          value: "FEASTA Ormoc",
        },
      },
    );

    expect(saveButton).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText(
        "Internal reason",
      ),
      {
        target: {
          value:
            "Align the public platform identity.",
        },
      },
    );

    expect(saveButton).toBeEnabled();
  });

  it("submits an authorized settings update", async () => {
    vi.mocked(
      updateAdminPlatformSettingsAction,
    ).mockResolvedValue({
      changed: true,
      settings: {
        ...initialSettings,
        platformName: "FEASTA Ormoc",
        updatedAt:
          "2026-08-07T04:00:00.000Z",
        updatedBy: "admin-1",
      },
    });

    render(
      <AdminSettingsClient
        initialSettings={initialSettings}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Platform name"),
      {
        target: {
          value: "FEASTA Ormoc",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(
        "Internal reason",
      ),
      {
        target: {
          value:
            "Align the public platform identity.",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save settings",
      }),
    );

    await waitFor(() => {
      expect(
        updateAdminPlatformSettingsAction,
      ).toHaveBeenCalledWith({
        platformName: "FEASTA Ormoc",
        operatingCity: "Ormoc City",
        supportEmail: "support@feasta.ph",
        serviceAreaDescription:
          initialSettings.serviceAreaDescription,
        internalReason:
          "Align the public platform identity.",
      });
    });

    expect(
      await screen.findByText(
        "Platform settings were updated successfully.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(
        "Internal reason",
      ),
    ).toHaveValue("");
  });
});