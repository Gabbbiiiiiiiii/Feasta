"use client";

import {useState} from "react";

import {CursorPagination, DataTable, FilterToolbar, type DataTableColumn} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Select} from "@/components/ui/select";

type BookingRow = {
  id: string;
  eventName: string;
  eventDate: string;
  providerName: string;
  status: string;
};

const columns: readonly DataTableColumn<BookingRow>[] = [
  {id: "eventName", header: "Event", cell: (row) => row.eventName},
  {id: "eventDate", header: "Date", sortable: true, cell: (row) => row.eventDate},
  {id: "providerName", header: "Provider", cell: (row) => row.providerName},
  {id: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} />},
];

export default function CustomerBookingsPage() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState("");
  const rows: readonly BookingRow[] = [];

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Customer history"
        title="Bookings"
        description="Review current and historical bookings from bounded cursor pages."
      />
      <FilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={setSubmittedSearch}
        onClearFilters={() => {
          setSearch("");
          setSubmittedSearch("");
          setStatus("");
        }}
        activeFilters={[
          submittedSearch && `Search: ${submittedSearch}`,
          status && `Status: ${status}`,
        ].filter(Boolean) as string[]}
        searchPlaceholder="Search all bookings"
        filterControls={
          <Select aria-label="Booking status" value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
            <option value="">All booking statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
          </Select>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        caption="Customer booking history"
        emptyKind={submittedSearch || status ? "search" : "bookings"}
        renderMobileRow={(row) => (
          <article className="grid gap-2 rounded-card border border-border bg-card p-4">
            <h2 className="font-bold">{row.eventName}</h2>
            <p className="text-sm text-muted-foreground">{row.eventDate} · {row.providerName}</p>
            <StatusBadge status={row.status} />
          </article>
        )}
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
