import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
import {EventFinder} from "@/components/customer/layout/event-finder";
import {ProviderEventContextPanel} from "@/components/customer/providers/provider-event-context-panel";
import {parseProviderDiscoveryFilters, providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import {TEST_SERVICE_CATEGORY_OPTIONS} from "../fixtures/service-category-options";
const mocks = vi.hoisted(() => ({push: vi.fn(), replace: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => mocks}));
vi.mock("@/lib/customer/planning/event-venue-client", () => ({searchEventVenues: vi.fn(), getEventVenueDetails: vi.fn()}));
beforeEach(() => vi.clearAllMocks());

it("submits independent categories, clears stale single filters and cursor, and restores URL values", () => {
  const view = render(<EventFinder query="category=photographer&service=addon&cursor=old" onFind={() => {}} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
  fireEvent.click(screen.getByRole("checkbox", {name: "Catering Service"}));
  expect(screen.getByRole("checkbox", {name: "Photography"})).toBeChecked();
  expect(screen.getByRole("checkbox", {name: "Select All"})).not.toBeChecked();
  fireEvent.change(screen.getByLabelText(/Starting budget/), {target: {value: "1000"}});
  fireEvent.change(screen.getByLabelText(/Maximum budget/), {target: {value: "15000"}});
  fireEvent.click(screen.getByRole("button", {name: "Find Services"}));
  const url = new URL(mocks.push.mock.calls[0][0], "https://feasta.test");
  expect(Object.fromEntries(url.searchParams)).toEqual({categories: "catering_service,photographer", budgetMin: "1000", budgetMax: "15000"});
  view.unmount();
  render(<EventFinder query={url.searchParams.toString()} onFind={() => {}} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
  expect(screen.getByRole("checkbox", {name: "Photography"})).toBeChecked();
  expect(screen.getByRole("checkbox", {name: "Catering Service"})).toBeChecked();
  expect(screen.getByLabelText(/Starting budget/)).toHaveValue(1000);
  expect(screen.getByLabelText(/Maximum budget/)).toHaveValue(15000);
});

it("blocks reversed budget input and permits correction", () => {
  render(<EventFinder query="" onFind={() => {}} serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS} />);
  fireEvent.change(screen.getByLabelText(/Starting budget/), {target: {value: "2000"}});
  fireEvent.change(screen.getByLabelText(/Maximum budget/), {target: {value: "1000"}});
  fireEvent.submit(screen.getByRole("search", {name: "Event Finder"}));
  expect(mocks.push).not.toHaveBeenCalled();
  expect((screen.getByLabelText(/Maximum budget/) as HTMLInputElement).validationMessage).toMatch(/Maximum budget/);
  fireEvent.input(screen.getByLabelText(/Maximum budget/), {target: {value: "3000"}});
  fireEvent.submit(screen.getByRole("search", {name: "Event Finder"}));
  expect(mocks.push).toHaveBeenCalledOnce();
});

it.each([[-1, undefined], [Infinity, undefined], [100000001, undefined], [0, 0], [100000000, 100000000]])("validates planning budget %s", (input, expected) => {
  const filters = parseProviderDiscoveryFilters({budgetMin: String(input)}, "");
  expect(filters.planningContext?.budgetMin).toBe(expected);
});

it("displays, edits, and clears budget with event details while preserving category selections", () => {
  const filters = parseProviderDiscoveryFilters({categories: "photographer,catering_service", budgetMin: "1000", budgetMax: "15000", eventType: "birthday"}, "");
  render(<ProviderEventContextPanel filters={filters} />);
  expect(screen.getByText(/Planning budget:/)).toHaveTextContent(/1,000.*15,000/);
  expect(screen.getByLabelText(/Starting budget/)).toHaveValue(1000);
  const form = screen.getByRole("button", {name: "Update details"}).closest("form")!;
  fireEvent.change(screen.getByLabelText(/Maximum budget/), {target: {value: "20000"}});
  const updated = parseProviderDiscoveryFilters(Object.fromEntries(new FormData(form)) as Record<string, string>, "");
  expect(updated.planningContext?.budgetMax).toBe(20000);
  expect(updated.categories).toEqual(filters.categories);
  expect(screen.getByRole("link", {name: "Clear event details"})).toHaveAttribute("href", providerDiscoveryHref({...filters, planningContext: null, eventContext: null}));
});
