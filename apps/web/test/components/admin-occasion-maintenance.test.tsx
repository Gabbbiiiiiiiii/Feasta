import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import type {AdminOccasionCatalog} from "@/lib/admin/file-maintenance/admin-occasion-client";

const api = vi.hoisted(() => ({listAdminOccasions: vi.fn(), saveAdminOccasion: vi.fn(),
  previewAdminOccasionImpact: vi.fn(), listOccasionSuggestions: vi.fn(), reviewOccasionSuggestion: vi.fn(),
  checkAdminOccasionActivationReadiness: vi.fn(), checkAdminOccasionDeactivationReadiness: vi.fn(),
  inspectAdminOccasionAtomicReadiness: vi.fn(), changeAdminOccasionState: vi.fn()}));
vi.mock("@/lib/admin/file-maintenance/admin-occasion-client", () => api);
vi.mock("@/components/admin/file-maintenance/service-category-management-client", () => ({
  ServiceCategoryManagementClient: () => <p>Service categories content</p>,
}));
vi.mock("@/components/admin/file-maintenance/document-catalog-management-client", () => ({
  AgreementTemplateManagement: () => <p>Agreements content</p>,
  BusinessDocumentManagement: () => <p>Business documents content</p>,
}));
import {generateOccasionId, OccasionManagementClient} from "@/components/admin/file-maintenance/occasion-management-client";
import {FileMaintenanceClient} from "@/components/admin/file-maintenance/file-maintenance-client";

const categories = [{code: "catering_service", name: "Catering Service", status: "active" as const,
  serviceType: "catering" as const, sortName: "catering service"}];
