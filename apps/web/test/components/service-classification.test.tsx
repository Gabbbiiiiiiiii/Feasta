import {useState} from "react";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import type {AdminServiceCategory} from "@/lib/admin/file-maintenance/admin-service-category-types";
import {serviceClassificationLabel} from "@/lib/service-categories/service-classification-label";
import {PROVIDER_SERVICE_TYPE_OPTIONS} from "@/lib/customer/providers/provider-catalog";

const mutations = vi.hoisted(() => ({
  createAdminServiceCategory: vi.fn(), updateAdminServiceCategory: vi.fn(),
  discontinueAdminServiceCategory: vi.fn(), reactivateAdminServiceCategory: vi.fn(),
  deleteAdminServiceCategory: vi.fn(),
}));
vi.mock("@/lib/admin/file-maintenance/admin-service-category-client", () => mutations);
vi.mock("@/components/feedback/toast", () => ({feastaToast: {success: vi.fn(), error: vi.fn()}}));
import {ServiceCategoryManagementClient} from "@/components/admin/file-maintenance/service-category-management-client";

const categories: AdminServiceCategory[] = [
  {code: "photography", name: "Photography", serviceType: "addon", status: "active", sortName: "photography"},
  {code: "catering_service", name: "Food preparation", serviceType: "catering", status: "active", sortName: "food preparation"},
];
function Harness({initial = categories}: {initial?: AdminServiceCategory[]}) {
  const [items, setItems] = useState(initial);
  return <ServiceCategoryManagementClient categories={items} setCategories={setItems} embedded />;
}

describe("service classification presentation and category behavior", () => {
  beforeEach(() => {vi.clearAllMocks(); mutations.createAdminServiceCategory.mockResolvedValue({}); mutations.updateAdminServiceCategory.mockResolvedValue({});});
  it.each([["catering", "Catering"], ["addon", "Other Event Services"], ["both", "Catering & Other Event Services"]])("labels %s without changing its identifier", (value, label) => {
    expect(serviceClassificationLabel(value)).toBe(label);
    expect(PROVIDER_SERVICE_TYPE_OPTIONS).toContainEqual({value, label});
  });
  it.each(["unknown", "Add-on", "", null, undefined, {}, "toString"])("does not present unknown %s as a valid classification", (value) => {
    expect(serviceClassificationLabel(value)).toBe("Unknown service classification");
  });
  it("offers accessible read-only explanations in a responsive grid", () => {
    render(<Harness />);
    const help = screen.getByRole("region", {name: "Service classifications"});
    expect(within(help).getByText("Classifications are predefined by FEASTA.")).toBeInTheDocument();
    expect(within(help).getByText(/Classification A: Catering/)).toBeInTheDocument();
    expect(within(help).getByText(/Classification B: Other Event Services/)).toBeInTheDocument();
    expect(help.querySelector("dl")).toHaveClass("sm:grid-cols-2", "min-w-0");
    expect(within(help).queryByRole("button")).not.toBeInTheDocument();
    expect(within(help).queryByRole("combobox")).not.toBeInTheDocument();
  });
  it.each(["addon", "catering"] as const)("creates a category with the original %s payload", async (serviceType) => {
    const user = userEvent.setup(); render(<Harness initial={[]} />);
    await user.click(screen.getByRole("button", {name: "Add Service Category"}));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/Category name/), "New service");
    await user.selectOptions(dialog.getByLabelText(/Service classification/), serviceType);
    await user.click(dialog.getByRole("button", {name: "Add Category"}));
    await waitFor(() => expect(mutations.createAdminServiceCategory).toHaveBeenCalledWith(expect.objectContaining({code: "new_service", name: "New service", serviceType, capacityCapabilities: {requiresGuestCapacity: false, usesStaffCapacity: false, usesEquipmentCapacity: false}})));
    expect(screen.getAllByText("New service").length).toBeGreaterThan(0);
  });
  it("filters by persisted classification and restores all categories", async () => {
    const user = userEvent.setup(); render(<Harness />);
    const filter = screen.getByLabelText("Service classification");
    await user.selectOptions(filter, "addon");
    expect(screen.getAllByText("Photography").length).toBeGreaterThan(0);
    expect(screen.queryByText("Food preparation")).not.toBeInTheDocument();
    await user.selectOptions(filter, "catering");
    expect(screen.queryByText("Photography")).not.toBeInTheDocument();
    expect(screen.getAllByText("Food preparation").length).toBeGreaterThan(0);
    await user.selectOptions(filter, "all");
    expect(screen.getAllByText("Photography").length).toBeGreaterThan(0);
  });
  it("edits an active category while preserving its locked classification and code", async () => {
    const user = userEvent.setup(); render(<Harness initial={[categories[0]]} />);
    await user.click(screen.getAllByRole("button", {name: /Edit/})[0]);
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText(/Service classification/)).toBeDisabled();
    expect(dialog.getByLabelText(/Service classification/)).toHaveValue("addon");
    fireEvent.change(dialog.getByLabelText(/Category name/), {target: {value: "New photography"}});
    await user.click(dialog.getByRole("button", {name: "Save Changes"}));
    await waitFor(() => expect(mutations.updateAdminServiceCategory).toHaveBeenCalledWith(expect.objectContaining({code: "photography", serviceType: "addon", name: "New photography"})));
  });
  it("keeps delete and reactivate unavailable for active categories", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", {name: /Delete/})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Reactivate/})).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", {name: /Discontinue/}).length).toBeGreaterThan(0);
  });
  it.each(["Discontinue", "Reactivate", "Delete"])("retains the %s lifecycle callable and state update", async (action) => {
    const user = userEvent.setup();
    render(<Harness initial={[{...categories[0], status: action === "Discontinue" ? "active" : "discontinued"}]} />);
    await user.click(screen.getAllByRole("button", {name: new RegExp(action)})[0]);
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", {name: action}));
    const mutation = action === "Discontinue" ? mutations.discontinueAdminServiceCategory : action === "Reactivate" ? mutations.reactivateAdminServiceCategory : mutations.deleteAdminServiceCategory;
    await waitFor(() => expect(mutation).toHaveBeenCalledWith("photography"));
    if (action === "Delete") await waitFor(() => expect(screen.queryByText("Photography")).not.toBeInTheDocument());
    else await waitFor(() => expect(screen.getAllByRole("button", {name: action === "Discontinue" ? /Reactivate/ : /Discontinue/}).length).toBeGreaterThan(0));
  });
});
