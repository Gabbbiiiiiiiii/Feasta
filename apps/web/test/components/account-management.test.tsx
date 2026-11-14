import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updatePreferences: vi.fn(),
  changePassword: vi.fn(),
  requestEmail: vi.fn(),
  deactivate: vi.fn(),
  revokeAll: vi.fn(),
  logout: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({replace: mocks.replace, refresh: mocks.refresh}),
}));
vi.mock("@/lib/auth/account-client", () => ({
  updateAccountProfile: mocks.updateProfile,
  updateAccountPreferences: mocks.updatePreferences,
  changeAccountPassword: mocks.changePassword,
  requestAccountEmailUpdate: mocks.requestEmail,
  deactivateWebAccount: mocks.deactivate,
  revokeAllWebAccountSessions: mocks.revokeAll,
  logoutWebSession: mocks.logout,
}));

import {AccountManagementPanel} from "@/components/account/account-management-panel";
import type {AccountManagementProfile} from "@/lib/auth/account-management";

const baseProfile: AccountManagementProfile = {
  role: "customer",
  email: "customer@feasta.test",
  firstName: "Test",
  lastName: "Customer",
  supportsPasswordChanges: true,
  marketingConsent: false,
  pushNotificationsEnabled: true,
  emailNotificationsEnabled: true,
  termsPolicyVersion: "unversioned",
  privacyPolicyVersion: "unversioned",
  customer: {
    phoneNumber: "+639171234567",
    address: "Old address",
    city: "Ormoc City",
    province: "Leyte",
  },
  provider: null,
};

const providerProfile: AccountManagementProfile = {
  ...baseProfile,
  role: "provider",
  email: "provider@feasta.test",
  customer: null,
  provider: {
    providerId: "provider-one",
    businessName: "FEASTA Catering",
    businessEmail: "business@feasta.test",
    businessPhone: "+639171234567",
    description: "A sufficiently detailed provider description.",
    address: "Provider address",
    city: "Ormoc City",
    province: "Leyte",
    verificationStatus: "approved",
  },
};