const catalog: AdminOccasionCatalog = {revision: 7, lifecycleAvailable: false, items: [
  {id: "wedding", label: "Wedding", normalizedName: "wedding", aliases: [], active: true,
    moderationState: "approved", applicableServiceCategoryCodes: ["catering_service"], revision: 3, sortOrder: 1},
  {id: "birthday", label: "Birthday", normalizedName: "birthday", aliases: ["Birthday Party"], active: false,
    moderationState: "approved", applicableServiceCategoryCodes: ["catering_service"], revision: 2, sortOrder: 2},
]};
const dirty = vi.fn();
function mount() {return render(<OccasionManagementClient categories={categories} onDirtyChange={dirty} />);}
async function ready() {await screen.findByRole("button", {name: "Edit Wedding"});}
async function fillCreate() {
  await userEvent.click(screen.getByRole("button", {name: "Add Occasion"}));
  const dialog = screen.getByRole("dialog", {name: "Add Occasion"});
  fireEvent.change(within(dialog).getByLabelText("Event Type Name", {exact: true}), {target: {value: "Garden Party"}});
  await userEvent.click(within(dialog).getByLabelText("Catering Service"));
  fireEvent.change(within(dialog).getByLabelText("Reason for adding"), {target: {value: "Approved administration request"}});
  return dialog;
}
beforeEach(() => {
  vi.clearAllMocks(); api.listAdminOccasions.mockResolvedValue(catalog);
  api.inspectAdminOccasionAtomicReadiness.mockRejectedValue(
    Object.assign(
      new Error("Atomic readiness endpoint unavailable"),
      {code: "functions/not-found"},
    ));
  api.saveAdminOccasion.mockResolvedValue({catalogRevision: 8, occasionRevision: 1});
  api.listOccasionSuggestions.mockResolvedValue({items: [], nextCursor: null});
});
describe("Admin occasion maintenance", () => {
  it("checks deactivation with server authority and preserves its blockers", async () => {
    api.inspectAdminOccasionAtomicReadiness.mockResolvedValue({occasionId: "wedding", status: "BLOCKED",
      lifecycleAvailable: false, occasionRevision: 3, catalogRevision: 7, blockers: ["WITHDRAWAL"],
      checks: [{code: "WITHDRAWAL", status: "BLOCKED", message: "Withdrawal must be verified."}]});
    mount(); await ready();
    await userEvent.click(screen.getByRole("button", {name: "Check Deactivation Readiness for Wedding"}));
    const dialog = screen.getByRole("dialog", {name: "Deactivation readiness: Wedding"});
    expect(await within(dialog).findByText("Withdrawal must be verified.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", {name: "Deactivate"})).toBeDisabled();
    expect(api.inspectAdminOccasionAtomicReadiness).toHaveBeenCalledWith({occasionId: "wedding", action: "deactivate",
      expectedOccasionRevision: 3, expectedCatalogRevision: 7});
    expect(api.changeAdminOccasionState).not.toHaveBeenCalled();
  });
  it("shows server-verified checks and blockers without enabling activation", async () => {
    api.checkAdminOccasionActivationReadiness.mockResolvedValue({occasionId: "birthday", status: "BLOCKED",
      lifecycleAvailable: false, occasionRevision: 2, catalogRevision: 7, blockers: ["WITHDRAWAL"],
      checks: [{code: "IDENTITY", status: "SATISFIED", message: "Approved occasion identity verified."},
        {code: "WITHDRAWAL", status: "BLOCKED", message: "Customer withdrawal protection still required."}]});
    mount(); await ready();
    await userEvent.click(screen.getByRole("button", {name: "Check Activation Readiness for Birthday"}));
    const dialog = screen.getByRole("dialog", {name: "Activation readiness: Birthday"});
    expect(await within(dialog).findByText("Approved occasion identity verified.")).toBeInTheDocument();
    expect(within(dialog).getByText("Customer withdrawal protection still required.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", {name: "Activate"})).toBeDisabled();
    expect(api.checkAdminOccasionActivationReadiness).toHaveBeenCalledWith({occasionId: "birthday",
      expectedOccasionRevision: 2, expectedCatalogRevision: 7});
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("keeps activation disabled when the readiness API is unavailable", async () => {
    api.checkAdminOccasionActivationReadiness.mockRejectedValue(new Error("The occasion service is currently unavailable."));
    mount(); await ready();
    await userEvent.click(screen.getByRole("button", {name: "Check Activation Readiness for Birthday"}));
    const dialog = screen.getByRole("dialog", {name: "Activation readiness: Birthday"});
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Readiness could not be verified");
    expect(within(dialog).getByRole("button", {name: "Activate"})).toBeDisabled();
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("legacy readiness cannot authorize atomic activation", async () => {
    api.checkAdminOccasionActivationReadiness.mockResolvedValue({
      occasionId: "birthday",
      status: "ELIGIBLE_FOR_TRANSACTION",
      lifecycleAvailable: true,
      occasionRevision: 2,
      catalogRevision: 7,
      blockers: [],
      checks: [
        {code: "APPROVED_OCCASION", status: "SATISFIED", message: "Approved."}
      ],
    });

    mount();
    await ready();

    await userEvent.click(screen.getByRole("button", {
      name: "Check Activation Readiness for Birthday"
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Activation readiness: Birthday"
    });

    expect(await within(dialog).findByText("Approved.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", {
      name: "Activate"
    })).toBeDisabled();

    expect(within(dialog).queryByLabelText(
      "Lifecycle reason"
    )).not.toBeInTheDocument();

    expect(api.changeAdminOccasionState).not.toHaveBeenCalled();
    expect(api.inspectAdminOccasionAtomicReadiness).toHaveBeenCalledWith({
      action: "activate", occasionId: "birthday",
      expectedOccasionRevision: 2, expectedCatalogRevision: 7});
  });
  it("executes eligible atomic activation only after atomic readiness", async () => {
    api.inspectAdminOccasionAtomicReadiness.mockResolvedValue({
      occasionId: "birthday", action: "activate",
      status: "ELIGIBLE_FOR_TRANSACTION", lifecycleAvailable: true,
      occasionRevision: 2, catalogRevision: 7, blockers: [],
      checks: [{code: "APPROVED_OCCASION",
        status: "SATISFIED", message: "Approved."}],
      packageCount: 2, galleryCount: 1,
      affectedPackages: 1, affectedGallerySetups: 1,
    });
    api.changeAdminOccasionState.mockResolvedValue({
      operationId: "op", state: "completed",
      occasionId: "birthday", action: "activate", active: true,
      occasionRevision: 3, catalogRevision: 8,
      withdrawnPackageIds: ["affected"],
      withdrawnGallerySetupIds: ["setup"], idempotentReplay: false,
    });

    mount();
    await ready();

    await userEvent.click(screen.getByRole("button", {
      name: "Check Activation Readiness for Birthday"
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Activation readiness: Birthday"
    });
    expect(await within(dialog).findByText("Approved.")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Lifecycle reason"), {
      target: {value: "Approved by administrator after inventory review"}
    });

    await userEvent.click(within(dialog).getByRole("button", {
      name: "Activate"
    }));
    await userEvent.click(screen.getByRole("button", {
      name: "Activate occasion"
    }));

    await waitFor(() => expect(api.changeAdminOccasionState)
      .toHaveBeenCalledWith("activate", expect.objectContaining({
        occasionId: "birthday",
        expectedOccasionRevision: 2,
        expectedCatalogRevision: 7,
        idempotencyKey: expect.any(String),
      })));

    expect(api.checkAdminOccasionActivationReadiness).not.toHaveBeenCalled();
  });
  it.each([
    ["Corporate Event", "corporate_event"], ["Caf\u00e9 Party!", "cafe_party"],
    ["  Garden -- Party  ", "garden_party"], ["\u751f\u65e5", ""], ["!!!", ""], ["1 Party", "1_party"],
  ])("normalizes %s deterministically", (name, id) => {
    expect(generateOccasionId(name)).toBe(id);
  });
  it.each(["Close dialog", "Cancel", "Escape", "outside"])("closes an untouched editor using %s", async (action) => {
    mount(); await ready(); await userEvent.click(screen.getByRole("button", {name: "Add Occasion"}));
    const dialog = screen.getByRole("dialog", {name: "Add Occasion"});
    if (action === "Escape") await userEvent.keyboard("{Escape}");
    else if (action === "outside") {await userEvent.click(dialog.previousElementSibling!);}
    else await userEvent.click(within(dialog).getByRole("button", {name: action}));
    await waitFor(() => expect(screen.queryByRole("dialog", {name: "Add Occasion"})).not.toBeInTheDocument());
  });
  it.each(["Close dialog", "Cancel", "Escape", "outside"])("protects the draft using %s and restores editing focus", async (action) => {
    mount(); await ready(); const dialog = await fillCreate();
    if (action === "Escape") await userEvent.keyboard("{Escape}");
    else if (action === "outside") await userEvent.click(dialog.previousElementSibling!);
    else await userEvent.click(within(dialog).getByRole("button", {name: action}));
    expect(screen.getByRole("dialog", {name: "Discard unsaved changes?"})).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name: "Keep Editing"}));
    expect(screen.getByLabelText("Event Type Name")).toHaveValue("Garden Party");
    await waitFor(() => expect(screen.getByLabelText("Event Type Name")).toHaveFocus());
    await userEvent.click(within(dialog).getByRole("button", {name: "Close dialog"}));
    await userEvent.click(screen.getByRole("button", {name: "Discard Changes"}));
    await userEvent.click(screen.getByRole("button", {name: "Add Occasion"}));
    expect(screen.getByLabelText("Event Type Name")).toHaveValue("");
    expect(screen.getByLabelText("Reason for adding")).toHaveValue("");
    expect(screen.getByLabelText("Catering Service")).not.toBeChecked();
  });
  it("rejects collisions and invalid generated IDs and preserves an intentional override", async () => {
    mount(); await ready(); await userEvent.click(screen.getByRole("button", {name: "Add Occasion"}));
    fireEvent.change(screen.getByLabelText("Event Type Name"), {target: {value: "Wedding"}});
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    fireEvent.change(screen.getByLabelText("Event Type Name"), {target: {value: "\u751f\u65e5"}});
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid permanent ID");
    await userEvent.click(screen.getByText("Advanced options"));
    fireEvent.change(screen.getByLabelText("Canonical ID override"), {target: {value: "custom_event"}});
    fireEvent.change(screen.getByLabelText("Event Type Name"), {target: {value: "Garden Party"}});
    expect(screen.getByLabelText("Canonical ID override")).toHaveValue("custom_event");
    expect(screen.getByText("custom_event", {selector: "code"})).toBeInTheDocument();
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("requires an active service and safe sort order before review", async () => {
    mount(); await ready(); const dialog = await fillCreate();
    await userEvent.click(screen.getByLabelText("Catering Service"));
    fireEvent.submit(dialog.querySelector("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("active service category");
    await userEvent.click(screen.getByLabelText("Catering Service"));
    fireEvent.change(screen.getByLabelText("Sort order"), {target: {value: "9007199254740992"}});
    fireEvent.submit(dialog.querySelector("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("safe integer");
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("blocks dismissal throughout an in-flight save", async () => {
    let finish!: () => void;
    api.saveAdminOccasion.mockImplementation(() => new Promise<void>((resolve) => {finish = resolve;}));
    mount(); await ready(); await fillCreate();
    await userEvent.click(screen.getByRole("button", {name: "Review Occasion"}));
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", {name: "Save occasion metadata?"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Cancel"})).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("uses only active categories and never preselects them", async () => {
    render(<OccasionManagementClient categories={[...categories, {...categories[0], code: "retired_service", name: "Retired Service", status: "discontinued"}]} onDirtyChange={dirty} />);
    await ready(); await userEvent.click(screen.getByRole("button", {name: "Add Occasion"}));
    expect(screen.getByLabelText("Catering Service")).not.toBeChecked();
    expect(screen.queryByLabelText("Retired Service")).not.toBeInTheDocument();
    expect(screen.getByText("Advanced options").parentElement).not.toHaveAttribute("open");
  });
  it("sends explicit advanced metadata without changing the mutation shape", async () => {
    mount(); await ready(); await fillCreate();
    await userEvent.click(screen.getByText("Advanced options"));
    fireEvent.change(screen.getByLabelText("Canonical ID override"), {target: {value: "garden_festival"}});
    fireEvent.change(screen.getByLabelText("Aliases (comma separated)"), {target: {value: "Garden Gathering"}});
    fireEvent.change(screen.getByLabelText("Sort order"), {target: {value: "42"}});
    await userEvent.click(screen.getByRole("button", {name: "Review Occasion"}));
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    await waitFor(() => expect(api.saveAdminOccasion).toHaveBeenCalledWith(expect.objectContaining({
      occasion: {id: "garden_festival", label: "Garden Party", aliases: ["Garden Gathering"], sortOrder: 42,
        applicableServiceCategoryCodes: ["catering_service"]}, expectedCatalogRevision: 7,
    }), true));
  });
  it("loads active and inactive records, filters by ID and status, and sorts names", async () => {
    mount(); expect(screen.getByRole("status")).toHaveTextContent("Loading occasions"); await ready();
    expect(screen.getByText("Inactive", {selector: "span"})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sort occasions"), {target: {value: "name"}});
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Birthday");
    fireEvent.change(screen.getByLabelText("Search occasions"), {target: {value: "wedding"}});
    expect(screen.queryByRole("button", {name: "Edit Birthday"})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Occasion status"), {target: {value: "inactive"}});
    expect(screen.getByText("No occasions match this view.")).toBeInTheDocument();
  });
  it("shows errors with retry and recovers without a write", async () => {
    api.listAdminOccasions.mockRejectedValueOnce(new Error("Catalog unavailable")); mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Catalog unavailable");
    expect(screen.getByRole("button", {name: "Add Occasion"})).toBeDisabled();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name: "Retry catalog"})); await ready();
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("removes stale records and disables creation after a failed refresh", async () => {
    mount(); await ready();
    api.listAdminOccasions.mockRejectedValueOnce(new Error("Service unavailable"));
    await userEvent.click(screen.getByRole("button", {name: "Refresh catalog"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
    expect(screen.getByRole("button", {name: "Add Occasion"})).toBeDisabled();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText("No occasions match this view.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name: "Retry catalog"})); await ready();
    expect(screen.getByRole("button", {name: "Add Occasion"})).toBeEnabled();
  });
  it("shows the empty catalog and permits inactive creation", async () => {
    api.listAdminOccasions.mockResolvedValue({...catalog, items: []}); mount();
    expect(await screen.findByText("No occasions match this view.")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Add Occasion"})).toBeEnabled();
  });
  it("confirms creation and sends exact metadata, revisions and an idempotency key", async () => {
    mount(); await ready(); const dialog = await fillCreate();
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", {name: /Review Occasion|Review changes/}));
    expect(screen.getByRole("dialog", {name: "Save occasion metadata?"})).toHaveTextContent("It will remain inactive");
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    await waitFor(() => expect(api.saveAdminOccasion).toHaveBeenCalledTimes(1));
    expect(api.saveAdminOccasion.mock.calls[0]).toEqual([{
      occasion: {id: "garden_party", label: "Garden Party", aliases: [], sortOrder: 3,
        applicableServiceCategoryCodes: ["catering_service"]}, expectedCatalogRevision: 7,
      reason: "Approved administration request", idempotencyKey: expect.any(String),
    }, true]);
  });
  it("retains the idempotency key when an ambiguous failure is retried", async () => {
    api.saveAdminOccasion.mockRejectedValueOnce(new Error("Request interrupted"));
    mount(); await ready(); await fillCreate();
    await userEvent.click(screen.getByRole("button", {name: /Review Occasion|Review changes/}));
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Request interrupted");
    await userEvent.click(screen.getByRole("button", {name: /Review Occasion|Review changes/}));
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    await waitFor(() => expect(api.saveAdminOccasion).toHaveBeenCalledTimes(2));
    expect(api.saveAdminOccasion.mock.calls[0][0]).toEqual(api.saveAdminOccasion.mock.calls[1][0]);
  });
  it("locks permanent ID and applicability when editing and preserves expected revision", async () => {
    mount(); await ready(); await userEvent.click(screen.getByRole("button", {name: "Edit Birthday"}));
    const dialog = screen.getByRole("dialog", {name: "Edit Occasion"});
    expect(within(dialog).getByLabelText("Canonical ID")).toBeDisabled();
    expect(within(dialog).getByLabelText("Catering Service")).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Event Type Name", {exact: true}), {target: {value: "Birthday Celebration"}});
    fireEvent.change(within(dialog).getByLabelText("Reason for change"), {target: {value: "Update occasion label"}});
    await userEvent.click(within(dialog).getByRole("button", {name: /Review Occasion|Review changes/}));
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    await waitFor(() => expect(api.saveAdminOccasion).toHaveBeenCalledWith(expect.objectContaining({expectedOccasionRevision: 2, occasion: expect.objectContaining({id: "birthday", aliases: ["Birthday Party"], sortOrder: 2})}), false));
  });
  it("protects dirty dialogs from accidental dismissal", async () => {
    mount(); await ready(); const dialog = await fillCreate();
    await userEvent.click(within(dialog).getByRole("button", {name: "Cancel"}));
    expect(screen.getByRole("dialog", {name: "Discard unsaved changes?"})).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name: "Discard Changes"}));
    await waitFor(() => expect(screen.queryByRole("dialog", {name: "Add Occasion"})).not.toBeInTheDocument());
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("keeps lifecycle controls disabled and displays read-only impact with truncation", async () => {
    api.previewAdminOccasionImpact.mockResolvedValue({occasionId: "wedding", occasionRevision: 3,
      catalogRevision: 7, operation: "deactivate", allowed: false, mappings: [],
      usage: [{collection: "packages", potentialReferences: 5, scanned: 500, truncated: true}],
      blockers: ["Withdrawal not verified"], disclaimer: "Potential references only"});
    mount(); await ready(); expect(screen.getByRole("button", {name: "Deactivate"})).toBeEnabled();
    expect(screen.getByRole("button", {name: "Activate"})).toBeEnabled();
    await userEvent.click(screen.getByRole("button", {name: "Impact preview for Wedding"}));
    await userEvent.click(screen.getByRole("button", {name: "Inspect impact"}));
    expect(await screen.findByText(/5 potential references in 500 scanned records/)).toHaveTextContent("scan truncated");
    expect(screen.getByRole("button", {name: /Apply lifecycle change/})).toBeDisabled();
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("submits a proposed applicability preview without any metadata write", async () => {
    api.previewAdminOccasionImpact.mockRejectedValue(new Error("Preview unavailable"));
    mount(); await ready(); await userEvent.click(screen.getByRole("button", {name: "Impact preview for Wedding"}));
    fireEvent.change(screen.getByLabelText("Proposed operation"), {target: {value: "applicability"}});
    await userEvent.click(screen.getByRole("button", {name: "Inspect impact"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Preview unavailable");
    expect(api.previewAdminOccasionImpact).toHaveBeenCalledWith({occasionId: "wedding", expectedOccasionRevision: 3,
      expectedCatalogRevision: 7, operation: "applicability", applicableServiceCategoryCodes: ["catering_service"]});
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("reuses pending suggestion paging and review with no catalog activation", async () => {
    api.listOccasionSuggestions.mockResolvedValueOnce({items: [{suggestionId: "s1", name: "Birthday idea", revision: 4}], nextCursor: "next"});
    api.reviewOccasionSuggestion.mockResolvedValue({status: "rejected"});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(); await ready(); await userEvent.click(screen.getByRole("button", {name: "Review provider suggestions"}));
    await userEvent.click(await screen.findByRole("button", {name: "Review Birthday idea"}));
    fireEvent.change(screen.getByLabelText("Review reason"), {target: {value: "Duplicate suggestion"}});
    await userEvent.click(screen.getByRole("button", {name: "Submit review"}));
    await waitFor(() => expect(api.reviewOccasionSuggestion).toHaveBeenCalledWith({suggestionId: "s1",
      expectedRevision: 4, expectedCatalogRevision: 7, reason: "Duplicate suggestion", decision: "reject", idempotencyKey: expect.any(String)}));
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("retains all existing tabs and guards switching away from unsaved occasion changes", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FileMaintenanceClient initialCategories={categories} initialAgreements={[]} initialBusinessDocuments={[]} />);
    expect(screen.getByRole("heading", {name: "File Maintenance"})).toBeInTheDocument();
    expect(screen.getByRole("tablist", {name: "File Maintenance sections"})).toBeInTheDocument();
    expect(screen.getByText("Service categories content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", {name: "Agreements"})); expect(screen.getByText("Agreements content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", {name: "Business documents"})); expect(screen.getByText("Business documents content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", {name: "Event Types / Occasions"})); await ready(); await fillCreate();
    fireEvent.click(document.getElementById("file-maintenance-tab-service-categories")!);
    expect(confirm).toHaveBeenCalledWith("Discard unsaved occasion changes?");
    expect(screen.getByRole("dialog", {name: "Add Occasion"})).toBeInTheDocument();
    // Close via explicit discard, then confirm all tabs still exist.
    await userEvent.click(screen.getByRole("button", {name: "Cancel"}));
    await userEvent.click(screen.getByRole("button", {name: "Discard Changes"}));
    await userEvent.click(screen.getByRole("tab", {name: "Service categories"}));
    expect(screen.getByText("Service categories content")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });
});
