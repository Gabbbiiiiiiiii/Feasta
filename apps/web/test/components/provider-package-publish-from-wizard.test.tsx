import {createRef} from "react";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {ProviderPackageForm, type ProviderPackageEditor} from "@/app/provider/packages/provider-package-form";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";

const api = vi.hoisted(() => ({
  createV2: vi.fn(),
  updateV2: vi.fn(),
  completeV2: vi.fn(),
  publish: vi.fn(),
  createLegacy: vi.fn(),
  updateLegacy: vi.fn(),
  publicationEnabled: true,
}));

vi.mock("@/app/provider/packages/dish-library-actions", () => ({
  loadDishLibrary: async () => ({
    revision: 1,
    categories: ["Rice"],
    dishes: [{id: "rice", name: "Steamed Rice", category: "Rice"}],
  }),
}));

vi.mock("@/lib/provider/provider-package-v2-client", () => ({
  packageV2Enabled: true,
  get packageV2PublicationEnabled() {
    return api.publicationEnabled;
  },
  createV2PackageDraft: api.createV2,
  updateV2PackageDraft: api.updateV2,
  completeV2PackageProgress: api.completeV2,
  hasPendingV2Draft: vi.fn(() => false),
  retryPendingV2Draft: vi.fn(),
}));

vi.mock("@/lib/provider/provider-package-client", () => ({
  createProviderPackage: api.createLegacy,
  updateProviderPackage: api.updateLegacy,
  publishProviderPackage: api.publish,
}));

vi.mock("@/lib/provider/provider-package-progress", () => ({
  packageEditorProgressEnabled: false,
  savePackageProgress: vi.fn(),
  packageProgressError: () => "Progress failed",
}));

const props = {
  occasionCatalog: {
    options: [{id: "birthday", label: "Birthday", categoryCodes: ["catering_service"]}],
    catalogRevision: 1,
    eligibilityModel: "global_v1" as const,
    maxSpecificOccasions: 10,
  },
  packageCategoryOptions: [{code: "catering_service", name: "Catering"}],
  eventTypesSupported: ["birthday"],
  minGuestsPerEvent: 10,
  maxGuestsPerEvent: 100,
  onSaved: vi.fn(),
  onCancel: vi.fn(),
};

const existingDraft: ProviderPackage = {
  id: "pkg-draft",
  providerId: "provider",
  name: "Birthday Feast",
  description: "Complete birthday catering draft.",
  eventType: "birthday",
  serviceCategoryCode: "catering_service",
  price: 250,
  serviceOptions: {drop_off: {price: 250, includedServices: ["Delivery"]}},
  themeOptions: [],
  paymentPolicy: "full_payment",
  depositPercentage: 100,
  downPaymentPercentage: 100,
  balanceDueDaysBeforeEvent: null,
  minimumGuests: 10,
  maximumGuests: 50,
  imageUrl: "",
  imageUrls: [],
  foodInclusions: ["Rice: Steamed Rice"],
  decorInclusions: [],
  furnitureInclusions: [],
  serviceInclusions: [],
  status: "draft",
  isActive: false,
  isPublished: false,
  providerPubliclyVisible: false,
  pricingModel: "per_pax",
  v2: {
    revision: 3,
    offerStructure: "fixed",
    occasionScope: "specific",
    occasionIds: ["birthday"],
    equipmentInclusions: [],
    serviceOptions: {drop_off: {price: 250, includedServices: ["Delivery"]}},
  },
};

const next = () => fireEvent.click(screen.getByRole("button", {name: "Next"}));

async function fillNewPackageToReview() {
  fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Fiesta Package"}});
  fireEvent.change(screen.getByLabelText(/Description/), {target: {value: "Complete celebration package."}});
  fireEvent.change(screen.getByLabelText(/Suitable occasions/), {target: {value: "birthday"}});
  fireEvent.click(screen.getByRole("button", {name: "Add selected occasion"}));
  next();
  fireEvent.change(screen.getByLabelText(/Minimum guests/), {target: {value: "10"}});
  fireEvent.change(screen.getByLabelText(/Maximum guests/), {target: {value: "50"}});
  fireEvent.click(screen.getByRole("checkbox", {name: /Drop-Off/}));
  fireEvent.change(screen.getByLabelText(/Drop-Off.*price/), {target: {value: "300"}});
  next();
  fireEvent.click(screen.getByRole("button", {name: "Choose from Dish List"}));
  const picker = within(await screen.findByRole("dialog", {name: "Dish Library"}));
  fireEvent.click(await picker.findByRole("checkbox", {name: "Select all Rice"}));
  fireEvent.click(picker.getByRole("button", {name: "Add 1 selected dish"}));
  next();
  next();
}

