"use client";

import {Eye, Store} from "lucide-react";
import {useState} from "react";

import {
  CursorPagination,
  DataTable,
  DetailDrawer,
  FilterToolbar,
  SummaryCard,
  type DataTableColumn,
  type DataTableSort,
} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";

type ProviderRow = {
  id: string;
  businessName: string;
  serviceType: string;
  verificationStatus: string;
};

const columns: readonly DataTableColumn<ProviderRow>[] = [
  {id: "businessName", header: "Business", sortable: true, cell: (row) => row.businessName},
  {id: "serviceType", header: "Service type", cell: (row) => row.serviceType},
  {id: "verificationStatus", header: "Verification", cell: (row) => <StatusBadge status={row.verificationStatus} />},
];

export default function AdminProvidersPage() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<DataTableSort>({columnId: "businessName", direction: "ascending"});
  const [selected, setSelected] = useState<ProviderRow | null>(null);
  const rows: readonly ProviderRow[] = [];
  const activeFilters = [submittedSearch && `Search: ${submittedSearch}`, status && `Status: ${status}`].filter(Boolean) as string[];

  const clearFilters = () => {
    setSearch("");
    setSubmittedSearch("");
    setStatus("");
  };

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Admin management"
        title="Providers"
        description="Review provider records using bounded server queries and cursor pagination."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard label="Providers on this page" value={rows.length} icon={<Store className="size-6" />} />
        <SummaryCard label="Pending review on this page" value={rows.filter((row) => row.verificationStatus === "submitted").length} />
      </div>
      <FilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={setSubmittedSearch}
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        searchPlaceholder="Search providers globally"
        filterControls={
          <Select aria-label="Verification status" value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
            <option value="">All verification statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="approved">Approved</option>
          </Select>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        caption="Provider management results"
        emptyKind={submittedSearch || status ? "search" : "providers"}
        sort={sort}
        onSortChange={setSort}
        rowActions={(row) => (
          <Button variant="ghost" size="icon" aria-label={`Inspect ${row.businessName}`} onClick={() => setSelected(row)}>
            <Eye aria-hidden="true" />
          </Button>
        )}
      />
      <CursorPagination<string>
        previousCursor={null}
        nextCursor={null}
        onPrevious={() => undefined}
        onNext={() => undefined}
        pageLabel="No cursor page loaded"
      />
      <DetailDrawer
        open={selected != null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.businessName ?? "Provider details"}
        description="Provider record inspector"
      >
        {selected ? <StatusBadge status={selected.verificationStatus} /> : null}
      </DetailDrawer>
    </div>
  );
}
