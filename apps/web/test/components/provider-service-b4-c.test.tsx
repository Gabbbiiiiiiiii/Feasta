import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, afterEach, expect, it, vi} from "vitest";
import {ProviderServiceForm} from "@/app/provider/services/provider-service-form";
import type {ProviderService, ProviderServiceInput} from "@/lib/provider/provider-service-client";

const mocks = vi.hoisted(() => ({create: vi.fn(), update: vi.fn(), media: vi.fn()}));
vi.mock("@/lib/provider/provider-service-client", () => ({createProviderService: mocks.create, updateProviderService: mocks.update}));
vi.mock("@/lib/provider/provider-media-client", () => ({deleteProviderServiceImage: mocks.media, uploadProviderServiceImage: mocks.media, uploadServicePortfolioPhoto: mocks.media}));
// Fail closed if a future import reaches an integration boundary.
vi.mock("@/lib/firebase/client", () => { throw new Error("Firebase forbidden in B4-C"); });
vi.mock("firebase/app", () => { throw new Error("Firebase SDK forbidden in B4-C"); });
const categories = [
  {code: "photographer", name: "Photography", serviceType: "addon", status: "active"},
  {code: "videographer", name: "Videography", serviceType: "addon", status: "active"},
  {code: "makeup_artist", name: "Makeup", serviceType: "addon", status: "active"},
] as const;
let saved: ProviderService | undefined;
const onSaved = vi.fn();
function mount(initialService?: ProviderService) {
  return render(<ProviderServiceForm isFreelancer serviceCategories={categories.map((row) => row.code)} serviceCategoryOptions={categories} initialService={initialService} onSaved={onSaved} onCancel={vi.fn()} />);
}
function change(label: string | RegExp, value: string) { fireEvent.change(screen.getByLabelText(label), {target: {value}}); }
function saveRow() { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: /^Save$/})); }
function record(id: string, input: ProviderServiceInput) {
  const {portfolio, ...fields} = input;
  if (portfolio) throw new Error("Portfolio media is outside this in-memory save scenario");
  saved = structuredClone({...fields, id, providerId: "fictional-b4-c", revision: (saved?.revision ?? 0) + 1,
    status: "draft", isActive: false, isAvailable: false, isPublished: false, isDeleted: false});
  return Promise.resolve({success: true, serviceId: id, status: "draft"});
}
function draftService(category: "photographer" | "videographer", overrides: Partial<ProviderService> = {}): ProviderService {
  return {
    id: "draft-service",
    providerId: "fictional-b4-c",
    name: "Fictional event coverage",
    description: "Coverage and separate delivery terms",
    category,
    pricingType: "per_hour",
    price: 2500.5,
    imageUrl: "",
    imagePublicId: "",
    revision: 1,
    status: "draft",
    isActive: false,
    isAvailable: false,
    isPublished: false,
    isDeleted: false,
    freelanceDetails: {
      deliverables: [
        {id: "delivery-1", name: "Digital collection", min: 7, max: 7, unit: "days", method: "gallery"},
        {id: "delivery-2", name: "Physical USB", min: 14, max: 21, unit: "days", method: "in_person"},
      ],
      inclusions: [{id: "inclusion-1", kind: "other", label: "Behind-the-scenes photos"}],
      collaboration: "",
      collaborationNotes: "",
      addOns: [],
      travelZones: [],
    },
    ...overrides,
  };
}
beforeEach(() => {
  saved = undefined;
  vi.clearAllMocks();
  vi.spyOn(crypto, "randomUUID").mockImplementation((() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`) as typeof crypto.randomUUID);
  sequence = 0;
  mocks.create.mockImplementation(record);
  mocks.update.mockImplementation(record);
  mocks.media.mockImplementation(() => { throw new Error("Media forbidden in B4-C"); });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in B4-C"); }));
});
let sequence = 0;
afterEach(() => {
  expect(mocks.media).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it.each(["photographer", "videographer"] as const)("creates, remounts and edits %s without duplicate rows or supported field loss", async (category) => {
  // New media packages use the simplified create labels; Parent Group fields appear after save/remount.
  const view = mount();
  change(/Package type/, category);
  change(/Package name/, "Fictional event coverage");
  change("About this package (optional)", "Coverage and separate delivery terms");
  change(/Pricing type/, "per_hour");
  change(/Price per hour/, "2500.50");
  expect(screen.queryByLabelText("How many people will work? (optional)")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Add Edited Photos"})).not.toBeInTheDocument();
  change("Custom included item", "Behind-the-scenes photos");
  fireEvent.keyDown(screen.getByLabelText("Custom included item"), {key: "Enter"});
  expect(screen.getByText("Included in your service (1)")).toBeInTheDocument();
  for (const [name, method, days] of [["Digital collection", "gallery", "7"], ["Physical USB", "in_person", "14"]] as const) {
    fireEvent.click(screen.getByRole("button", {name: "Add delivery item"}));
    expect(screen.queryByLabelText("Give a delivery time range instead")).not.toBeInTheDocument();
    change("What will you give the customer?", name);
    change("How will customers receive it?", method);
    change("Time unit", "days");
    change("When will it be ready after the event?", days);
    saveRow();
  }
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:removed-portfolio-photo");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  try {
    fireEvent.change(screen.getByLabelText(/choose or drop up to 20 photos/i), {target: {files: [
      new File(["portrait"], "portrait.jpg", {type: "image/jpeg"}),
    ]}});
    fireEvent.click(screen.getByRole("button", {name: "Remove photo 1"}));
  } finally {
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  }
  fireEvent.click(screen.getByRole("button", {name: "Create draft"}));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create.mock.calls[0][1]).not.toHaveProperty("portfolio");
  const first = structuredClone(saved!);
  expect(first).toMatchObject({category, price: 2500.5, pricingType: "per_hour", freelanceDetails: {
    deliverables: [
      {name: "Digital collection", min: 7, max: 7, unit: "days", method: "gallery"},
      {name: "Physical USB", min: 14, max: 14, unit: "days", method: "in_person"},
    ],
  }});
  expect(first.freelanceDetails?.inclusions?.map((row) => row.label)).toEqual(["Behind-the-scenes photos"]);

  view.unmount();
  mount(first);
  // Edit mode restores the full service form, including Parent Group protections.
  expect(screen.getByLabelText(/Service name/)).toHaveValue(first.name);
  expect(screen.getByLabelText("Short description")).toHaveValue(first.description);
  expect(screen.getByLabelText(/Service category/)).toHaveValue(category);
  expect(screen.getByLabelText(/Pricing type/)).toHaveValue("per_hour");
  expect(screen.getByLabelText(/Price per hour/)).toHaveValue("2,500.50");
  expect(screen.getByRole("button", {name: "Remove Behind-the-scenes photos"})).toBeInTheDocument();
  expect(screen.getByText("Included in your service (1)")).toBeInTheDocument();
  change("How many hours will you cover the event? (optional)", "custom");
  change("Custom coverage (hours)", "6.5");
  change("How many people will work? (optional)", "3");
  change("Who will handle the event?", "named_lead");
  change("Main photographer/videographer or special arrangements", "Alex leads the team");
  fireEvent.click(screen.getByLabelText("Pre-event consultation call"));
  fireEvent.click(screen.getByLabelText("Help planning which moments to capture"));
  const inclusion = category === "photographer" ? "Edited Photos" : "Highlight Video";
  fireEvent.click(screen.getByRole("button", {name: "Add " + inclusion}));
  expect(screen.getByRole("button", {name: "Add " + inclusion})).toBeEnabled();
  fireEvent.click(screen.getByRole("radio", {name: category === "photographer" ? "Videography" : "Photography"}));
  expect(screen.getByLabelText(/Service category/)).toHaveValue(category);
  fireEvent.click(screen.getByRole("radio", {name: category === "photographer" ? "Photography" : "Videography"}));
  expect(screen.getByRole("button", {name: "Add " + inclusion})).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", {name: "Edit Physical USB"}));
  expect(screen.getByLabelText("Give a delivery time range instead")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("Give a delivery time range instead"));
  change("Earliest delivery", "14"); change("Latest delivery", "21");
  saveRow();
  fireEvent.click(screen.getByRole("button", {name: "Edit Digital collection"}));
  expect(screen.getByLabelText("Give a delivery time range instead")).not.toBeChecked();
  expect(screen.getByLabelText("When will it be ready after the event?")).toHaveValue(7);
  change("When will it be ready after the event?", "10"); saveRow();
  fireEvent.click(screen.getByRole("button", {name: "Edit Behind-the-scenes photos"}));
  change("Included item", "  " + inclusion.toUpperCase() + "  ");
  saveRow();
  expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("already included");
  change("Included item", "Behind-the-scenes gallery");
  saveRow();
  change(/Service name/, "Revised fictional coverage");
  change(/Price per hour/, "2800");
  fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledWith(first.id, expect.objectContaining({expectedRevision: 1}));
  expect(saved).toMatchObject({
    name: "Revised fictional coverage",
    price: 2800,
    revision: 2,
    freelanceDetails: {
      coverageMinutes: 390,
      crewSize: 3,
      collaboration: "named_lead",
      collaborationNotes: "Alex leads the team",
      planning: {consultationIncluded: true, customShotListIncluded: true},
    },
  });
  expect(saved!.freelanceDetails!.inclusions!.map((row) => row.label).sort()).toEqual([inclusion, "Behind-the-scenes gallery"].sort());
  expect(saved!.freelanceDetails!.deliverables).toEqual(expect.arrayContaining([
    expect.objectContaining({name: "Digital collection", min: 10, max: 10, unit: "days", method: "gallery"}),
    expect.objectContaining({name: "Physical USB", min: 14, max: 21, unit: "days", method: "in_person"}),
  ]));
  expect(new Set(saved!.freelanceDetails!.deliverables.map((row) => row.id)).size).toBe(2);
  expect(saved!.freelanceDetails!.inclusions).toHaveLength(2);
});

it("places name, price and coverage validation beside their fields and blocks saving", () => {
  const createView = mount();
  expect(screen.getByLabelText(/Package name/)).toHaveAccessibleDescription("Package name must contain 3 to 80 characters.");
  expect(screen.getByRole("button", {name: "Create draft"})).toBeDisabled();
  change(/Package name/, "Valid name"); change(/^Price/, "-1");
  expect(screen.getByLabelText(/^Price/)).toHaveAccessibleDescription("Use up to 7 integer digits and 2 decimal places. Exponents and signs are not allowed.");
  expect(screen.getAllByText("Use up to 7 integer digits and 2 decimal places. Exponents and signs are not allowed.")).toHaveLength(1);
  change(/^Price/, "1");
  expect(screen.getByLabelText(/^Price/)).toHaveAccessibleDescription("Enter a price from PHP 500.00 to PHP 9,999,999.00 with at most two decimal places.");
  change(/^Price/, "500");
  expect(screen.getByRole("button", {name: "Create draft"})).toBeEnabled();
  createView.unmount();
  // Coverage controls belong to the full edit form, not the simplified media create flow.
  mount(draftService("photographer", {name: "Valid name", price: 500, pricingType: "fixed", freelanceDetails: {
    deliverables: [], collaboration: "", collaborationNotes: "", addOns: [], travelZones: [],
  }}));
  change("How many hours will you cover the event? (optional)", "custom");
  change("Custom coverage (hours)", "0.001");
  expect(screen.getByLabelText("Custom coverage (hours)")).toHaveAccessibleDescription("Enter coverage between 1 minute and 24 hours, in whole minutes.");
  expect(screen.getByRole("button", {name: "Save changes"})).toBeDisabled();
  change("Custom coverage (hours)", "6");
  expect(screen.getByRole("button", {name: "Save changes"})).toBeEnabled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("validates delivery fields locally and rejects reversed ranges without adding a row", () => {
  const createView = mount();
  fireEvent.click(screen.getByRole("button", {name: "Add delivery item"}));
  const dialog = within(screen.getByRole("dialog"));
  for (const [label, error] of [["What will you give the customer?", "Enter an item name."], ["When will it be ready after the event?", "Enter when this item will be ready."]]) {
    const input = dialog.getByLabelText(label); fireEvent.invalid(input);
    expect(input).toHaveAttribute("aria-invalid", "true"); expect(input).toHaveAccessibleDescription(error);
    expect(dialog.getAllByText(error)).toHaveLength(1);
  }
  fireEvent.input(screen.getByLabelText("What will you give the customer?"), {target: {value: "Photos"}});
  change("What will you give the customer?", "Photos");
  createView.unmount();
  // Range editing is available on the full service form (edit mode / non-simple package).
  mount(draftService("photographer"));
  fireEvent.click(screen.getByRole("button", {name: "Add delivery item"}));
  const editDialog = within(screen.getByRole("dialog"));
  fireEvent.click(screen.getByLabelText("Give a delivery time range instead"));
  change("Earliest delivery", "14"); change("Latest delivery", "7");
  // Submit directly to exercise parser validation independently of native constraint validation.
  fireEvent.submit(editDialog.getByRole("button", {name: /^Save$/}).closest("form")!);
  expect(editDialog.getByText(/Check the package details/)).toHaveAttribute("role", "alert");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("uses category-specific labels and native collapsible sections without altering draft terms", () => {
  mount(draftService("photographer"));
  for (const title of ["Planning with the customer (optional)", "Additional Services (Optional)", "Travel Terms (Optional)"]) {
    const summary = screen.getByText(title); const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(summary); expect(details.open).toBe(true);
    fireEvent.click(summary); expect(details.open).toBe(false);
  }
  expect(screen.getByRole("button", {name: "Add Edited Photos"})).toBeInTheDocument();
  change(/Service category/, "videographer");
  expect(screen.getByRole("button", {name: "Add Highlight Video"})).toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Add Edited Photos"})).not.toBeInTheDocument();
  expect(screen.getByText("Photo & Video Delivery")).toBeInTheDocument();
  change(/Service category/, "makeup_artist"); expect(screen.getByText("Service Delivery")).toBeInTheDocument();
});

it.each([
  ["fixed", "Price", "500.00", 500],
  ["per_guest", "Price per guest", "150.00", 150],
  ["per_hour", "Price per hour", "125.50", 125.5],
  ["per_unit", "Price per unit", "125.50", 125.5],
  ["custom_quote", null, null, null],
] as const)("saves %s pricing with its supported value", async (pricingType, label, amount, expectedPrice) => {
  mount(); change(/Package name/, "Pricing example"); change(/Pricing type/, pricingType);
  if (label && amount) change(new RegExp("^" + label), amount);
  else expect(screen.queryByRole("spinbutton", {name: /^Price/})).not.toBeInTheDocument();
  if (pricingType === "per_guest") {
    change(/Minimum guests/, "10");
    change(/Maximum guests/, "50");
  }
  fireEvent.click(screen.getByRole("button", {name: "Create draft"}));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(saved).toMatchObject({pricingType, price: expectedPrice});
});


it.each(["photographer", "videographer"] as const)("shows accessible crew errors and clears them after correction for %s", (category) => {
  mount(draftService(category, {name: "Crew example", price: 500, pricingType: "fixed"}));
  const crew = screen.getByLabelText("How many people will work? (optional)");
  const message = "Enter a whole number from 1 to 100 people, or leave this blank.";
  for (const invalid of ["0", "1.5", "101"]) {
    change("How many people will work? (optional)", invalid);
    const error = screen.getByText(message);
    expect(error).toHaveAttribute("role", "alert");
    expect(error.parentElement).toBe(crew.parentElement);
    expect(crew).toHaveAttribute("aria-invalid", "true");
    expect(crew).toHaveAttribute("aria-describedby", error.id);
    expect(crew).toHaveAccessibleDescription(message);
    expect(screen.queryByText(/Check the package details/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Save changes"})).toBeDisabled();
    fireEvent.submit(crew.closest("form")!);
    expect(mocks.update).not.toHaveBeenCalled();
    change("How many people will work? (optional)", "3");
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(crew).not.toHaveAttribute("aria-invalid");
    expect(crew).not.toHaveAttribute("aria-describedby");
    expect(screen.getByRole("button", {name: "Save changes"})).toBeEnabled();
  }
  for (const valid of ["1", "100", ""]) {
    change("How many people will work? (optional)", valid);
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Save changes"})).toBeEnabled();
  }
});

it("keeps unfinished package details on this browser when saving and exiting", async () => {
  const draftKey = "test-media-package-progress";
  localStorage.removeItem(draftKey);
  const onDraftExit = vi.fn();
  const form = (draftExitOpen: boolean) => <ProviderServiceForm isFreelancer inDialog
    serviceCategories={["photographer"]} serviceCategoryOptions={[categories[0]]}
    draftKey={draftKey} draftExitOpen={draftExitOpen} onDraftExit={onDraftExit}
    onSaved={onSaved} onCancel={vi.fn()} />;
  const view = render(form(false));
  change(/Package name/, "Unfinished wedding coverage");
  view.rerender(form(true));
  const dialog = screen.getByRole("dialog", {name: "Save this package as a draft?"});
  fireEvent.click(within(dialog).getByRole("button", {name: "Save Draft & Exit"}));
  await waitFor(() => expect(onDraftExit).toHaveBeenCalledOnce());
  expect(mocks.create).not.toHaveBeenCalled();
  view.unmount();

  render(form(false));
  expect(screen.getByLabelText(/Package name/)).toHaveValue("Unfinished wedding coverage");
  localStorage.removeItem(draftKey);
});
