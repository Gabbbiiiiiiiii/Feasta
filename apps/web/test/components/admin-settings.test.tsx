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

    expect(
      screen.queryByLabelText("Timezone"),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByLabelText("Currency"),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["Platform name", "FEASTA Leyte"],
    ["Operating city", "Tacloban City"],
    ["Support email", "help@feasta.ph"],
    [
      "Service-area description",
      "FEASTA supports verified event services across Leyte.",
    ],
    [
      "Internal reason",
      "Update the public platform configuration.",
    ],
  ])(
    "changes %s without crashing",
    (label, value) => {
      render(
        <AdminSettingsClient
          initialSettings={initialSettings}
        />,
      );

      const control =
        screen.getByLabelText(
          new RegExp(`^${label}`, "u"),
        );

      expect(() => {
        fireEvent.change(control, {
          target: {value},
        });
      }).not.toThrow();

      expect(control).toHaveValue(value);
    },
  );

  it("supports multiple sequential field edits and enables dirty controls", () => {
    render(
      <AdminSettingsClient
        initialSettings={initialSettings}
      />,
    );

    const changes = [
      ["Platform name", "FEASTA Leyte"],
      ["Operating city", "Tacloban City"],
      ["Support email", "help@feasta.ph"],
      [
        "Service-area description",
        "FEASTA supports verified event services across Leyte.",
      ],
      [
        "Internal reason",
        "Update the public platform configuration.",
      ],
    ] as const;

    for (const [label, value] of changes) {
      fireEvent.change(
        screen.getByLabelText(
          new RegExp(`^${label}`, "u"),
        ),
        {target: {value}},
      );
    }

    for (const [label, value] of changes) {
      expect(
        screen.getByLabelText(
          new RegExp(`^${label}`, "u"),
        ),
      ).toHaveValue(value);
    }

    expect(
      screen.getByRole("button", {
        name: "Discard changes",
      }),
    ).toBeEnabled();

    expect(
      screen.getByRole("button", {
        name: "Save settings",
      }),
    ).toBeEnabled();

    expect(
      screen.getByText("53/500"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/41\/1000/iu),
    ).toBeInTheDocument();
  });

  it("discards edits and restores every persisted value", () => {
    render(
      <AdminSettingsClient
        initialSettings={initialSettings}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Platform name"),
      {target: {value: "FEASTA Leyte"}},
    );
    fireEvent.change(
      screen.getByLabelText("Operating city"),
      {target: {value: "Tacloban City"}},
    );
    fireEvent.change(
      screen.getByLabelText(/^Support email/u),
      {target: {value: "help@feasta.ph"}},
    );
    fireEvent.change(
      screen.getByLabelText(
        /^Service-area description/u,
      ),
      {target: {value: "Updated service area description."}},
    );
    fireEvent.change(
      screen.getByLabelText("Internal reason"),
      {target: {value: "Administrative QA update reason."}},
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Discard changes",
      }),
    );

    expect(screen.getByLabelText("Platform name"))
      .toHaveValue(initialSettings.platformName);
    expect(screen.getByLabelText("Operating city"))
      .toHaveValue(initialSettings.operatingCity);
    expect(screen.getByLabelText(/^Support email/u))
      .toHaveValue(initialSettings.supportEmail);
    expect(screen.getByLabelText(
      /^Service-area description/u,
    ))
      .toHaveValue(initialSettings.serviceAreaDescription);
    expect(screen.getByLabelText("Internal reason"))
      .toHaveValue("");
    expect(screen.getByRole("button", {name: "Discard changes"}))
      .toBeDisabled();
    expect(screen.getByRole("button", {name: "Save settings"}))
      .toBeDisabled();
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

    const submitted = vi.mocked(
      updateAdminPlatformSettingsAction,
    ).mock.calls[0]?.[0];

    expect(submitted).not.toHaveProperty(
      "timezone",
    );
    expect(submitted).not.toHaveProperty(
      "currencyCode",
    );
    expect(submitted).not.toHaveProperty(
      "schemaVersion",
    );
    expect(submitted).not.toHaveProperty(
      "isPublic",
    );

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
