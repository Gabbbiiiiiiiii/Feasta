import {render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/providers",
  useRouter: () => ({replace: vi.fn(), refresh: vi.fn()}),
}));
vi.mock("@/lib/auth/client-session", () => ({logoutWebSession: vi.fn().mockResolvedValue(undefined)}));

import {ChartContainer, DataTable, DetailDrawer, FilterToolbar, ManagementModal, SummaryCard, type DataTableColumn} from "@/components/data";
import {FormField} from "@/components/forms/form-field";
import {ApplicationShell} from "@/components/layout/application-shell";
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";

const widths = [360, 390, 600, 768, 900, 1024, 1280, 1440] as const;

describe.each(widths)("responsive management layout at %i px", (width) => {
  it("keeps shared content bounded and overflow local", () => {
    Object.defineProperty(window, "innerWidth", {configurable: true, value: width});
    window.dispatchEvent(new Event("resize"));
    type Row = {id: string; name: string};
    const columns: DataTableColumn<Row>[] = [
      {id: "name", header: "Provider business name", cell: (row) => row.name},
      {id: "location", header: "Service location", cell: () => "A deliberately long service location"},
    ];
    render(
      <ApplicationShell role="admin" accountLabel="admin@feasta.test">
        <PageHeading title="Provider management with a long responsive heading" actions={<><Button>Approve selected provider</Button><Button variant="secondary">Export current page</Button></>} />
        <FilterToolbar searchValue="" onSearchChange={() => undefined} onSearchSubmit={() => undefined} onClearFilters={() => undefined} filterControls={<Select aria-label="Status"><option>All statuses</option></Select>} />
        <div className="grid gap-4 sm:grid-cols-2"><SummaryCard label="Providers requiring verification" value="1,234" /><SummaryCard label="Approved providers" value="9,876" /></div>
        <DataTable columns={columns} rows={[{id: "1", name: "A very long provider business name that remains in its table cell"}]} getRowId={(row) => row.id} caption="Responsive provider records" />
        <ChartContainer title="Provider activity" description="Monthly provider activity" fallbackSummary="Provider activity remains stable for the selected range."><div className="w-[48rem]" aria-hidden="true">Chart</div></ChartContainer>
      </ApplicationShell>,
    );

    expect(screen.getByRole("main")).toHaveClass("min-w-0", "max-w-7xl");
    expect(screen.getByRole("table", {name: "Responsive provider records"}).parentElement).toHaveClass("max-w-full", "overflow-x-auto");
    expect(screen.getByLabelText("Admin sidebar")).toHaveClass("md:flex");
    expect(screen.getByRole("navigation", {name: "Admin mobile navigation"})).toHaveClass("md:hidden");
    expect(screen.getByRole("heading", {level: 1})).toHaveClass("break-words");
  });
});

describe("responsive overlays and forms", () => {
  it("keeps drawers overlaid and viewport-bounded", () => {
    render(<DetailDrawer open onOpenChange={() => undefined} title="Provider details" description="Inspect provider"><p>Details</p></DetailDrawer>);
    expect(screen.getByRole("dialog", {name: "Provider details"})).toHaveClass("right-0", "w-[min(100vw,32rem)]", "max-w-[100vw]", "overflow-x-hidden");
  });

  it("keeps modal forms readable and actions stackable", () => {
    render(<ManagementModal open onOpenChange={() => undefined} title="Edit package" description="Update package" onSubmit={() => undefined}><FormField label="Package name"><Input /></FormField></ManagementModal>);
    const dialog = screen.getByRole("dialog", {name: "Edit package"});
    expect(within(dialog).getByLabelText("Package name")).toHaveClass("w-full");
    expect(within(dialog).getByRole("button", {name: "Save"}).parentElement).toHaveClass("flex-col-reverse", "sm:flex-row");
  });
});