describe("shared account management", () => {
  it("shows a rejected logout without navigating away", async () => {
    const user = userEvent.setup();
    mocks.logout.mockRejectedValueOnce(new Error("offline"));
    render(<AccountManagementPanel profile={baseProfile} />);
    await user.click(screen.getByRole("button", {name: "Sign out"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not complete that request");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name: "Sign out"})).toBeEnabled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of [
      mocks.updateProfile,
      mocks.updatePreferences,
      mocks.changePassword,
      mocks.requestEmail,
      mocks.deactivate,
      mocks.revokeAll,
      mocks.logout,
    ]) {
      mock.mockResolvedValue(undefined);
    }
  });

  it.each([false, true])("preserves hidden provider marketing consent (%s)", async (marketingConsent) => {
    const user = userEvent.setup();
    render(<AccountManagementPanel profile={{...providerProfile, marketingConsent}} />);
    expect(screen.getByRole("heading", {name: "Account overview"})).toBeVisible();
    expect(screen.queryByText("Active provider")).not.toBeInTheDocument();
    expect(screen.getByText("Test Customer")).toBeVisible();
    expect(screen.getByText("Provider account")).toBeVisible();
    expect(screen.queryByRole("checkbox", {name: "Marketing messages"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", {name: "Push notifications"}));
    await user.click(screen.getByRole("button", {name: "Save preferences"}));
    await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalledWith({
      marketingConsent,
      pushNotificationsEnabled: false,
      emailNotificationsEnabled: true,
    }));
  });

  it.each(["customer", "admin"] as const)("keeps %s notification and overview presentation", (role) => {
    render(<AccountManagementPanel profile={{...baseProfile, role}} />);
    expect(screen.getByRole("heading", {name: "Account summary"})).toBeVisible();
    expect(screen.getByText(`Active ${role}`)).toBeVisible();
    expect(screen.getByRole("heading", {name: "Privacy and notifications"})).toBeVisible();
    expect(screen.getByRole("checkbox", {name: "Marketing messages"})).toBeVisible();
    expect(screen.queryByText("Danger zone")).not.toBeInTheDocument();
  });

  it.each(["approved", "draft", "resubmission_required"])("saves owner details for %s providers", async (verificationStatus) => {
    const user = userEvent.setup();
    render(<AccountManagementPanel profile={{...providerProfile, provider: {...providerProfile.provider!, verificationStatus}}} />);
    fireEvent.change(screen.getByLabelText(/Owner first name/), {target: {value: "Updated"}});
    await user.click(screen.getByRole("button", {name: "Save profile"}));
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith("provider", expect.objectContaining({ownerFirstName: "Updated", ownerLastName: "Customer"})));
    if (verificationStatus === "approved") {
      expect(screen.queryByLabelText(/^Business name/)).not.toBeInTheDocument();
      expect(screen.getByRole("link", {name: "Manage Business Profile"})).toHaveAttribute("href", "/provider/business-profile");
    } else {
      expect(screen.getByLabelText(/^Business name/)).toBeVisible();
    }
  });

  it("keeps Danger zone collapsed and requires deliberate confirmation", async () => {
    const user = userEvent.setup();
    render(<AccountManagementPanel profile={providerProfile} />);
    const summary = screen.getByText("Danger zone");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Optional reason")).not.toBeVisible();
    summary.focus();
    expect(summary).toHaveFocus();
    await user.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(mocks.deactivate).not.toHaveBeenCalled();
    await user.click(summary);
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(mocks.deactivate).not.toHaveBeenCalled();
    await user.click(summary);
    expect(screen.getByText(/not permanent data deletion/)).toBeVisible();
    await user.type(screen.getByLabelText("Optional reason"), "Closing business");
    await user.type(screen.getByLabelText(/Current password for deactivation/), "Current123!");
    const trigger = screen.getByRole("button", {name: "Deactivate account"});
    await user.click(trigger);
    expect(mocks.deactivate).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Cancel"}));
    expect(trigger).toHaveFocus();
    expect(mocks.deactivate).not.toHaveBeenCalled();
    await user.click(trigger);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Deactivate account"}));
    await waitFor(() => expect(mocks.deactivate).toHaveBeenCalledWith("provider", "Closing business", "Current123!"));
    expect(mocks.replace).toHaveBeenCalledWith("/provider-login");
  });

  it("keeps deactivation failures inside the confirmation dialog", async () => {
    const user = userEvent.setup();
    mocks.deactivate.mockRejectedValueOnce(Object.assign(new Error("Resolve active event obligations first."), {code: "functions/failed-precondition"}));
    render(<AccountManagementPanel profile={{...providerProfile, supportsPasswordChanges: false}} />);
    await user.click(screen.getByText("Danger zone"));
    expect(screen.getByText(/reauthenticate before deactivation/)).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Deactivate account"}));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", {name: "Deactivate account"}));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Resolve active event obligations first.");
    expect(alert).toHaveFocus();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each([true, false])("preserves provider session actions with password support %s", async (supportsPasswordChanges) => {
    const user = userEvent.setup();
    render(<AccountManagementPanel profile={{...providerProfile, supportsPasswordChanges}} />);
    if (supportsPasswordChanges) {
      await user.type(screen.getByLabelText(/Current password for all-session sign out/), "Current123!");
    } else {
      expect(screen.getByText(/managed by your external identity provider/)).toBeVisible();
      expect(screen.queryByRole("button", {name: /Change password/})).not.toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", {name: "Sign out all sessions"}));
    await waitFor(() => expect(mocks.revokeAll).toHaveBeenCalledWith(supportsPasswordChanges ? "Current123!" : ""));
    expect(mocks.replace).toHaveBeenCalledWith("/provider-login");
    await user.click(screen.getByRole("button", {name: "Sign out"}));
    await waitFor(() => expect(mocks.logout).toHaveBeenCalled());
  });

  it("updates only customer presentation fields", async () => {
    const user = userEvent.setup();
    render(<AccountManagementPanel profile={baseProfile} />);
    expect(screen.queryByRole("button", {name: /deactivate account/i}))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Deactivate account"))
      .not.toBeInTheDocument();
    const firstName = screen.getByRole("textbox", {name: /^First name/});
    await user.clear(firstName);
    await user.type(firstName, "Updated");
    await user.click(screen.getByRole("button", {name: /save profile/i}));
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith(
      "customer",
      expect.objectContaining({
        firstName: "Updated",
        lastName: "Customer",
        address: "Old address",
      }),
    ));
    const payload = mocks.updateProfile.mock.calls[0][1];
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("isBlocked");
    expect(payload).not.toHaveProperty("isEmailVerified");
  });

  it("updates provider business fields without approval controls", async () => {
    const user = userEvent.setup();
    const profile: AccountManagementProfile = {
      ...baseProfile,
      role: "provider",
      email: "provider@feasta.test",
      customer: null,
      provider: {
        providerId: "provider-one",
        businessName: "FEASTA Catering",
        businessEmail: "business@feasta.test",
        businessPhone: "+639171234567",
        description: "A sufficiently detailed provider description.",
        address: "Provider address",
        city: "Ormoc City",
        province: "Leyte",
        verificationStatus: "draft",
      },
    };
    render(<AccountManagementPanel profile={profile} />);
    const description = screen.getByRole("textbox", {
      name: /business description/i,
    });
    await user.clear(description);
    await user.type(
      description,
      "Updated business description for provider customers.",
    );
    await user.click(screen.getByRole("button", {name: /save profile/i}));
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith(
      "provider",
      expect.objectContaining({
        businessName: "FEASTA Catering",
        description: "Updated business description for provider customers.",
      }),
    ));
    expect(screen.queryByLabelText(/verification status|is active|featured/i))
      .not.toBeInTheDocument();
  });

  it("separates approved public business editing from owner account settings", () => {
    const profile: AccountManagementProfile = {
      ...baseProfile,
      role: "provider",
      email: "provider@feasta.test",
      customer: null,
      provider: {
        providerId: "provider-one",
        businessName: "FEASTA Catering",
        businessEmail: "business@feasta.test",
        businessPhone: "+639171234567",
        description: "A sufficiently detailed provider description.",
        address: "Provider address",
        city: "Ormoc City",
        province: "Leyte",
        verificationStatus: "approved",
      },
    };
    render(<AccountManagementPanel profile={profile} />);

    expect(screen.getByRole("textbox", {name: /^Owner first name/i})).toBeVisible();
    expect(screen.getByRole("textbox", {name: /^Owner last name/i})).toBeVisible();
    expect(screen.queryByRole("textbox", {name: /^Business phone/i}))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", {name: /^Business description/i}))
      .not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Manage Business Profile"}))
      .toHaveAttribute("href", "/provider/business-profile");
  });

  it("limits admin editing and disallows self-deactivation", () => {
    render(<AccountManagementPanel profile={{
      ...baseProfile,
      role: "admin",
      email: "admin@feasta.test",
      customer: null,
    }} />);
    expect(screen.getByRole("textbox", {name: /^First name/})).toBeVisible();
    expect(screen.getByRole("textbox", {name: /^Last name/})).toBeVisible();
    expect(screen.queryByRole("button", {name: /deactivate account/i}))
      .not.toBeInTheDocument();
    expect(screen.getByText(/cannot deactivate themselves/i)).toBeVisible();
    expect(screen.queryByLabelText(/role|blocked|account status/i))
      .not.toBeInTheDocument();
  });

  it.each([baseProfile, providerProfile])("requires matching password confirmation and supports verified email update for $role", async (profile) => {
    const user = userEvent.setup();
    render(<AccountManagementPanel profile={profile} />);
    const passwordFields = screen.getAllByLabelText(/password/i);
    fireEvent.change(passwordFields[0], {target: {value: "Current123!"}});
    fireEvent.change(passwordFields[1], {target: {value: "NewPassword123!"}});
    fireEvent.change(passwordFields[2], {target: {value: "Different123!"}});
    await user.click(screen.getByRole("button", {
      name: /change password and sign out/i,
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "new passwords do not match",
    );
    expect(mocks.changePassword).not.toHaveBeenCalled();

    fireEvent.change(passwordFields[2], {
      target: {value: "NewPassword123!"},
    });
    await user.click(screen.getByRole("button", {
      name: /change password and sign out/i,
    }));
    await waitFor(() => expect(mocks.changePassword).toHaveBeenCalledWith(
      "Current123!",
      "NewPassword123!",
    ));

    fireEvent.change(
      screen.getByLabelText(/current password for email change/i),
      {target: {value: "Current123!"}},
    );
    fireEvent.change(screen.getByLabelText(/new email address/i), {
      target: {value: "new@feasta.test"},
    });
    await user.click(screen.getByRole("button", {
      name: /send email-change verification/i,
    }));
    await waitFor(() => expect(mocks.requestEmail).toHaveBeenCalledWith(
      "Current123!",
      "new@feasta.test",
    ));
  });

  it("persists preferences and safely explains external-provider credentials", async () => {
    const user = userEvent.setup();
    render(<AccountManagementPanel profile={{
      ...baseProfile,
      supportsPasswordChanges: false,
    }} />);
    expect(screen.getByText(/managed by your external identity provider/i))
      .toBeVisible();
    expect(screen.queryByRole("button", {name: /change password/i}))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", {name: /marketing messages/i}));
    await user.click(screen.getByRole("button", {name: /save preferences/i}));
    await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalledWith({
      marketingConsent: true,
      pushNotificationsEnabled: true,
      emailNotificationsEnabled: true,
    }));
  });
});
