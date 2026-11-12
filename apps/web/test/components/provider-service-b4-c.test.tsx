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

it.each(["photographer", "videographer"])("creates, remounts and edits %s without duplicate rows or supported field loss", async (category) => {
  const view = mount();
  change(/Service category/, category);
  change(/Service name/, "Fictional event coverage");
  change("Short description", "Coverage and separate delivery terms");
  change(/Pricing type/, "per_hour");
  change(/Price per hour/, "2500.50");
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
  change("Custom included item", "Behind-the-scenes photos");
  fireEvent.keyDown(screen.getByLabelText("Custom included item"), {key: "Enter"});
  for (const [name, method, range] of [["Digital collection", "gallery", false], ["Physical USB", "in_person", true]] as const) {
    fireEvent.click(screen.getByRole("button", {name: "Add delivery item"}));
    expect(screen.getByLabelText("Give a delivery time range instead")).not.toBeChecked();
    change("What will you give the customer?", name);
    change("How will customers receive it?", method);
    change("Time unit", "days");
    if (range) {
      fireEvent.click(screen.getByLabelText("Give a delivery time range instead"));
      change("Earliest delivery", "14"); change("Latest delivery", "21");
    } else change("When will it be ready after the event?", "7");
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
    coverageMinutes: 390, crewSize: 3, collaboration: "named_lead", collaborationNotes: "Alex leads the team",
    planning: {consultationIncluded: true, customShotListIncluded: true},
    deliverables: [{name: "Digital collection", min: 7, max: 7, unit: "days", method: "gallery"}, {name: "Physical USB", min: 14, max: 21, unit: "days", method: "in_person"}],
  }});
  expect(first.freelanceDetails?.inclusions?.map((row) => row.label)).toEqual([inclusion, "Behind-the-scenes photos"]);
  view.unmount(); mount(first);
  expect(screen.getByRole("button", {name: "Remove Behind-the-scenes photos"})).toBeInTheDocument();
  expect(screen.getByText("Included in your service (2)")).toBeInTheDocument();
  expect(screen.getByLabelText(/Service name/)).toHaveValue(first.name);
  expect(screen.getByLabelText("Short description")).toHaveValue(first.description);
  expect(screen.getByLabelText(/Service category/)).toHaveValue(category);
  expect(screen.getByLabelText(/Pricing type/)).toHaveValue("per_hour");
  expect(screen.getByLabelText(/Price per hour/)).toHaveValue(2500.5);
  expect(screen.getByLabelText("Custom coverage (hours)")).toHaveValue("6.5");
  expect(screen.getByLabelText("How many people will work? (optional)")).toHaveValue(3);
  expect(screen.getByLabelText("Main photographer/videographer or special arrangements")).toHaveValue("Alex leads the team");
  expect(screen.getByLabelText("Pre-event consultation call")).toBeChecked();
  fireEvent.click(screen.getByRole("button", {name: "Edit Physical USB"}));
  expect(screen.getByLabelText("Give a delivery time range instead")).toBeChecked();
  expect(screen.getByLabelText("Earliest delivery")).toHaveValue(14);
  expect(screen.getByLabelText("Latest delivery")).toHaveValue(21);
  expect(screen.getByLabelText("How will customers receive it?")).toHaveValue("in_person");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Cancel"}));
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
  expect(saved).toEqual({...first, expectedRevision: 1, revision: 2, name: "Revised fictional coverage", price: 2800,
    freelanceDetails: {...first.freelanceDetails, inclusions: first.freelanceDetails!.inclusions!.map((row, index) => index === 1 ? {...row, label: "Behind-the-scenes gallery"} : row), deliverables: first.freelanceDetails!.deliverables.map((row, index) => index === 0 ? {...row, min: 10, max: 10} : row)}});
  expect(new Set(saved!.freelanceDetails!.deliverables.map((row) => row.id)).size).toBe(2);
  expect(saved!.freelanceDetails!.inclusions).toHaveLength(2);
});

