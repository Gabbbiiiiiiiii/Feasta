"use client";

import {useState} from "react";

import {FilterToolbar} from "@/components/data";
import {ApplicationEmptyState} from "@/components/feedback/application-states";
import {PageHeading} from "@/components/layout/page-heading";
import {Select} from "@/components/ui/select";

export default function CustomerProvidersPage() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [serviceType, setServiceType] = useState("");
  const activeFilters = [
    submittedSearch && `Search: ${submittedSearch}`,
    serviceType && `Service: ${serviceType}`,
  ].filter(Boolean) as string[];

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Discovery"
        title="Find event providers"
        description="Search the full approved-provider catalogue using bounded server queries."
      />
      <FilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={setSubmittedSearch}
        searchPlaceholder="Search providers"
        activeFilters={activeFilters}
        onClearFilters={() => {
          setSearch("");
          setSubmittedSearch("");
          setServiceType("");
        }}
        filterControls={
          <Select aria-label="Provider service type" value={serviceType} onChange={(event) => setServiceType(event.currentTarget.value)}>
            <option value="">All services</option>
            <option value="catering">Catering</option>
            <option value="venue">Venue</option>
            <option value="photography">Photography</option>
          </Select>
        }
      />
      <section className="rounded-card border border-border bg-card shadow-card" aria-label="Provider results">
        <ApplicationEmptyState kind={activeFilters.length ? "search" : "providers"} />
      </section>
    </div>
  );
}
