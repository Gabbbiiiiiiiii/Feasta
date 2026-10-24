"use client";

import {
  AlertCircle,
  PackageOpen,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";


import {
  PageHeading,
} from "@/components/layout/page-heading";
import {useLiveSearch} from "@/lib/search/use-live-search";
import {SearchInput} from "@/components/forms/search-input";
import {Select} from "@/components/ui/select";
import {ProviderPackageCard} from "./provider-package-card";
import {ProviderPackageResultsSkeleton} from "./provider-package-results-skeleton";
import {
  ConfirmationDialog,
} from "@/components/shared/confirmation-dialog";
import {
  Button,
} from "@/components/ui/button";
import {
  archiveProviderPackage,
  listProviderPackages,
  publishProviderPackage,
  type ProviderPackage,
} from "@/lib/provider/provider-package-client";
import {
  ProviderPackageForm,
} from "./provider-package-form";
import {
  DEFAULT_PROVIDER_PACKAGE_PAYMENT_POLICY_BOUNDS,
  type ProviderPackagePaymentPolicyBounds,
} from "@/lib/provider/provider-package-payment-policy";

import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger} from "@/components/ui/dialog";

type ProviderPackagesClientProps = {
  providerServiceType?: string;
  serviceCategories?: readonly string[];
  packageCategoryOptions: readonly {
    code: string;
    name: string;
  }[];
  providerId: string;
  eventTypesSupported: string[];
  minGuestsPerEvent: number;
  maxGuestsPerEvent: number;

  paymentPolicyBounds?:
    ProviderPackagePaymentPolicyBounds;
};

