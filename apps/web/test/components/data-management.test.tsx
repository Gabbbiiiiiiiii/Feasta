import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import {
  ChartContainer,
  CursorPagination,
  DataTable,
  DetailDrawer,
  FilterToolbar,
  ManagementModal,
  SummaryCard,
  type DataTableColumn,
} from "@/components/data";
import {FormField} from "@/components/forms/form-field";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";

type Row = {id: string; name: string; status: string};
const rows: readonly Row[] = [
  {id: "one", name: "Alpha Catering", status: "approved"},
  {id: "two", name: "Beta Events", status: "submitted"},
];
const columns: readonly DataTableColumn<Row>[] = [
  {id: "name", header: "Name", sortable: true, cell: (row) => row.name},
  {id: "status", header: "Status", cell: (row) => row.status},
];

describe("DataTable", () => {
  it("renders typed rows, controlled sorting, row actions, and overflow semantics", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const inspect = vi.fn();
    const {container} = render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        caption="Provider results"
        sort={{columnId: "name", direction: "ascending"}}
        onSortChange={onSortChange}
        rowActions={(row) => <Button onClick={() => inspect(row.id)}>Inspect {row.name}</Button>}
      />,
    );
    expect(screen.getByRole("table", {name: "Provider results"})).toBeVisible();
    expect(screen.getByRole("columnheader", {name: /Name/})).toHaveAttribute("aria-sort", "ascending");
    await user.click(screen.getByRole("button", {name: "Sort by Name"}));
    expect(onSortChange).toHaveBeenCalledWith({columnId: "name", direction: "descending"});
    await user.click(screen.getByRole("button", {name: "Inspect Alpha Catering"}));
    expect(inspect).toHaveBeenCalledWith("one");
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("supports an explicit mobile row alternative", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        caption="Responsive results"
        renderMobileRow={(row) => <article>{row.name} mobile</article>}
      />,
    );
    expect(screen.getByLabelText("Responsive results, mobile view")).toHaveClass("md:hidden");
    expect(screen.getByRole("table", {name: "Responsive results"}).parentElement).toHaveClass("hidden", "md:block");
  });

  it("renders loading, empty, and retryable error states", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const {rerender} = render(
      <DataTable columns={columns} rows={[]} getRowId={(row) => row.id} caption="Records" loading />,
    );
    expect(screen.getByLabelText("Loading Records")).toBeVisible();

    rerender(<DataTable columns={columns} rows={[]} getRowId={(row) => row.id} caption="Records" />);
    expect(screen.getByRole("heading", {name: "No results"})).toBeVisible();

    rerender(
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(row) => row.id}
        caption="Records"
        error="Network unavailable"
        onRetry={retry}
      />,
    );
    expect(screen.getByText("Network unavailable")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Try again"}));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("cursor pagination and filters", () => {
  it("moves through supplied cursors using the keyboard and respects disabled state", async () => {
    const user = userEvent.setup();
    const previous = vi.fn();
    const next = vi.fn();
    render(
      <CursorPagination
        previousCursor={null}
        nextCursor="next-token"
        onPrevious={previous}
        onNext={next}
        pageLabel="Page 1"
      />,
    );
    expect(screen.getByRole("button", {name: /Previous/})).toBeDisabled();
    const nextButton = screen.getByRole("button", {name: /Next/});
    nextButton.focus();
    await user.keyboard("{Enter}");
    expect(next).toHaveBeenCalledWith("next-token");
    expect(screen.getByText("Page 1")).toHaveAttribute("aria-live", "polite");
  });

  it("submits global search intent, summarizes filters, and clears them", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const onSearchSubmit = vi.fn();
    const onClear = vi.fn();
    render(
      <FilterToolbar
        searchValue="catering"
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        onClearFilters={onClear}
        activeFilters={["Status: approved"]}
        filterControls={
          <Select aria-label="Status filter"><option>Approved</option></Select>
        }
      />,
    );
    expect(screen.getByText("Active filters: Status: approved")).toBeVisible();
    expect(screen.getByLabelText("Filter records")).toHaveClass("grid");
    await user.click(screen.getByRole("button", {name: "Search"}));
    expect(onSearchSubmit).toHaveBeenCalledWith("catering");
    await user.click(screen.getByRole("button", {name: "Clear filters"}));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe("drawer and modal", () => {
  it("traps focus in the detail drawer and restores it after Escape", async () => {
    const user = userEvent.setup();
    render(
      <DetailDrawer
        title="Provider details"
        description="Review this provider"
        trigger={<Button>Inspect provider</Button>}
      >
        <Button>Drawer action</Button>
      </DetailDrawer>,
    );
    const trigger = screen.getByRole("button", {name: "Inspect provider"});
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", {name: "Provider details"});
    expect(dialog).toBeVisible();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows modal server errors and submits through its form", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(
      <ManagementModal
        title="Edit package"
        description="Update package details"
        error="The package could not be saved."
        onSubmit={submit}
        trigger={<Button>Edit package</Button>}
      >
        <FormField label="Package name"><Input /></FormField>
      </ManagementModal>,
    );
    await user.click(screen.getByRole("button", {name: "Edit package"}));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
    await user.click(screen.getByRole("button", {name: "Save"}));
    expect(submit).toHaveBeenCalledOnce();
  });
});

describe("summary and chart containers", () => {
  it("hides uncomputed trends and provides responsive loading", () => {
    const {rerender} = render(<SummaryCard label="Revenue" value="₱1,000" />);
    expect(screen.getByLabelText("Revenue")).not.toHaveTextContent("Trend");
    rerender(<SummaryCard label="Revenue" loading trend={{label: "10%", direction: "up"}} />);
    expect(screen.getByLabelText("Loading Revenue")).toBeVisible();
    expect(screen.queryByText("10%")).not.toBeInTheDocument();
  });

  it("renders chart loading, empty, error, and accessible fallback summary", () => {
    const {rerender} = render(
      <ChartContainer title="Bookings" description="Bookings per month" fallbackSummary="Bookings chart is loading." loading />,
    );
    expect(screen.getByLabelText("Loading Bookings chart")).toBeVisible();
    rerender(<ChartContainer title="Bookings" description="Bookings per month" fallbackSummary="No bookings are available." empty />);
    expect(screen.getByRole("heading", {name: "No chart data"})).toBeVisible();
    rerender(
      <ChartContainer
        title="Bookings"
        description="Bookings per month"
        error="Reporting unavailable"
        fallbackSummary="Five bookings in the selected range."
      />,
    );
    expect(screen.getByText("Reporting unavailable")).toBeVisible();
    expect(screen.getByText("Five bookings in the selected range.")).toBeVisible();
  });
});
