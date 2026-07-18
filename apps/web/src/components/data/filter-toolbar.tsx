"use client";

import type {FormEvent, ReactNode} from "react";

import {SearchInput} from "@/components/forms/search-input";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

type FilterToolbarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  onClearFilters: () => void;
  filterControls?: ReactNode;
  activeFilters?: readonly string[];
  searchLabel?: string;
  searchPlaceholder?: string;
  loading?: boolean;
  className?: string;
};

function FilterToolbar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onClearFilters,
  filterControls,
  activeFilters = [],
  searchLabel = "Search all records",
  searchPlaceholder = "Search",
  loading = false,
  className,
}: FilterToolbarProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchSubmit(searchValue.trim());
  };
  const hasFilters = searchValue.trim().length > 0 || activeFilters.length > 0;

  return (
    <section className={cn("grid gap-4 rounded-card border border-border bg-card p-4 shadow-card", className)} aria-label="Filter records">
      <form onSubmit={submit} role="search" className="grid min-w-0 gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto]">
        <SearchInput
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          value={searchValue}
          disabled={loading}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          onClear={hasFilters ? onClearFilters : undefined}
        />
        <Button type="submit" loading={loading} loadingLabel="Searching" className="w-full lg:w-auto">
          Search
        </Button>
      </form>
      {filterControls ? <div className="grid min-w-0 gap-3 [&>*]:min-w-0 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">{filterControls}</div> : null}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0" aria-live="polite">
          {activeFilters.length > 0 ? (
            <p className="break-words text-sm text-muted-foreground">
              Active filters: {activeFilters.join(", ")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No filters applied</p>
          )}
        </div>
        <Button className="w-full sm:w-auto" variant="ghost" size="compact" disabled={!hasFilters || loading} onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    </section>
  );
}

export {FilterToolbar, type FilterToolbarProps};
