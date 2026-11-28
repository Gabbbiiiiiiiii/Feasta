import {readFileSync} from "node:fs";
import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import ProviderLoading from "@/app/provider/loading";
import ProviderError from "@/app/provider/error";
import ProviderDashboardLoading from "@/app/provider/provider-dashboard-loading";

describe("provider route boundaries", () => {
  it("keeps the shared provider fallback generic while loading", () => {
    render(<ProviderLoading />);
    expect(screen.getByRole("status", {name: "Loading provider workspace"})).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("New Requests")).not.toBeInTheDocument();
  });

  it("keeps dashboard skeletons local to the dashboard", () => {
    render(<ProviderDashboardLoading />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading provider dashboard")).toHaveAttribute("aria-busy", "true");
    const page = readFileSync("src/app/provider/page.tsx", "utf8");
    expect(page).toContain("<Suspense fallback={<ProviderDashboardLoading />}");
  });

  it("renders failures as provider-page errors and retries", () => {
    const reset = vi.fn();
    render(<ProviderError reset={reset} />);
    expect(screen.getByText("This provider page could not be loaded. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/your dashboard/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("returns from documents to consent using a fresh server navigation", () => {
    const actions = readFileSync("src/app/provider/verification/provider-verification-actions.tsx", "utf8");
    expect(actions).toMatch(/window\.location\.assign\(\s*"\/provider\/onboarding\/consent",?\s*\)/);
  });
});