export function ProviderPackagesClient({
  providerServiceType = "catering",
  serviceCategories = [],
  packageCategoryOptions,
  providerId,
  eventTypesSupported,
  minGuestsPerEvent,
  maxGuestsPerEvent,

  paymentPolicyBounds =
    DEFAULT_PROVIDER_PACKAGE_PAYMENT_POLICY_BOUNDS,
}: ProviderPackagesClientProps) {
  const [
    packages,
    setPackages,
  ] = useState<ProviderPackage[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    search,
    setSearch,
  ] = useState("");
  const [appliedSearch, setAppliedSearch] = useState(search);
  const live = useLiveSearch(search, setAppliedSearch);

  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const filtersActive = Boolean(search || eventFilter || statusFilter || sort !== "newest");
  function clearFilters() {
    setSearch(""); setEventFilter(""); setStatusFilter(""); setSort("newest");
  }

  const [
    createOpen,
    setCreateOpen,
    ] = useState(false);

  const [
    editingPackage,
    setEditingPackage,
  ] = useState<ProviderPackage | null>(
    null,
  );

  const [discardOpen, setDiscardOpen] = useState(false);
  const saveBusy = useRef(false);
  const discardOpener = useRef<HTMLElement | null>(null);

  function requestEditorClose() {
    if (saveBusy.current || discardOpen) return;
    discardOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDiscardOpen(true);
  }

  const [
    publishPackage,
    setPublishPackage,
  ] = useState<ProviderPackage | null>(
    null,
  );

  const [
    archivePackage,
    setArchivePackage,
  ] = useState<ProviderPackage | null>(
    null,
  );

  const [
    actionError,
    setActionError,
  ] = useState<string | null>(
    null,
  );

  const loadPackages =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const result =
          await listProviderPackages(
            providerId,
          );

        setPackages(result);
      } catch (caught) {
        console.error(
          "[FEASTA provider packages]",
          caught,
        );

        setError(
          "We couldn't load your packages. Please try again.",
        );
      } finally {
        setLoading(false);
      }
    }, [providerId]);

  useEffect(() => {
    let cancelled = false;

    const loadInitialPackages = async () => {
        try {
        const result =
            await listProviderPackages(
            providerId,
            );

        if (cancelled) {
            return;
        }

        setPackages(result);
        setError(null);
        } catch (caught) {
        if (cancelled) {
            return;
        }

        console.error(
            "[FEASTA provider packages]",
            caught,
        );

        setError(
            "We couldn't load your packages. Please try again.",
        );
        } finally {
        if (!cancelled) {
            setLoading(false);
        }
        }
    };

    void loadInitialPackages();

    return () => {
        cancelled = true;
    };
    }, [providerId]);

  const eventTypes = useMemo(() => [...new Set(packages.map((item) => item.eventType))].sort(), [packages]);
  const filteredPackages = useMemo(() => {
    const term = appliedSearch.trim().toLowerCase();
    const result = packages.filter((item) =>
      (!eventFilter || item.eventType === eventFilter) &&
      (!statusFilter || item.status === statusFilter) &&
      [item.name, item.eventType, item.description].some((value) => value.toLowerCase().includes(term)));
    // The existing query returns createdAt descending; preserve that for Newest.
    if (sort === "oldest") result.reverse();
    if (sort === "price-low") result.sort((a, b) => a.price - b.price);
    if (sort === "price-high") result.sort((a, b) => b.price - a.price);
    if (sort === "name") result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [packages, appliedSearch, eventFilter, statusFilter, sort]);

  const packagePageSize = 6;

  const paginationKey = JSON.stringify([
    appliedSearch,
    eventFilter,
    statusFilter,
    sort,
    packages.length,
  ]);

  const [pageSelection, setPageSelection] = useState({
    key: "",
    page: 1,
  });

  const totalPackagePages = Math.max(
    1,
    Math.ceil(filteredPackages.length / packagePageSize),
  );

  const currentPackagePage =
    pageSelection.key === paginationKey
      ? Math.min(pageSelection.page, totalPackagePages)
      : 1;

  const visiblePackages = filteredPackages.slice(
    (currentPackagePage - 1) * packagePageSize,
    currentPackagePage * packagePageSize,
  );
  const publishedCount =
    useMemo(
      () =>
        packages.filter(
          (item) =>
            item.status ===
            "published",
        ).length,
      [packages],
    );

  const draftCount =
    useMemo(
      () =>
        packages.filter(
          (item) =>
            item.status === "draft",
        ).length,
      [packages],
    );

  const [formBusy, setFormBusy] = useState(false);
  const packageOpener = useRef<HTMLButtonElement | null>(null);
  const newPackageButton = useRef<HTMLButtonElement | null>(null);

  return (
    <Dialog open={createOpen} onOpenChange={(open) => {
      if (open) { if (!saveBusy.current) setCreateOpen(true); }
      else requestEditorClose();
    }}>
    <div className="grid gap-4">
      <PageHeading
        eyebrow="Provider management"
        title="Packages"
        description="Create and manage the packages customers can discover and book through FEASTA."
        actions={
          <DialogTrigger asChild><Button
            ref={newPackageButton}
            type="button"
            disabled={loading}
            onClick={(event) => {
              packageOpener.current = event.currentTarget;
              setEditingPackage(null);
              setCreateOpen(true);
            }}
            >
            <Plus aria-hidden="true" />
            New package
        </Button></DialogTrigger>
        }
      />

      <DialogContent
        className="flex h-[calc(100dvh-2rem)] min-h-0 min-w-0 max-w-[70rem] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-3rem)]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = packageOpener.current;
          (opener?.isConnected ? opener : document.getElementById(opener?.id ?? "") ?? newPackageButton.current)?.focus();
        }}
        showCloseButton={!formBusy}
        onEscapeKeyDown={(event) => { event.preventDefault(); requestEditorClose(); }}
        onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-16 sm:pl-6">
          <DialogTitle>{editingPackage ? "Edit package" : "Create package"}</DialogTitle>
          <DialogDescription>{editingPackage ? "Update your draft package. Changes take effect when you save." : "Save a draft to review before publishing. Closing asks you to confirm discarding unsaved changes."}</DialogDescription>
        </DialogHeader>
        <ProviderPackageForm
          key={editingPackage?.id ?? "create"}
          initialPackage={editingPackage ?? undefined}
          dialogLayout
          providerServiceType={providerServiceType}
          serviceCategories={serviceCategories}
          packageCategoryOptions={packageCategoryOptions}
          eventTypesSupported={eventTypesSupported}
          minGuestsPerEvent={minGuestsPerEvent}
          maxGuestsPerEvent={maxGuestsPerEvent}
          paymentPolicyBounds={paymentPolicyBounds}
          onSubmittingChange={(busy) => { saveBusy.current = busy; setFormBusy(busy); }}
          onCancel={requestEditorClose}
          onSaved={async () => { await loadPackages(); setDiscardOpen(false); setCreateOpen(false); }}
        />
        <ConfirmationDialog open={discardOpen} onOpenChange={(open) => {
          if (!saveBusy.current) setDiscardOpen(open);
        }} title="Discard package changes?"
          description="Your unsaved package details, pricing, dishes, themes, and images will be lost if you close this editor."
          confirmLabel="Discard changes" cancelLabel="Keep editing" destructive
          loading={formBusy} confirmDisabled={formBusy} stopEscapePropagation
          contentClassName="z-[70]" overlayClassName="z-[60]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = discardOpener.current;
            (target?.isConnected ? target : packageOpener.current?.isConnected ? packageOpener.current : newPackageButton.current)?.focus();
          }} onConfirm={() => {
            if (saveBusy.current) return;
            setDiscardOpen(false);
            setCreateOpen(false);
          }} />
      </DialogContent>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Package overview">
        {[
          {label: "Total packages", value: packages.length},
          {label: "Published", value: publishedCount},
          {label: "Drafts", value: draftCount},
          {label: "Archived", value: packages.filter((item) => item.status === "archived").length},
        ].map((stat) => (
          <section
            key={stat.label}
            aria-label={stat.label}
            className="flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 sm:px-4"
          >
            <span className="min-w-0 text-xs font-semibold text-muted-foreground sm:text-sm">
              {stat.label}
            </span>
            <strong className="text-xl font-bold tabular-nums text-primary-strong">
              {loading ? "..." : error ? "?" : stat.value}
            </strong>
          </section>
        ))}
      </div>

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-destructive"
          />

          <div>
            <p className="font-medium text-foreground">
              Package action failed
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {actionError}
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-destructive"
            />

            <div>
              <p className="font-medium text-foreground">
                Packages unavailable
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                {error}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => {
                void loadPackages();
            }}
            >
            <RefreshCw
              aria-hidden="true"
            />
            Try again
          </Button>
        </div>
      ) : null}

      <div role="search" aria-label="Filter packages" className="grid gap-2">
        <div className="grid items-end gap-3 sm:grid-cols-2 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Search packages
            <SearchInput
              aria-label="Search packages"
              placeholder="Search packages..."
              value={search}
              onChange={(event) => {
                live.change(event.target.value);
                setSearch(event.target.value);
              }}
              onClear={search ? () => {
                live.change("");
                setSearch("");
              } : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  live.submit();
                }
              }}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Event type
            <Select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
              <option value="">All event types</option>
              {eventTypes.map((event) => <option key={event} value={event}>{formatEventType(event)}</option>)}
            </Select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Status
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </Select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Sort packages
            <Select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="price-low">Price low to high</option><option value="price-high">Price high to low</option><option value="name">Name A?Z</option>
            </Select>
          </label>
        </div>
        {filtersActive ? <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="min-w-0 break-words text-muted-foreground">{[search && 'Search: ' + search, eventFilter && 'Event: ' + formatEventType(eventFilter), statusFilter && 'Status: ' + formatEventType(statusFilter), sort !== "newest" && "Custom sort"].filter(Boolean).join(" ? ")}</span>
          <Button variant="ghost" size="compact" onClick={clearFilters}>Clear filters</Button>
        </div> : null}
      </div>

      {loading ? (
        <ProviderPackageResultsSkeleton />
      ) : !error ? (
        <section aria-label="Provider package results">
          {filteredPackages.length ? <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
            {visiblePackages.map((item) => <ProviderPackageCard key={item.id} item={item}
              serviceCategoryLabel={packageCategoryOptions.find((category) => category.code === item.serviceCategoryCode)?.name}
              onEdit={(event) => { packageOpener.current = event.currentTarget; setEditingPackage(item); setCreateOpen(true); }}
              onPublish={() => { setActionError(null); setPublishPackage(item); }}
              onArchive={() => { setActionError(null); setArchivePackage(item); }} />)}
          </div> : <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-border bg-card px-5 py-10 text-center">
            <PackageOpen aria-hidden="true" className="size-8 text-primary-strong" />
            <h2 className="text-lg font-bold">{packages.length ? "No packages match your filters." : "No packages yet"}</h2>
            {packages.length ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : <>
              <p className="max-w-md text-sm text-muted-foreground">Create your first package so customers can discover and book your services.</p>
              <Button onClick={(event) => { packageOpener.current = event.currentTarget; setEditingPackage(null); setCreateOpen(true); }}>Create package</Button>
            </>}
          </div>}
          {totalPackagePages > 1 ? (
            <nav
              aria-label="Package pagination"
              className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
            >
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Showing {(currentPackagePage - 1) * packagePageSize + 1}–
                {Math.min(currentPackagePage * packagePageSize, filteredPackages.length)}
                {" "}of {filteredPackages.length} packages
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  disabled={currentPackagePage === 1}
                  onClick={() => setPageSelection({key: paginationKey, page: Math.max(1, currentPackagePage - 1)})}
                >
                  Previous
                </Button>
                <span className="text-sm font-medium">
                  {currentPackagePage} / {totalPackagePages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  disabled={currentPackagePage === totalPackagePages}
                  onClick={() =>
                    setPageSelection({
                      key: paginationKey,
                      page: Math.min(totalPackagePages, currentPackagePage + 1),
                    })
                  }
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </section>
      ) : null}
      <ConfirmationDialog
        open={publishPackage !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPublishPackage(null);
          }
        }}
        title="Publish package?"
        description={
          publishPackage
            ? `"${publishPackage.name}" will become available as a published package.`
            : "This package will be published."
        }
        confirmLabel="Publish package"
        loadingLabel="Publishing"
        onConfirm={async () => {
          if (!publishPackage) {
            return;
          }

          try {
            setActionError(null);

            await publishProviderPackage(
              publishPackage.id,
            );

            setPublishPackage(null);

            await loadPackages();
          } catch (caught) {
            console.error(
              "[FEASTA publish package]",
              caught,
            );

            setActionError(
              "The package could not be published. Check its details and try again.",
            );
          }
        }}
      />

      <ConfirmationDialog
        open={archivePackage !== null}
        onOpenChange={(open) => {
          if (!open) {
            setArchivePackage(null);
          }
        }}
        title="Archive package?"
        description={
          archivePackage
            ? `"${archivePackage.name}" will be removed from active package management and will no longer be available for publishing.`
            : "This package will be archived."
        }
        confirmLabel="Archive package"
        loadingLabel="Archiving"
        destructive
        onConfirm={async () => {
          if (!archivePackage) {
            return;
          }

          try {
            setActionError(null);

            await archiveProviderPackage(
              archivePackage.id,
            );

            setArchivePackage(null);

            if (
              editingPackage?.id ===
              archivePackage.id
            ) {
              setEditingPackage(null);
            }

            await loadPackages();
          } catch (caught) {
            console.error(
              "[FEASTA archive package]",
              caught,
            );

            setActionError(
              "The package could not be archived. Please try again.",
            );
          }
        }}
      />
    </div>
    </Dialog>
  );
}

function formatEventType(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}