it("places name, price and coverage validation beside their fields and blocks saving", () => {
  mount();
  expect(screen.getByLabelText(/Service name/)).toHaveAccessibleDescription("Enter a service name.");
  expect(screen.getByRole("button", {name: "Create draft"})).toBeDisabled();
  change(/Service name/, "Valid name"); change(/^Price/, "-1");
  expect(screen.getByLabelText(/^Price/)).toHaveAccessibleDescription("Enter a valid service price.");
  expect(screen.getAllByText("Enter a valid service price.")).toHaveLength(1);
  change(/^Price/, "100");
  change("How many hours will you cover the event? (optional)", "custom");
  change("Custom coverage (hours)", "0.001");
  expect(screen.getByLabelText("Custom coverage (hours)")).toHaveAccessibleDescription("Enter coverage between 1 minute and 24 hours, in whole minutes.");
  expect(screen.getByRole("button", {name: "Create draft"})).toBeDisabled();
  change("Custom coverage (hours)", "6");
  expect(screen.getByRole("button", {name: "Create draft"})).toBeEnabled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("validates delivery fields locally and rejects reversed ranges without adding a row", () => {
  mount(); fireEvent.click(screen.getByRole("button", {name: "Add delivery item"}));
  const dialog = within(screen.getByRole("dialog"));
  for (const [label, error] of [["What will you give the customer?", "Enter an item name."], ["When will it be ready after the event?", "Enter when this item will be ready."]]) {
    const input = dialog.getByLabelText(label); fireEvent.invalid(input);
    expect(input).toHaveAttribute("aria-invalid", "true"); expect(input).toHaveAccessibleDescription(error);
    expect(dialog.getAllByText(error)).toHaveLength(1);
  }
  fireEvent.input(screen.getByLabelText("What will you give the customer?"), {target: {value: "Photos"}});
  change("What will you give the customer?", "Photos");
  fireEvent.click(screen.getByLabelText("Give a delivery time range instead"));
  change("Earliest delivery", "14"); change("Latest delivery", "7");
  // Submit directly to exercise parser validation independently of native constraint validation.
  fireEvent.submit(dialog.getByRole("button", {name: /^Save$/}).closest("form")!);
  expect(dialog.getByText(/Check the package details/)).toHaveAttribute("role", "alert");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("uses category-specific labels and native collapsible sections without altering draft terms", () => {
  mount();
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

it.each([["fixed", "Price"], ["per_guest", "Price per guest"], ["per_hour", "Price per hour"], ["per_unit", "Price per unit"], ["custom_quote", null]])("saves %s pricing with its supported value", async (pricingType, label) => {
  mount(); change(/Service name/, "Pricing example"); change(/Pricing type/, pricingType!);
  if (label) change(new RegExp("^" + label), "125.50");
  else expect(screen.queryByRole("spinbutton", {name: /^Price/})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Create draft"}));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(saved).toMatchObject({pricingType, price: label ? 125.5 : null});
});


it.each(["photographer", "videographer"])("shows accessible crew errors and clears them after correction for %s", (category) => {
  mount(); change(/Service category/, category);
  change(/Service name/, "Crew example"); change(/^Price/, "100");
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
    expect(screen.getByRole("button", {name: "Create draft"})).toBeDisabled();
    fireEvent.submit(crew.closest("form")!);
    expect(mocks.create).not.toHaveBeenCalled();
    change("How many people will work? (optional)", "3");
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(crew).not.toHaveAttribute("aria-invalid");
    expect(crew).not.toHaveAttribute("aria-describedby");
    expect(screen.getByRole("button", {name: "Create draft"})).toBeEnabled();
  }
  for (const valid of ["1", "100", ""]) {
    change("How many people will work? (optional)", valid);
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Create draft"})).toBeEnabled();
  }
});