beforeEach(() => {
  vi.clearAllMocks();
  api.publicationEnabled = true;
  api.createV2.mockResolvedValue({packageId: "pkg-new", packageRevision: 1, status: "draft"});
  api.updateV2.mockResolvedValue({packageId: "pkg-draft", packageRevision: 4, status: "draft"});
  api.publish.mockResolvedValue({success: true, packageId: "pkg-new", status: "published"});
});

describe("Step 5 Save as Draft and Publish Package actions", () => {
  it("creates and immediately publishes a new V2 package when Publish Package is confirmed", async () => {
    render(<ProviderPackageForm {...props} dialogLayout />);
    await fillNewPackageToReview();

    expect(screen.getByRole("button", {name: "Save as Draft"})).toBeEnabled();
    expect(screen.getByRole("button", {name: "Publish Package"})).toBeEnabled();
    expect(screen.getByRole("note")).toHaveTextContent("Save as Draft to keep this package private for later, or Publish Package");

    fireEvent.click(screen.getByRole("button", {name: "Publish Package"}));
    const dialog = screen.getByRole("dialog", {name: "FEASTA Confirmation"});
    expect(dialog).toHaveTextContent("Publish package?");
    expect(dialog).toHaveTextContent("Fiesta Package");
    fireEvent.click(within(dialog).getByRole("button", {name: "Publish Package"}));

    await waitFor(() => expect(api.publish).toHaveBeenCalledTimes(1));
    expect(api.createV2).toHaveBeenCalledTimes(1);
    expect(api.publish).toHaveBeenCalledWith("pkg-new", {revision: 1});
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it("updates and publishes an existing V2 draft using the new revision", async () => {
    render(<ProviderPackageForm {...props} dialogLayout initialPackage={existingDraft} />);
    next();
    next();
    next();
    next();

    fireEvent.click(screen.getByRole("button", {name: "Publish Package"}));
    fireEvent.click(within(screen.getByRole("dialog", {name: "FEASTA Confirmation"})).getByRole("button", {name: "Publish Package"}));

    await waitFor(() => expect(api.publish).toHaveBeenCalledTimes(1));
    expect(api.updateV2).toHaveBeenCalledWith(expect.objectContaining({packageId: "pkg-draft", expectedRevision: 3}));
    expect(api.publish).toHaveBeenCalledWith("pkg-draft", {revision: 4});
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it("recovers safely if publishing fails after draft creation without creating a duplicate draft", async () => {
    api.publish
      .mockRejectedValueOnce({code: "functions/failed-precondition", details: {reason: "PROVIDER_INELIGIBLE"}})
      .mockResolvedValueOnce({success: true, packageId: "pkg-new", status: "published"});

    render(<ProviderPackageForm {...props} dialogLayout />);
    await fillNewPackageToReview();

    fireEvent.click(screen.getByRole("button", {name: "Publish Package"}));
    fireEvent.click(within(screen.getByRole("dialog", {name: "FEASTA Confirmation"})).getByRole("button", {name: "Publish Package"}));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your package was saved as a draft, but could not be published yet. Complete your approved public provider profile before publishing packages.",
      ),
    );
    expect(api.createV2).toHaveBeenCalledTimes(1);
    expect(api.publish).toHaveBeenCalledTimes(1);
    expect(props.onSaved).not.toHaveBeenCalled();

    // Retry Publish uses the saved draft ID & revision without creating a second package.
    expect(screen.getByRole("button", {name: "Keep as Draft"})).toBeEnabled();
    fireEvent.click(screen.getByRole("button", {name: "Retry Publish"}));
    fireEvent.click(within(screen.getByRole("dialog", {name: "FEASTA Confirmation"})).getByRole("button", {name: "Retry Publish"}));

    await waitFor(() => expect(api.publish).toHaveBeenCalledTimes(2));
    expect(api.createV2).toHaveBeenCalledTimes(1);
    expect(api.updateV2).not.toHaveBeenCalled();
    expect(api.publish).toHaveBeenLastCalledWith("pkg-new", {revision: 1});
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it("disables Publish Package with an inline explanation when publication is unavailable", async () => {
    api.publicationEnabled = false;
    render(<ProviderPackageForm {...props} dialogLayout initialPackage={existingDraft} />);
    next();
    next();
    next();
    next();

    expect(screen.getByRole("button", {name: "Save as Draft"})).toBeEnabled();
    expect(screen.getByRole("button", {name: "Publish Package"})).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Publishing is currently unavailable on this environment. You can still save as a draft.",
    );
  });

  it("renders the three stacked actions (Save as draft and exit, Discard changes, Keep editing) and handles Save as draft and exit", async () => {
    const onConfirm = vi.fn();
    const onDiscard = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmationDialog
        open
        onOpenChange={onOpenChange}
        title="Discard package changes?"
        description="Your unsaved package details, pricing, dishes, themes, and images will be lost if you close this editor."
        confirmLabel="Save as draft and exit"
        cancelLabel="Keep editing"
        destructive={false}
        discardDestructive
        stackedActions
        onConfirm={onConfirm}
        onDiscard={onDiscard}
      />,
    );

    const dialog = screen.getByRole("dialog", {name: "Discard package changes?"});
    const saveBtn = within(dialog).getByRole("button", {name: "Save as draft and exit"});
    const discardBtn = within(dialog).getByRole("button", {name: "Discard changes"});
    const keepBtn = within(dialog).getByRole("button", {name: "Keep editing"});
    expect(saveBtn).toHaveClass("order-1", "w-full", "rounded-full", "bg-primary");
    expect(discardBtn).toHaveClass("order-2", "w-full", "rounded-full", "bg-destructive");
    expect(keepBtn).toHaveClass("order-3", "w-full", "rounded-full");

    fireEvent.click(saveBtn);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    fireEvent.click(discardBtn);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    fireEvent.click(keepBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves incomplete new package progress on device and exits when saveDraftAndExit is invoked", async () => {
    const editorRef = createRef<ProviderPackageEditor>();
    const onProgressExit = vi.fn();
    const storageKey = "feasta:test-local-draft";
    localStorage.removeItem(storageKey);

    render(
      <ProviderPackageForm
        {...props}
        dialogLayout
        editorRef={editorRef}
        localDraftKey={storageKey}
        onProgressExit={onProgressExit}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Halfway Package"}});

    await editorRef.current?.saveDraftAndExit();
    expect(onProgressExit).toHaveBeenCalledTimes(1);
    expect(api.createV2).not.toHaveBeenCalled();
    expect(localStorage.getItem(storageKey)).toContain("Halfway Package");
    localStorage.removeItem(storageKey);
  });

  it("saves a complete draft directly without double confirmation when saveDraftAndExit is invoked", async () => {
    const editorRef = createRef<ProviderPackageEditor>();
    render(<ProviderPackageForm {...props} dialogLayout editorRef={editorRef} initialPackage={existingDraft} />);
    fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Updated Birthday Feast"}});

    await editorRef.current?.saveDraftAndExit();
    await waitFor(() => expect(api.updateV2).toHaveBeenCalledTimes(1));
    expect(api.updateV2).toHaveBeenCalledWith(expect.objectContaining({name: "Updated Birthday Feast"}));
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it("edits a published V2 package in place with Save Changes and does not re-publish or demote to draft", async () => {
    const existingPublished: ProviderPackage = {
      ...existingDraft,
      id: "pkg-live",
      status: "published",
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
    };
    api.updateV2.mockResolvedValueOnce({packageId: "pkg-live", packageRevision: 4, status: "published"});

    render(<ProviderPackageForm {...props} dialogLayout initialPackage={existingPublished} />);
    fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Birthday Feast Deluxe"}});
    next();
    next();
    next();
    next();

    expect(screen.getByRole("button", {name: "Save Changes"})).toBeEnabled();
    expect(screen.queryByRole("button", {name: "Save as Draft"})).toBeNull();
    expect(screen.queryByRole("button", {name: "Publish Package"})).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Saving changes immediately updates your live published package for new bookings",
    );

    fireEvent.click(screen.getByRole("button", {name: "Save Changes"}));
    const dialog = screen.getByRole("dialog", {name: "FEASTA Confirmation"});
    expect(dialog).toHaveTextContent("Save changes to published package?");
    expect(dialog).toHaveTextContent("Existing bookings keep their original package details.");
    fireEvent.click(within(dialog).getByRole("button", {name: "Save Changes"}));

    await waitFor(() => expect(api.updateV2).toHaveBeenCalledTimes(1));
    expect(api.updateV2).toHaveBeenCalledWith(
      expect.objectContaining({packageId: "pkg-live", expectedRevision: 3, name: "Birthday Feast Deluxe"}),
      "published",
    );
    expect(api.publish).not.toHaveBeenCalled();
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it("saves published package edits in place when saveDraftAndExit is invoked", async () => {
    const existingPublished: ProviderPackage = {
      ...existingDraft,
      id: "pkg-live",
      status: "published",
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
    };
    api.updateV2.mockResolvedValueOnce({packageId: "pkg-live", packageRevision: 4, status: "published"});
    const editorRef = createRef<ProviderPackageEditor>();

    render(<ProviderPackageForm {...props} dialogLayout editorRef={editorRef} initialPackage={existingPublished} />);
    fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Live Updated Package"}});

    await editorRef.current?.saveDraftAndExit();
    await waitFor(() => expect(api.updateV2).toHaveBeenCalledTimes(1));
    expect(api.updateV2).toHaveBeenCalledWith(
      expect.objectContaining({packageId: "pkg-live", expectedRevision: 3, name: "Live Updated Package"}),
      "published",
    );
    expect(api.publish).not.toHaveBeenCalled();
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });
});
