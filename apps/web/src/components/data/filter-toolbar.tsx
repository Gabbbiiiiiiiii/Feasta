"use client";

import {useId, type FormEvent, type ReactNode} from "react";

import {SearchInput, type SuggestionLoader, type SearchSuggestion} from "@/components/forms/search-input";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

type FilterToolbarProps = {
  loadSuggestions?: SuggestionLoader;
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  suggestionScope?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  onClearSearch?: () => void;
  onClearFilters: () => void;
  filterControls?: ReactNode;
  activeFilters?: readonly string[];
  searchLabel?: string;
  searchPlaceholder?: string;
  searchHint?: string;
  loading?: boolean;
  className?: string;
};

function FilterToolbar({
  loadSuggestions,
  onSuggestionSelect,
  suggestionScope,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onClearSearch,
  onClearFilters,
  filterControls,
  activeFilters = [],
  searchLabel = "Search all records",
  searchPlaceholder = "Search",
  searchHint,
  loading = false,
  className,
}: FilterToolbarProps) {
  const searchHintId = useId();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchSubmit(searchValue.trim());
  };
  const hasFilters = searchValue.trim().length > 0 || activeFilters.length > 0;

  return (
    <section className={cn("grid gap-4 rounded-card border border-border bg-card p-4 shadow-card", className)} aria-label="Filter records">
      <form onSubmit={submit} role="search" className="grid min-w-0 gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto]">
        <div className="grid min-w-0 gap-2">
          <SearchInput
            loadSuggestions={loadSuggestions}
            suggestionScope={suggestionScope}
            onSuggestionSelect={(item) => { onSearchChange(item.value); if (onSuggestionSelect) onSuggestionSelect(item); else onSearchSubmit(item.value); }}
            aria-label={searchLabel}
            aria-describedby={searchHint ? searchHintId : undefined}
            placeholder={searchPlaceholder}
            value={searchValue}
            disabled={loading}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            onClear={searchValue.trim() ? onClearSearch ?? onClearFilters : undefined}
          />
          {searchHint ? (
            <p id={searchHintId} className="text-xs leading-5 text-muted-foreground">
              {searchHint}
            </p>
          ) : null}
        </div>
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
