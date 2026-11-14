import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
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
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    expect(screen.getByText(
      /automatically check your verification status when you return/u,
    )).toBeVisible();
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

  it("checks automatically when the window regains focus", async () => {
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    fireEvent.focus(window);

    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/still pending verification/i))
      .not.toBeInTheDocument();
  });

  it("checks automatically when the document becomes visible", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
  });

  it("does not poll or focus-check while the document is hidden", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(60_000));

    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("uses low-frequency visible polling and never resends automatically", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });

    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it("prevents duplicate checks while one verification request is in flight", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    let resolveCheck: ((result: {verified: boolean}) => void) | undefined;
    mocks.check.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCheck = resolve;
    }));
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(20_000));
    expect(mocks.check).toHaveBeenCalledTimes(1);

    await act(async () => resolveCheck?.({verified: false}));
  });

  it("automatically renews and routes after trusted verification succeeds", async () => {
    mocks.check.mockResolvedValueOnce({
      verified: true,
      destination: "/provider/onboarding",
    });
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    fireEvent.focus(window);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      "/provider/onboarding",
    ));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("stops checking after verification succeeds", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    mocks.check.mockResolvedValue({
      verified: true,
      destination: "/provider/onboarding",
    });
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    fireEvent.focus(window);
    await act(async () => Promise.resolve());
    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(40_000));

    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it("keeps the limited dashboard usable after an automatic network failure", async () => {
    mocks.check.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    fireEvent.focus(window);

    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", {
      name: "I've verified my email",
    })).toBeEnabled());
  });

  it("fails a manual invalid-session check safely and keeps recovery actions", async () => {
    const user = userEvent.setup();
    mocks.check.mockRejectedValueOnce(new Error("Please sign in again."));
    render(<LimitedProviderDashboard dashboard={dashboard} />);

    await user.click(screen.getByRole("button", {
      name: "I've verified my email",
    }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {
      name: "I've verified my email",
    })).toBeEnabled();
    expect(screen.getByRole("button", {
      name: "Resend verification email",
    })).toBeEnabled();
  });

  it("cleans up automatic checks on unmount", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const view = render(<LimitedProviderDashboard dashboard={dashboard} />);

    view.unmount();
    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(60_000));

    expect(mocks.check).not.toHaveBeenCalled();
  });
});
