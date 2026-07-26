import {fireEvent, render, screen, waitFor} from "@testing-library/react";
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

describe("shared account management", () => {
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

  it("updates only customer presentation fields", async () => {
    const user = userEvent.setup();
    render(<AccountManagementPanel profile={baseProfile} />);
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

  it("requires matching password confirmation and supports verified email update", async () => {
    const user = userEvent.setup();
    render(<AccountManagementPanel profile={baseProfile} />);
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
