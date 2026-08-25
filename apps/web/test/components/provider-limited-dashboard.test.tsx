import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  resend: vi.fn(),
  check: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/lib/auth/provider-client", () => ({
  resendProviderVerification: mocks.resend,
  refreshProviderVerification: mocks.check,
}));

import {LimitedProviderDashboard} from "@/components/provider/limited-provider-dashboard";

const dashboard = {
  mode: "identity-limited" as const,
  displayName: "Ada Lovelace",
  email: "ada@example.test",
  phoneNumber: "+639171234567",
  emailVerified: false as const,
  phoneVerified: true as const,
  providerIdentityStatus: "identity_created" as const,
  nextAllowedAction: "verify_email" as const,
};

describe("limited provider dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resend.mockResolvedValue(undefined);
    mocks.check.mockResolvedValue({verified: false});
  });

  it("shows only identity-level status and verification actions", () => {
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    expect(screen.getByRole("heading", {
      name: "Verify your email to continue",
    })).toBeVisible();
    expect(screen.getByText("ada@example.test")).toBeVisible();
    expect(screen.getByText("✓ Verified")).toBeVisible();
    expect(screen.getByText("Pending verification")).toBeVisible();
    expect(screen.getByText("✓ Created")).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Resend verification email",
    })).toBeEnabled();
    expect(screen.getByRole("button", {
      name: "I've verified my email",
    })).toBeEnabled();
    expect(screen.queryByText(/booking|payment|package|calendar/i))
      .not.toBeInTheDocument();
  });

  it("resends through the existing protected verification mechanism", async () => {
    const user = userEvent.setup();
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    await user.click(screen.getByRole("button", {
      name: "Resend verification email",
    }));

    await waitFor(() => expect(mocks.resend).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent(
      /new verification email has been sent/i,
    );
  });

  it("does not trust the check button when Firebase remains unverified", async () => {
    const user = userEvent.setup();
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    await user.click(screen.getByRole("button", {
      name: "I've verified my email",
    }));

    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      /still pending verification/i,
    );
  });

  it("navigates only after Firebase and the trusted session confirm verification", async () => {
    const user = userEvent.setup();
    mocks.check.mockResolvedValueOnce({
      verified: true,
      destination: "/provider/onboarding",
    });
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    await user.click(screen.getByRole("button", {
      name: "I've verified my email",
    }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      "/provider/onboarding",
    ));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
