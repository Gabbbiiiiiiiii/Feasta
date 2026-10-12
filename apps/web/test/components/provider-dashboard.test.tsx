import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({data: vi.fn(), account: vi.fn(), limited: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireProvider: mocks.account, requireProviderIdentityAccess: (account: unknown) => account}));
vi.mock("@/lib/provider/dashboard/provider-dashboard-service", () => ({getProviderDashboardData: mocks.data}));
vi.mock("@/lib/provider/dashboard/limited-provider-dashboard-service", () => ({getLimitedProviderDashboardData: mocks.limited}));
vi.mock("@/components/provider/limited-provider-dashboard", () => ({LimitedProviderDashboard: () => <p>Verify your account</p>}));
import ProviderPage from "@/app/provider/page";
import Loading from "@/app/provider/loading";
import ErrorPage from "@/app/provider/error";
beforeEach(() => {
  mocks.account.mockResolvedValue({emailVerified: true}); mocks.data.mockReset();
  mocks.data.mockResolvedValue({summary: {new: 2, upcoming: 3, payment: 1, completed: 7}, upcomingEvents: [], recentRequests: []});
});
describe("provider dashboard", () => {
  it("renders four real counts with corresponding filtered destinations and clear empty states", async () => {
    render(await ProviderPage());
    const overview = screen.getByRole("region", {name: "Booking overview"});
    expect(within(overview).getAllByRole("link")).toHaveLength(4);
    expect(within(overview).getByRole("link", {name: /New Requests/u})).toHaveAttribute("href", "/provider/requests?dashboard=new");
    expect(within(overview).getByRole("link", {name: /Waiting for Payment/u})).toHaveAttribute("href", "/provider/bookings?status=accepted&dashboard=payment");
    expect(within(overview).getByText("7")).toBeVisible();
    expect(screen.getByText("No upcoming events")).toBeVisible();
    expect(screen.getByText("No booking requests yet")).toBeVisible();
    expect(screen.queryByText(/Booking activity|Published packages|View verification/u)).not.toBeInTheDocument();
  });
  it("renders event details with Manila times and existing drawer links", async () => {
    mocks.data.mockResolvedValue({summary: {new: 1, upcoming: 1, payment: 0, completed: 0},
      upcomingEvents: [{id: "request1", customer: "Maria Santos", event: "wedding", packageName: "Buffet", status: "confirmed", eventAt: "2026-10-10T06:00:00Z"}],
      recentRequests: [{id: "request2", customer: "Juan Cruz", event: "birthday", packageName: null, status: "rejected", eventAt: null}]});
    render(await ProviderPage());
    expect(screen.getByRole("link", {name: /Maria Santos/u})).toHaveAttribute("href", "/provider/bookings?request=request1");
    expect(screen.getByText(/2:00/u)).toBeVisible();
    expect(screen.getByText("Declined")).toBeVisible();
    expect(screen.getByRole("link", {name: /Juan Cruz/u})).toHaveAttribute("href", "/provider/requests?request=request2");
  });
  it("preserves the limited identity dashboard without querying approved-provider data", async () => {
    mocks.account.mockResolvedValue({emailVerified: false});
    render(await ProviderPage());
    expect(screen.getByText("Verify your account")).toBeVisible();
    expect(mocks.data).not.toHaveBeenCalled();
  });
  it("provides loading placeholders and a working retry action", async () => {
    const view = render(<Loading />);
    expect(screen.getByLabelText("Loading provider dashboard")).toHaveAttribute("aria-busy", "true");
    view.unmount();
    const reset = vi.fn(); render(<ErrorPage reset={reset} />);
    await userEvent.setup().click(screen.getByRole("button", {name: "Try again"}));
    expect(reset).toHaveBeenCalledOnce();
  });
});
