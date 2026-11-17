import {fireEvent, render, screen} from "@testing-library/react";
import {expect, it} from "vitest";
import {ProviderBudgetPanel} from "@/components/customer/providers/provider-budget-panel";

const categories = [
  {code: "catering", name: "Catering"},
  {code: "photo", name: "Photography"},
  {code: "flowers", name: "Florist", unavailable: true},
  {code: "cake", name: "Cake"},
];
const offer = (key: string, category: string, cents: number) => ({
  key, category, cents, provider: "Provider", name: key, href: "/customer/packages/example",
});

it("shows a partial plan and recalculates the budget after an affordable replacement", () => {
  render(<ProviderBudgetPanel cap={500000} categories={categories} status="ready" incompleteCatalog={false}
    offers={[offer("Basic Catering", "catering", 250000), offer("Buffet Catering", "catering", 300000),
      offer("Premium Catering", "catering", 450000), offer("Event Photos", "photo", 150000),
      offer("Celebration Cake", "cake", 400000)]} />);
  expect(screen.getByRole("link", {name: /Basic Catering/})).toBeVisible();
  expect(screen.getAllByRole("link", {name: "View & customize package"})[0]).toHaveAttribute("href", "/customer/packages/example");
  expect(screen.getByText(/exceeds your remaining budget/)).toBeVisible();
  expect(screen.getByText(/unavailable for your event/)).toBeVisible();
  expect(screen.queryByText(/Premium Catering/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", {name: "Replace Catering"}), {target: {value: "Buffet Catering"}});
  expect(screen.getByRole("link", {name: /Buffet Catering/})).toBeVisible();
  expect(screen.getByText(/^\D*500\.00$/)).toBeVisible();
});

it("restores a chosen offer after reopening the same Best Fit session", () => {
  sessionStorage.clear();
  const panel = <ProviderBudgetPanel cap={500000} categories={[categories[0]]}
    status="ready" incompleteCatalog={false} sessionKey="return-test"
    offers={[offer("Basic", "catering", 250000), offer("Buffet", "catering", 300000)]} />;
  const first = render(panel);
  fireEvent.click(screen.getByRole("button", {name: "Choose Buffet from Provider"}));
  first.unmount();
  render(panel);
  expect(screen.getByRole("link", {name: /Buffet/})).toBeVisible();
  expect(screen.getByText(/2,000\.00/)).toBeVisible();
  sessionStorage.clear();
});

it("opens an itemized review and returns to the current recommendations", () => {
  render(<ProviderBudgetPanel cap={500000} categories={categories} status="ready" incompleteCatalog={false}
    offers={[offer("Buffet Catering", "catering", 250000)]} guestCount={50} city="Ormoc City" />);
  fireEvent.click(screen.getByRole("button", {name: "Continue"}));
  expect(screen.getByRole("heading", {name: "Booking estimate"})).toBeVisible();
  expect(screen.getByText("Ormoc City")).toBeVisible();
  expect(screen.getByRole("link", {name: "Submit booking request"})).toHaveAttribute("href", "/customer/packages/example");
  fireEvent.click(screen.getByRole("button", {name: /Back to Best Fit Recommendations/}));
  expect(screen.getByRole("heading", {name: "Best Fit recommendations"})).toBeVisible();
});

it("links to a standalone review and keeps the recommendation return URL", () => {
  const resultsHref = "/customer/providers?budgetMax=5000";
  const reviewHref = "/customer/providers/best-fit-review?budgetMax=5000";
  const props = {cap: 500000, categories, status: "ready" as const, incompleteCatalog: false,
    offers: [offer("Buffet Catering", "catering", 250000)], resultsHref, reviewHref};
  const {rerender} = render(<ProviderBudgetPanel {...props} />);
  expect(screen.getByRole("link", {name: "Continue"})).toHaveAttribute("href", reviewHref);
  rerender(<ProviderBudgetPanel {...props} reviewOnly />);
  expect(screen.getByRole("heading", {name: "Booking estimate"})).toBeVisible();
  expect(screen.getByRole("link", {name: /Back to Best Fit Recommendations/})).toHaveAttribute("href", resultsHref);
  expect(screen.queryByRole("heading", {name: "Best Fit recommendations"})).not.toBeInTheDocument();
});
