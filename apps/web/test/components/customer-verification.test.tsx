import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  email: "customer@example.test" as string | null,
  resend: vi.fn(),
  refreshVerification: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({replace: mocks.replace, refresh: mocks.refresh}),
}));
vi.mock("@/lib/auth/client-session", () => ({
  currentUserEmail: () => mocks.email,
  resendCurrentUserVerification: mocks.resend,
  refreshCurrentUserVerification: mocks.refreshVerification,
  logoutWebSession: mocks.logout,
}));

import VerifyEmailPage from "@/app/verify-email/page";

describe("customer email verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.email = "customer@example.test";
  });

  it("masks the destination, resends, and starts a cooldown", async () => {
    const user = userEvent.setup();
    mocks.resend.mockResolvedValueOnce(undefined);
    render(<VerifyEmailPage />);
    expect(screen.getByText(/cu.+@example\.test/u)).not.toHaveTextContent(
      "customer@example.test",
    );
    await user.click(screen.getByRole("button", {name: /resend verification/i}));
    expect(await screen.findByRole("status")).toHaveTextContent("has been sent");
    expect(screen.getByRole("button", {name: /resend available in/i})).toBeDisabled();
  });

  it("refreshes the ID token session and routes to the approved destination", async () => {
    const user = userEvent.setup();
    mocks.refreshVerification.mockResolvedValueOnce({
      verified: true,
      destination: "/customer/bookings",
    });
    render(<VerifyEmailPage />);
    await user.click(screen.getByRole("button", {name: /I have verified/i}));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/customer/bookings"));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("offers a safe sign-in recovery when client authentication expired", () => {
    mocks.email = null;
    render(<VerifyEmailPage />);
    expect(screen.getByRole("link", {name: /sign in again/i})).toHaveAttribute(
      "href",
      "/login?next=%2Fcustomer",
    );
  });
});
