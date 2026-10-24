import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import type {AdminOccasionCatalog} from "@/lib/admin/file-maintenance/admin-occasion-client";

const api = vi.hoisted(() => ({listAdminOccasions: vi.fn(), saveAdminOccasion: vi.fn(),
  previewAdminOccasionImpact: vi.fn(), listOccasionSuggestions: vi.fn(), reviewOccasionSuggestion: vi.fn()}));
vi.mock("@/lib/admin/file-maintenance/admin-occasion-client", () => api);
vi.mock("@/components/admin/file-maintenance/service-category-management-client", () => ({
  ServiceCategoryManagementClient: () => <p>Service categories content</p>,
}));
vi.mock("@/components/admin/file-maintenance/document-catalog-management-client", () => ({
  AgreementTemplateManagement: () => <p>Agreements content</p>,
  BusinessDocumentManagement: () => <p>Business documents content</p>,
}));
import {OccasionManagementClient} from "@/components/admin/file-maintenance/occasion-management-client";
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
  fireEvent.change(within(dialog).getByLabelText("Canonical ID"), {target: {value: "garden_party"}});
  fireEvent.change(within(dialog).getByLabelText("Label", {exact: true}), {target: {value: "Garden Party"}});
  await userEvent.click(within(dialog).getByLabelText("Catering Service"));
  fireEvent.change(within(dialog).getByLabelText("Reason for change"), {target: {value: "Approved administration request"}});
  return dialog;
}
beforeEach(() => {
  vi.clearAllMocks(); api.listAdminOccasions.mockResolvedValue(catalog);
  api.saveAdminOccasion.mockResolvedValue({catalogRevision: 8, occasionRevision: 1});
  api.listOccasionSuggestions.mockResolvedValue({items: [], nextCursor: null});
});
describe("Admin occasion maintenance", () => {
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
    await userEvent.click(screen.getByRole("button", {name: "Retry catalog"})); await ready();
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("shows the empty catalog and permits inactive creation", async () => {
    api.listAdminOccasions.mockResolvedValue({...catalog, items: []}); mount();
    expect(await screen.findByText("No occasions match this view.")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Add Occasion"})).toBeEnabled();
  });
  it("confirms creation and sends exact metadata, revisions and an idempotency key", async () => {
    mount(); await ready(); const dialog = await fillCreate();
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", {name: "Review changes"}));
    expect(screen.getByRole("dialog", {name: "Save occasion metadata?"})).toHaveTextContent("It will remain inactive");
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    await waitFor(() => expect(api.saveAdminOccasion).toHaveBeenCalledTimes(1));
    expect(api.saveAdminOccasion.mock.calls[0]).toEqual([{
      occasion: {id: "garden_party", label: "Garden Party", aliases: [], sortOrder: 0,
        applicableServiceCategoryCodes: ["catering_service"]}, expectedCatalogRevision: 7,
      reason: "Approved administration request", idempotencyKey: expect.any(String),
    }, true]);
  });
  it("retains the idempotency key when an ambiguous failure is retried", async () => {
    api.saveAdminOccasion.mockRejectedValueOnce(new Error("Request interrupted"));
    mount(); await ready(); await fillCreate();
    await userEvent.click(screen.getByRole("button", {name: "Review changes"}));
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Request interrupted");
    await userEvent.click(screen.getByRole("button", {name: "Review changes"}));
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    await waitFor(() => expect(api.saveAdminOccasion).toHaveBeenCalledTimes(2));
    expect(api.saveAdminOccasion.mock.calls[0][0]).toEqual(api.saveAdminOccasion.mock.calls[1][0]);
  });
  it("locks permanent ID and applicability when editing and preserves expected revision", async () => {
    mount(); await ready(); await userEvent.click(screen.getByRole("button", {name: "Edit Birthday"}));
    const dialog = screen.getByRole("dialog", {name: "Edit Occasion"});
    expect(within(dialog).getByLabelText("Canonical ID")).toBeDisabled();
    expect(within(dialog).getByLabelText("Catering Service")).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Label", {exact: true}), {target: {value: "Birthday Celebration"}});
    fireEvent.change(within(dialog).getByLabelText("Reason for change"), {target: {value: "Update occasion label"}});
    await userEvent.click(within(dialog).getByRole("button", {name: "Review changes"}));
    await userEvent.click(screen.getByRole("button", {name: "Save occasion"}));
    await waitFor(() => expect(api.saveAdminOccasion).toHaveBeenCalledWith(expect.objectContaining({expectedOccasionRevision: 2}), false));
  });
  it("protects dirty dialogs from accidental dismissal", async () => {
    mount(); await ready(); const dialog = await fillCreate();
    await userEvent.click(within(dialog).getByRole("button", {name: "Cancel"}));
    expect(screen.getByRole("dialog", {name: "Discard unsaved changes?"})).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name: "Discard changes"}));
    await waitFor(() => expect(screen.queryByRole("dialog", {name: "Add Occasion"})).not.toBeInTheDocument());
    expect(api.saveAdminOccasion).not.toHaveBeenCalled();
  });
  it("keeps lifecycle controls disabled and displays read-only impact with truncation", async () => {
    api.previewAdminOccasionImpact.mockResolvedValue({occasionId: "wedding", occasionRevision: 3,
      catalogRevision: 7, operation: "deactivate", allowed: false, mappings: [],
      usage: [{collection: "packages", potentialReferences: 5, scanned: 500, truncated: true}],
      blockers: ["Withdrawal not verified"], disclaimer: "Potential references only"});
    mount(); await ready(); expect(screen.getByRole("button", {name: "Deactivate"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Activate"})).toBeDisabled();
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
    expect(screen.getByText("Service categories content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", {name: "Agreements"})); expect(screen.getByText("Agreements content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", {name: "Business documents"})); expect(screen.getByText("Business documents content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", {name: "Event Types / Occasions"})); await ready(); await fillCreate();
    fireEvent.click(document.getElementById("file-maintenance-tab-service-categories")!);
    expect(confirm).toHaveBeenCalledWith("Discard unsaved occasion changes?");
    expect(screen.getByRole("dialog", {name: "Add Occasion"})).toBeInTheDocument();
    // Close via explicit discard, then confirm all tabs still exist.
    await userEvent.click(screen.getByRole("button", {name: "Cancel"}));
    await userEvent.click(screen.getByRole("button", {name: "Discard changes"}));
    await userEvent.click(screen.getByRole("tab", {name: "Service categories"}));
    expect(screen.getByText("Service categories content")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });
});
