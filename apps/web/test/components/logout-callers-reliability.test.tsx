import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({logout: vi.fn(), replace: vi.fn(), refresh: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({replace: mocks.replace, refresh: mocks.refresh}), useSearchParams: () => new URLSearchParams()}));
vi.mock("@/components/auth/use-current-user-email", () => ({useCurrentUserEmail: () => "test@example.test"}));
vi.mock("@/lib/auth/client-session", () => ({logoutWebSession: mocks.logout, refreshCurrentUserVerification: vi.fn(), resendCurrentUserVerification: vi.fn()}));
vi.mock("@/lib/auth/provider-client", () => ({refreshProviderVerification: vi.fn(), resendProviderVerification: vi.fn()}));
import {LogoutButton} from "@/components/auth/logout-button";
import VerifyEmailPage from "@/app/verify-email/page";
import ProviderVerifyEmailPage from "@/app/provider-verify-email/page";

describe("logout caller recovery", () => {
  beforeEach(() => {vi.resetAllMocks();});
  it("keeps the logout dialog open with an error, then permits successful retry", async () => {
    const user = userEvent.setup();
    mocks.logout.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<LogoutButton />);
    await user.click(screen.getByRole("button", {name: "Sign out"}));
    await user.click(screen.getByRole("button", {name: "Sign out"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out could not be completed");
    expect(mocks.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", {name: "Sign out"}));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/customer/providers"));
  });
  it.each([
    {Page: VerifyEmailPage, button: /Sign out or change account/i},
    {Page: ProviderVerifyEmailPage, button: /Use another account/i},
  ])("handles rejected logout in $Page", async ({Page, button}) => {
    const user = userEvent.setup();
    mocks.logout.mockRejectedValueOnce(new Error("offline"));
    render(<Page />);
    await user.click(screen.getByRole("button", {name: button}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out could not be completed");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name: button})).toBeEnabled();
  });
});
