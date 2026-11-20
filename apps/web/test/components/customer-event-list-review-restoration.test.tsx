import {beforeEach, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import fixtures from "../../../../contracts/customer-event-list/fixtures.json";
import {decodeDocument} from "@/lib/customer/event-list/customer-event-list-cloud-contract";
const mocks = vi.hoisted(() => ({document: null as unknown, status: "ready", recovery: "idle", edit: vi.fn()}));
vi.mock("@/lib/firebase/client", () => ({auth: {currentUser: {uid: "customer_A"}}}));
vi.mock("next/navigation", () => ({useRouter: () => ({push: vi.fn(), replace: vi.fn()})}));
vi.mock("@/app/customer/packages/event-list-labels", () => ({loadEventListPackageLabels: vi.fn(async () => null)}));
vi.mock("@/lib/customer/event-list/customer-event-list-cloud-transport", () => ({CUSTOMER_EVENT_LIST_CLOUD_ENABLED: true}));
vi.mock("@/lib/customer/event-list/use-customer-event-list-cloud-async", () => ({
  useCustomerEventListCloudAsync: () => ({state: {status: mocks.status, document: mocks.document}, recovery: {status: mocks.recovery}, editCanonicalConfigurationAsync: mocks.edit}),
}));
vi.mock("@/lib/customer/event-list/customer-event-list", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/customer/event-list/customer-event-list")>(),
  useCustomerEventListSession: () => ({generation: 1}),
  useCustomerEventList: () => ({items: [], readSchedule: () => null}),
  useCustomerEventListSchedule: () => null,
}));
import {CustomerEventListReview} from "@/components/customer/event-list/customer-event-list-review";
const document = () => decodeDocument(structuredClone(fixtures.document), "customer_A");
beforeEach(() => {mocks.edit.mockReset(); mocks.status = "ready"; mocks.recovery = "idle"; mocks.document = document();});
it("opens Mobile-saved catering at Step 1 through the canonical package booking route", () => {
  const d = document(); d.entries = [d.entries[1]]; mocks.document = d;
  render(<CustomerEventListReview />);
  expect(screen.getByRole("link", {name: "Edit details"})).toHaveAttribute("href", "/customer/packages/package_mobile/book?eventListProvider=provider_123");
  expect(screen.queryByRole("form")).toBeNull();
  expect(screen.queryByRole("link", {name: /Review and submit/})).toBeNull();
});
it("does not expose Mobile editing while cloud state is cached", () => {
  const d = document(); d.entries = [d.entries[1]]; mocks.document = d; mocks.status = "cached";
  render(<CustomerEventListReview />);
  expect(screen.queryByRole("link", {name: "Edit details"})).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Loading your server-confirmed Event List");
});
it("keeps foreign selections, images, provider details and saved configuration visible while blocking booking", () => {
  const d = document(); d.entries = [d.entries[1]]; mocks.document = d;
  render(<CustomerEventListReview />);
  expect(screen.getByText(String(d.entries[0].name))).toBeVisible();
  expect(screen.getByRole("heading", {name: String(d.entries[0].providerName), level: 2})).toBeVisible();
  expect(screen.queryByText("Saved configuration")).toBeNull();
  const saved = d.entries[0];
  const config = saved.configuration;
  const configuredPrice =
    config && "estimatedTotal" in config
      ? config.estimatedTotal
      : null;

  const amount =
    typeof configuredPrice === "number" &&
    Number.isFinite(configuredPrice) &&
    configuredPrice >= 0
      ? configuredPrice
      : saved.estimatedPrice;

  expect(typeof amount).toBe("number");

  const totalCard = screen
    .getByText("Estimated event total")
    .closest("section");

  expect(totalCard).not.toBeNull();
  expect(totalCard).toHaveTextContent(
    new Intl.NumberFormat("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount as number),
  );
  expect(screen.queryByRole("link", {name: /Review and submit/})).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("compatible editor");
});
it("shows a partial estimate when a canonical selection is excluded", () => {
  const d = document(); d.entries = d.entries.slice(0, 2); mocks.document = d;
  render(<CustomerEventListReview />);
  const supported = d.entries[0];
  const preserved = d.entries[1];

  const rawServices = supported.configuration?.selectedEventServices;
  const services: unknown[] = Array.isArray(rawServices)
    ? rawServices
    : [];

  const servicePrices = services.map((service): number | null => {
    if (
      typeof service !== "object" ||
      service === null ||
      !("price" in service)
    ) {
      return null;
    }

    const price = service.price;

    return typeof price === "number" &&
      Number.isFinite(price) &&
      price >= 0
      ? price
      : null;
  });

  const servicesTotal = servicePrices.reduce<number>(
    (sum, price) => sum + (price ?? 0),
    0,
  );

  const preservedConfig = preserved.configuration;
  const configuredPrice =
    preservedConfig && "estimatedTotal" in preservedConfig
      ? preservedConfig.estimatedTotal
      : null;

  const preservedPrice =
    typeof configuredPrice === "number" &&
    Number.isFinite(configuredPrice) &&
    configuredPrice >= 0
      ? configuredPrice
      : preserved.estimatedPrice;

  expect(typeof supported.estimatedPrice).toBe("number");
  expect(typeof preservedPrice).toBe("number");
  expect(servicePrices.every((price) => price !== null)).toBe(true);

  const expectedTotal =
    (supported.estimatedPrice as number) +
    servicesTotal +
    (preservedPrice as number);

  const totalCard = screen
    .getByText("Estimated event total")
    .closest("section");

  expect(totalCard).not.toBeNull();
  expect(totalCard).toHaveTextContent(
    new Intl.NumberFormat("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(expectedTotal),
  );
  expect(screen.queryByRole("link", {name: /Review and submit/})).toBeNull();
});
it("shows unavailable rather than zero when no package price is known", () => {
  const d = document(); d.entries = [d.entries[0]]; d.entries[0].estimatedPrice = null;
  d.entries[0].configuration!.selectedEventServices = []; mocks.document = d;
  render(<CustomerEventListReview />);
  expect(screen.getByText("Estimate unavailable")).toBeVisible();
});
it.each(["idle", "confirmed"])("retains the single configured package review action with %s recovery", recovery => {
  const d = document(); d.entries = [d.entries[0]]; mocks.document = d; mocks.recovery = recovery;
  render(<CustomerEventListReview />);
  expect(screen.getByRole("link", {name: /Review and submit/})).toHaveAttribute("href", expect.stringContaining("eventListIntent=review"));
});
it("enables single-provider Mobile booking review while keeping Edit details at Step 1", () => {
  const d = document(); d.entries = [d.entries[1]];
  d.entries[0].configuration!.selectedAddOns = [];
  mocks.document = d;
  render(<CustomerEventListReview />);
  expect(screen.getByRole("link", {name: /Review and submit/})).toHaveAttribute("href", "/customer/packages/package_mobile/book?eventListProvider=provider_123&eventListIntent=review");
  expect(screen.getByRole("link", {name: "Edit details"})).toHaveAttribute("href", expect.not.stringContaining("eventListIntent"));
  expect(screen.getByRole("link", {name: "Edit details"})).toHaveClass("bg-primary", "text-white");
  expect(screen.queryByText("Saved configuration")).toBeNull();
  expect(screen.queryByText("Compatible booking review required")).toBeNull();
});
it.each(["sending", "uncertain", "awaiting_snapshot"])("blocks review while recovery is %s", recovery => {
  const d = document(); d.entries = [d.entries[0]]; mocks.document = d; mocks.recovery = recovery;
  render(<CustomerEventListReview />);
  expect(screen.queryByRole("link", {name: /Review and submit/})).toBeNull();
});
it("blocks duplicate-provider packages and retains both cards", () => {
  const d = document(); const first = d.entries[0]; d.entries = [first, {...first, selectionId: "other_package", identity: "catering_package:" + first.providerId + ":other_package", name: "Second saved package"}]; mocks.document = d;
  render(<CustomerEventListReview />);
  expect(screen.getByText("Second saved package")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Only one package per provider");
  expect(screen.queryByRole("link", {name: /Review and submit/})).toBeNull();
});
it("blocks an unconfigured package with an explanation", () => {
  const d = document(); d.entries = [{...d.entries[0], configuration: null, expectedRevision: null}]; mocks.document = d;
  render(<CustomerEventListReview />);
  expect(screen.getByText("Needs customization")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Customize every saved package");
});
