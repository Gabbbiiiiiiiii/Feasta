import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
import {createProviderPackage, updateProviderPackage, type ProviderPackage} from "@/lib/provider/provider-package-client";
import {uploadProviderServiceImage} from "@/lib/provider/provider-media-client";

vi.mock("@/lib/provider/provider-package-client", () => ({createProviderPackage: vi.fn(), updateProviderPackage: vi.fn()}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));
const occasionCatalog = {options: [{id: "birthday", label: "Birthday", categoryCodes: ["food_catering", "catering_service"]}, {id: "wedding", label: "Wedding", categoryCodes: ["food_catering", "catering_service"]}], catalogRevision: 4, providerEligibilityRevision: 2, maxSpecificOccasions: 5};
const props = {occasionCatalog, packageCategoryOptions: [{code: "food_catering", name: "Catering"}], eventTypesSupported: ["birthday", "wedding"], minGuestsPerEvent: 10, maxGuestsPerEvent: 100, onSaved: vi.fn(), onCancel: vi.fn()};
const existing: ProviderPackage = {
  id: "existing", providerId: "provider", name: "Wedding catering", description: "A complete catering package",
  eventType: "wedding", serviceCategoryCode: "food_catering", price: 100,
  serviceOptions: {drop_off: {price: 100, includedServices: ["Delivery"]}}, themeOptions: [],
  paymentPolicy: "full_payment", depositPercentage: 100, balanceDueDaysBeforeEvent: 1, downPaymentPercentage: 100,
  minimumGuests: 10, maximumGuests: 50, imageUrl: "", imageUrls: [],
  foodInclusions: [], decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
  status: "draft", isActive: false, isPublished: false, providerPubliclyVisible: false,
};
const selector = () => screen.getByRole("combobox", {name: /Suitable occasions/});
const add = (value: string) => {
  fireEvent.change(selector(), {target: {value}});
  fireEvent.click(screen.getByRole("button", {name: "Add selected occasion"}));
};
const next = () => fireEvent.click(screen.getByRole("button", {name: "Next"}));
beforeEach(() => vi.clearAllMocks());

