import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ProviderResults} from "@/components/customer/providers/provider-results";
import {ProviderPagination} from "@/components/customer/providers/provider-pagination";
import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import type {CustomerProviderAvailability} from "@/lib/customer/bookings/customer-provider-availability-client";
import {provider, filters} from "../fixtures/provider-best-fit";
const mocks = vi.hoisted(() => ({check: vi.fn()}));
vi.mock("@/lib/customer/providers/marketplace-provider-availability-client", () => ({checkMarketplaceProviderAvailability: mocks.check}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/customer/favorites/actions", () => ({setProviderFavoriteAction: vi.fn()}));
const second = {...provider, id: "provider_0002", businessName: "Catering Team", primaryCategory: "catering_service"};
const page = {providers: [provider, second], previousCursor: "previous", nextCursor: "next", pageSize: 12};
const available = (providerId: string, value = true): CustomerProviderAvailability => ({providerId, available: value, reasonCode: value ? null : "LEAD_TIME_NOT_MET", message: value ? "Available for this schedule." : "Booking lead time not met."});
const section = () => screen.getByRole("region", {name: "Best matches on this page"});
const names = () => within(section()).getAllByRole("heading", {level: 3}).map((heading) => heading.textContent);
function deferred() {
  let resolve!: (value: readonly CustomerProviderAvailability[]) => void;
  const promise = new Promise<readonly CustomerProviderAvailability[]>((done) => {resolve = done;});
  return {resolve, promise};
}
beforeEach(() => {vi.clearAllMocks(); mocks.check.mockResolvedValue([available(provider.id), available(second.id)]);});

describe("page-scoped Best Fit UI", () => {
  it("keeps guest matches preliminary, preserves profiles, favorites, budget and cursors without duplicate cards", () => {
    render(<><ProviderResults page={page} filters={filters} /><ProviderPagination page={page} filters={filters} /></>);
    expect(section()).toHaveTextContent("Preliminary matches only. Availability has not been checked.");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(names()).toEqual(["Event Team", "Catering Team"]);
    expect(screen.getAllByText("Matches your selected service")).toHaveLength(2);
    expect(screen.getByRole("link", {name: "Next"})).toHaveAttribute("href", providerDiscoveryHref(filters, "next"));
    expect(screen.getByRole("link", {name: "View Event Team public provider profile"}).getAttribute("href")).toContain("budgetMax%3D15000");
    expect(screen.getByRole("link", {name: /Add Event Team to favorites. Log in required/})).toBeVisible();
    expect(section()).not.toHaveTextContent(/within budget|perfect match/i);
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("ranks server-confirmed availability first, keeps unavailable providers browseable, and excludes their recommendation", async () => {
    const response = deferred();
    mocks.check.mockReturnValueOnce(response.promise);
    render(<ProviderResults page={page} filters={filters} authenticatedCustomer />);
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Checking provider availability", {exact: false})).toBeVisible();
    await act(async () => response.resolve([available(provider.id, false), available(second.id)]));
    await waitFor(() => expect(names()).toEqual(["Catering Team"]));
    expect(within(section()).getByText("Available for your selected schedule")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByLabelText("Unavailable")).toHaveTextContent("Booking lead time not met.");
  });

  it("supports an availability error and retry without retaining old confirmation", async () => {
    mocks.check.mockRejectedValueOnce(new Error("Could not check availability."));
    render(<ProviderResults page={page} filters={filters} authenticatedCustomer />);
    const retry = await screen.findByRole("button", {name: "Retry availability check"});
    expect(within(section()).queryByText("Available for your selected schedule")).not.toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText("Available for your selected schedule")).toHaveLength(2));
  });

  it("ignores stale responses after event changes and removes confirmations immediately on sign-out", async () => {
    const first = deferred(); const next = deferred();
    mocks.check.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    const view = render(<ProviderResults page={page} filters={filters} authenticatedCustomer />);
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    const newer = {...filters, eventContext: {...filters.eventContext!, eventDate: "2099-09-11"}};
    view.rerender(<ProviderResults page={page} filters={newer} authenticatedCustomer />);
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(2));
    await act(async () => next.resolve([available(provider.id), available(second.id)]));
    expect(screen.getAllByText("Available for your selected schedule")).toHaveLength(2);
    await act(async () => first.resolve([available(provider.id, false), available(second.id, false)]));
    expect(screen.queryByLabelText("Unavailable")).not.toBeInTheDocument();
    view.rerender(<ProviderResults page={page} filters={newer} authenticatedCustomer={false} />);
    expect(screen.queryByText("Available for your selected schedule")).not.toBeInTheDocument();
    expect(section()).toHaveTextContent("Preliminary matches only");
  });

  it("shows a truthful no-recommendations state and clears multi-service filters in empty results", () => {
    const incompatible = {...provider, eventTypes: ["wedding"]};
    const view = render(<ProviderResults page={{...page, providers: [incompatible]}} filters={filters} />);
    expect(section()).toHaveTextContent("No supported best-fit matches on this page.");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    view.rerender(<ProviderResults page={{...page, providers: []}} filters={filters} />);
    expect(screen.getByRole("heading", {name: "No providers match those filters."})).toBeVisible();
    expect(screen.getByRole("link", {name: "View all providers"}).getAttribute("href")).not.toContain("categories=");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
