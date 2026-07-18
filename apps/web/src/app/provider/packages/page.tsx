"use client";

import {PackageOpen, Plus} from "lucide-react";
import {useState} from "react";

import {
  ChartContainer,
  CursorPagination,
  DataTable,
  FilterToolbar,
  ManagementModal,
  SummaryCard,
  type DataTableColumn,
} from "@/components/data";
import {FormField} from "@/components/forms/form-field";
import {PageHeading} from "@/components/layout/page-heading";
import {PriceDisplay} from "@/components/shared/price-display";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

type PackageRow = {
  id: string;
  name: string;
  price: number;
  status: string;
};

const columns: readonly DataTableColumn<PackageRow>[] = [
  {id: "name", header: "Package", sortable: true, cell: (row) => row.name},
  {id: "price", header: "Price", sortable: true, cell: (row) => <PriceDisplay amount={row.price} />},
  {id: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} />},
];

export default function ProviderPackagesPage() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const rows: readonly PackageRow[] = [];

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Provider management"
        title="Packages"
        description="Manage package availability and pricing through cursor-paginated results."
        actions={
          <ManagementModal
            title="Create package"
            description="Package persistence will be connected to the trusted provider workflow."
            onSubmit={() => undefined}
            trigger={<Button><Plus aria-hidden="true" />New package</Button>}
          >
            <FormField label="Package name" required>
              <Input autoComplete="off" />
            </FormField>
          </ManagementModal>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard label="Packages on this page" value={rows.length} icon={<PackageOpen className="size-6" />} />
        <SummaryCard label="Available on this page" value={rows.filter((row) => row.status === "active").length} />
      </div>
      <ChartContainer
        title="Package views"
        description="Views for the selected server-provided reporting range."
        empty
        fallbackSummary="No package-view data is available for the selected range."
      />
      <FilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={setSubmittedSearch}
        onClearFilters={() => {
          setSearch("");
          setSubmittedSearch("");
        }}
        activeFilters={submittedSearch ? [`Search: ${submittedSearch}`] : []}
        searchPlaceholder="Search all packages"
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        caption="Provider package results"
        emptyKind={submittedSearch ? "search" : "packages"}
      />
      <CursorPagination<string>
        previousCursor={null}
        nextCursor={null}
        onPrevious={() => undefined}
        onNext={() => undefined}
        pageLabel="No cursor page loaded"
      />
    </div>
  );
}