describe("package occasion chips", () => {
  it("initializes a legacy package with its existing single occasion and the approved selector", () => {
    render(<ProviderPackageForm {...props} initialPackage={existing} />);
    const chips = screen.getByRole("list", {name: "Selected occasions"});
    expect(within(chips).getByText("Wedding")).toBeVisible();
    expect(within(chips).getByRole("button", {name: "Remove Wedding occasion"})).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", {name: "Add selected occasion"})).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(selector()).toHaveAccessibleName(/Suitable occasions/);
    expect(within(selector()).getByRole("option", {name: "Wedding (selected)"})).toBeDisabled();
  });

  it("adds approved occasions once and preserves multiple selections across wizard navigation", () => {
    render(<ProviderPackageForm {...props} initialPackage={existing} />);
    add("birthday");
    expect(within(screen.getByRole("list", {name: "Selected occasions"})).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Multiple occasions and Fits All cannot be saved");
    expect(selector()).not.toHaveAttribute("aria-invalid", "true");
    add("birthday");
    expect(screen.getAllByRole("button", {name: "Remove Birthday occasion"})).toHaveLength(1);
    next();
    expect(screen.getByRole("heading", {name: "Step 2: Pricing & capacity"})).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Back"}));
    expect(screen.getByRole("button", {name: "Remove Wedding occasion"})).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Remove Wedding occasion"}));
    fireEvent.click(screen.getByRole("button", {name: "Remove Birthday occasion"}));
    expect(screen.queryByRole("list", {name: "Selected occasions"})).not.toBeInTheDocument();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Add one occasion supported by your business");
    add("birthday");
    next();
    expect(screen.getByRole("heading", {name: "Step 2: Pricing & capacity"})).toBeVisible();
  });

  it("supports keyboard Add and remove without submitting, and restores focus to the selector", async () => {
    const user = userEvent.setup();
    render(<ProviderPackageForm {...props} />);
    await user.selectOptions(selector(), "wedding");
    await user.click(screen.getByRole("button", {name: "Add selected occasion"}));
    expect(selector()).toHaveFocus();
    screen.getByRole("button", {name: "Remove Wedding occasion"}).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("button", {name: "Remove Wedding occasion"})).not.toBeInTheDocument();
    expect(selector()).toHaveFocus();
    await user.selectOptions(selector(), "wedding");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", {name: "Remove Wedding occasion"})).toBeVisible();
    screen.getByRole("button", {name: "Remove Wedding occasion"}).focus();
    await user.keyboard(" ");
    expect(screen.queryByRole("button", {name: "Remove Wedding occasion"})).not.toBeInTheDocument();
    expect(selector()).toHaveFocus();
    expect(createProviderPackage).not.toHaveBeenCalled();
  });

  it("uses canonical options rather than legacy capabilities and exposes the gated request dialog", () => {
    render(<ProviderPackageForm {...props} eventTypesSupported={["birthday", "birthday", "unknown"]} occasionCatalog={{...occasionCatalog, options: occasionCatalog.options.map((option) => ({...option, label: option.id === "birthday" ? "Birthday celebration" : option.label}))}} />);
    expect(within(selector()).getAllByRole("option").map((option) => (option as HTMLOptionElement).value)).toEqual(["", "birthday", "wedding"]);
    expect(within(screen.getByRole("list", {name: "Selected occasions"})).getByText("Birthday celebration")).toBeVisible();
    fireEvent.change(selector(), {target: {value: "unknown"}});
    fireEvent.keyDown(selector(), {key: "Enter"});
    expect(screen.queryByRole("button", {name: "Remove Unknown occasion"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "+ Add Occasion"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Fits All Occasions"})).toBeVisible();
    expect(screen.queryByRole("dialog", {name: "Request an occasion"})).not.toBeInTheDocument();
    expect(within(selector()).queryByRole("option", {name: /Fits All/})).not.toBeInTheDocument();
  });

  it("retains an unsupported historical value for correction instead of replacing it", () => {
    render(<ProviderPackageForm {...props} initialPackage={{...existing, eventType: "reunion"}} />);
    expect(screen.getByText("Reunion (no longer supported)")).toBeVisible();
    next();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("heading", {name: "Step 1: Basic details"})).toBeVisible();
    expect(updateProviderPackage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Remove Reunion occasion"}));
    add("birthday");
    next();
    expect(screen.getByRole("heading", {name: "Step 2: Pricing & capacity"})).toBeVisible();
  });

  it("guards final submission and media upload with multiple chips, then saves only the remaining scalar", async () => {
    const {container} = render(<ProviderPackageForm {...props} initialPackage={existing} />);
    for (let i = 0; i < 4; i++) next();
    expect(screen.getByRole("button", {name: "Save changes"})).toBeEnabled();
    // Exercise the submit guard independently of Step 1 navigation and disabled buttons.
    fireEvent.change(screen.getByLabelText(/Suitable occasions/), {target: {value: "birthday"}});
    fireEvent.click(screen.getByLabelText("Add selected occasion"));
    expect(screen.getByRole("button", {name: "Save changes"})).toBeDisabled();
    fireEvent.submit(container.querySelector("form")!);
    expect(createProviderPackage).not.toHaveBeenCalled();
    expect(updateProviderPackage).not.toHaveBeenCalled();
    expect(uploadProviderServiceImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Remove Wedding occasion"));
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(updateProviderPackage).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(updateProviderPackage).mock.calls[0];
    expect(id).toBe(existing.id);
    expect(payload.eventType).toBe("birthday");
    expect(payload).not.toHaveProperty("pricingModel");
    for (const field of ["occasionIds", "occasionScope", "occasionSchemaVersion", "selectedOccasions"]) expect(payload).not.toHaveProperty(field);
  });

  it("blocks stale eligibility before saving", () => {
    const {container, rerender} = render(<ProviderPackageForm {...props} initialPackage={existing} />);
    for (let i = 0; i < 4; i++) next();
    rerender(<ProviderPackageForm {...props} occasionCatalog={{...occasionCatalog, options: occasionCatalog.options.filter((option) => option.id === "birthday")}} initialPackage={existing} />);
    expect(screen.getByRole("button", {name: "Save changes"})).toBeDisabled();
    fireEvent.submit(container.querySelector("form")!);
    expect(updateProviderPackage).not.toHaveBeenCalled();
  });
});

it.each(["per_pax", "per_bundle"] as const)("reopens and edits a %s draft without changing its pricing or single occasion contract", async (pricingModel) => {
  render(<ProviderPackageForm {...props} initialPackage={{...existing, pricingModel, serviceOptions: {
    drop_off: {price: 100.25, includedServices: ["Delivery"]},
    buffet_setup: {price: 225.75, includedServices: ["Warmers"]},
  }}} />);
  fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Updated catering draft"}});
  next();
  expect(screen.getByLabelText(/Pricing model/)).toHaveValue(pricingModel);
  expect(screen.getByLabelText(/Drop-Off Catering price/)).toHaveValue("100.25");
  expect(screen.getByLabelText(/Buffet Setup price/)).toHaveValue("225.75");
  for (let index = 0; index < 3; index++) next();
  expect(screen.getByRole("note")).toHaveTextContent("Draft only");
  fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
  await waitFor(() => expect(updateProviderPackage).toHaveBeenCalledOnce());
  expect(updateProviderPackage).toHaveBeenCalledWith(existing.id, expect.objectContaining({
    name: "Updated catering draft", pricingModel, eventType: "wedding", price: 100.25,
    serviceOptions: {drop_off: {price: 100.25, includedServices: ["Delivery"]}, buffet_setup: {price: 225.75, includedServices: ["Warmers"]}},
  }));
  const payload = vi.mocked(updateProviderPackage).mock.calls[0][1];
  expect(payload).not.toHaveProperty("occasionIds");
  expect(payload).not.toHaveProperty("occasionScope");
});

it("makes Fits All exclusive, preserves it across steps, and blocks upload and save", () => {
  const {container} = render(<ProviderPackageForm {...props} initialPackage={existing} />);
  add("birthday");
  fireEvent.click(screen.getByRole("button", {name: "Fits All Occasions"}));
  expect(screen.queryByRole("button", {name: "Remove Wedding occasion"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Remove Birthday occasion"})).not.toBeInTheDocument();
  for (let i = 0; i < 4; i++) next();
  expect(screen.getByRole("button", {name: "Save changes"})).toBeDisabled();
  fireEvent.submit(container.querySelector("form")!);
  expect(updateProviderPackage).not.toHaveBeenCalled();
  expect(uploadProviderServiceImage).not.toHaveBeenCalled();
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", {name: "Back"}));
  expect(screen.getByRole("button", {name: "Fits All Occasions"})).toHaveAttribute("aria-pressed", "true");
  add("birthday");
  expect(screen.getByRole("button", {name: "Fits All Occasions"})).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("button", {name: "Remove Fits All Occasions"})).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Remove Birthday occasion"})).toBeVisible();
});

it("fails closed when canonical options are unavailable without dropping a legacy occasion", () => {
  render(<ProviderPackageForm {...props} occasionCatalog={null} initialPackage={existing} />);
  expect(screen.getByText("Wedding (no longer supported)")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Approved occasion choices are unavailable");
  expect(within(selector()).getAllByRole("option")).toHaveLength(1);
  next();
  expect(screen.getByRole("heading", {name: "Step 1: Basic details"})).toBeVisible();
});

it("does not submit a request through the unverified integration", async () => {
  const user = userEvent.setup();
  render(<ProviderPackageForm {...props} initialPackage={existing} />);
  await user.click(screen.getByRole("button", {name: "+ Add Occasion"}));
  expect(screen.getByRole("dialog", {name: "Request an occasion"})).toHaveTextContent("unavailable until backend integration is verified");
  expect(screen.queryByRole("button", {name: "Submit Request"})).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", {name: "Remove Wedding occasion"})).toBeVisible();
});
