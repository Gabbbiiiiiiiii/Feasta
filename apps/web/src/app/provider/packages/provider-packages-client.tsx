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
  SummaryCard,
} from "@/components/data";
import {
  PageHeading,
} from "@/components/layout/page-heading";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {ProviderPackageCard} from "./provider-package-card";
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

import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger} from "@/components/ui/dialog";

type ProviderPackagesClientProps = {
  providerServiceType?: string;
  serviceCategories?: readonly string[];
  providerId: string;
  eventTypesSupported: string[];
  minGuestsPerEvent: number;
  maxGuestsPerEvent: number;
};

export function ProviderPackagesClient({
  providerServiceType = "catering",
  serviceCategories = [],
  providerId,
  eventTypesSupported,
  minGuestsPerEvent,
  maxGuestsPerEvent,
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
    const term = search.trim().toLowerCase();
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
  }, [packages, search, eventFilter, statusFilter, sort]);

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
    <Dialog open={createOpen} onOpenChange={(open) => { if (!formBusy) setCreateOpen(open); }}>
    <div className="grid gap-6">
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
        onEscapeKeyDown={(event) => { if (formBusy) event.preventDefault(); }}
        onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-16 sm:pl-6">
          <DialogTitle>{editingPackage ? "Edit package" : "Create package"}</DialogTitle>
          <DialogDescription>{editingPackage ? "Update your draft package. Changes take effect when you save." : "Save a draft to review before publishing. Cancel discards unsaved changes."}</DialogDescription>
        </DialogHeader>
        <ProviderPackageForm
          key={editingPackage?.id ?? "create"}
          initialPackage={editingPackage ?? undefined}
          dialogLayout
          providerServiceType={providerServiceType}
          serviceCategories={serviceCategories}
          eventTypesSupported={eventTypesSupported}
          minGuestsPerEvent={minGuestsPerEvent}
          maxGuestsPerEvent={maxGuestsPerEvent}
          onSubmittingChange={setFormBusy}
          onCancel={() => setCreateOpen(false)}
          onSaved={async () => { await loadPackages(); setCreateOpen(false); }}
        />
      </DialogContent>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="Total packages"
          loading={loading}
          value={error ? "?" : packages.length}
          icon={
            <PackageOpen className="size-6" />
          }
        />

        <SummaryCard
          label="Published"
          loading={loading}
          value={error ? "?" : publishedCount}
        />

        <SummaryCard
          label="Drafts"
          loading={loading}
          value={error ? "?" : draftCount}
        />
        <SummaryCard label="Archived" loading={loading} value={error ? "?" : packages.filter((item) => item.status === "archived").length} />
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

      <div role="search" aria-label="Filter packages" className="grid gap-3">
        <div className="grid items-end gap-3 sm:grid-cols-2 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Search packages
            <Input type="search" placeholder="Search packages..." value={search} onChange={(event) => setSearch(event.target.value)} />
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
        <div
          aria-live="polite"
          className="grid min-h-56 place-items-center rounded-xl border bg-card p-6"
        >
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <RefreshCw
              aria-hidden="true"
              className="size-4 animate-spin"
            />

            Loading packages…
          </div>
        </div>
      ) : !error ? (
        <section aria-label="Provider package results">
          {filteredPackages.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] items-start gap-4">
            {filteredPackages.map((item) => <ProviderPackageCard key={item.id} item={item}
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
