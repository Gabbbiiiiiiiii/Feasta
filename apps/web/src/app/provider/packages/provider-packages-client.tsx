"use client";

import {
  AlertCircle,
  Archive,
  Edit3,
  PackageOpen,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DataTable,
  FilterToolbar,
  SummaryCard,
  type DataTableColumn,
} from "@/components/data";
import {
  PageHeading,
} from "@/components/layout/page-heading";
import {
  PriceDisplay,
} from "@/components/shared/price-display";
import {
  StatusBadge,
} from "@/components/shared/status-badge";
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

type ProviderPackagesClientProps = {
  providerId: string;
  eventTypesSupported: string[];
  minGuestsPerEvent: number;
  maxGuestsPerEvent: number;
};

export function ProviderPackagesClient({
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

  const [
    submittedSearch,
    setSubmittedSearch,
  ] = useState("");

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

  const filteredPackages =
    useMemo(() => {
      const term =
        submittedSearch
          .trim()
          .toLowerCase();

      if (!term) {
        return packages;
      }

      return packages.filter(
        (item) =>
          item.name
            .toLowerCase()
            .includes(term) ||
          item.eventType
            .toLowerCase()
            .includes(term) ||
          item.description
            .toLowerCase()
            .includes(term),
      );
    }, [
      packages,
      submittedSearch,
    ]);

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

  const columns =
    useMemo<
      readonly DataTableColumn<ProviderPackage>[]
    >(
      () => [
        {
          id: "name",
          header: "Package",
          sortable: true,
          cell: (row) => (
            <div className="grid gap-1">
              <span className="font-medium text-foreground">
                {row.name}
              </span>

              <span className="text-sm text-muted-foreground">
                {formatEventType(
                  row.eventType,
                )}
              </span>
            </div>
          ),
        },
        {
          id: "guests",
          header: "Guests",
          cell: (row) => (
            <span className="whitespace-nowrap">
              {row.minimumGuests}–
              {row.maximumGuests}
            </span>
          ),
        },
        {
          id: "price",
          header: "Price",
          sortable: true,
          cell: (row) => (
            <PriceDisplay
              amount={row.price}
            />
          ),
        },
        {
          id: "downPayment",
          header: "Down payment",
          cell: (row) => (
            <span>
              {
                row.downPaymentPercentage
              }
              %
            </span>
          ),
        },
        {
          id: "status",
          header: "Status",
          cell: (row) => (
            <StatusBadge
              status={row.status}
            />
          ),
        },
      ],
      [],
    );

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Provider management"
        title="Packages"
        description="Create and manage the catering packages customers can discover and book through FEASTA."
        actions={
          <Button
            type="button"
            disabled={loading}
            onClick={() => {
              setEditingPackage(null);
              setCreateOpen(true);
            }}
            >
            <Plus aria-hidden="true" />
            New package
        </Button>
        }
      />

      {createOpen ? (
        <div className="rounded-xl border bg-card p-6">
            <div className="mb-6">
            <h2 className="text-lg font-semibold">
                Create package
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
                Save the package as a draft first. You can review and publish it afterward.
            </p>
            </div>

            <ProviderPackageForm
              eventTypesSupported={
                eventTypesSupported
              }
              minGuestsPerEvent={
                minGuestsPerEvent
              }
              maxGuestsPerEvent={
                maxGuestsPerEvent
              }
              onCancel={() =>
                setCreateOpen(false)
              }
              onSaved={async () => {
                setCreateOpen(false);
                await loadPackages();
              }}
            />
        </div>
        ) : null}

        {editingPackage ? (
          <div className="rounded-xl border bg-card p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold">
                Edit package
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Update the package details and save your changes.
              </p>
            </div>

            <ProviderPackageForm
              key={editingPackage.id}
              eventTypesSupported={
                eventTypesSupported
              }
              minGuestsPerEvent={
                minGuestsPerEvent
              }
              maxGuestsPerEvent={
                maxGuestsPerEvent
              }
              initialPackage={
                editingPackage
              }
              onCancel={() =>
                setEditingPackage(null)
              }
              onSaved={async () => {
                setEditingPackage(null);
                await loadPackages();
              }}
            />
          </div>
        ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total packages"
          value={packages.length}
          icon={
            <PackageOpen className="size-6" />
          }
        />

        <SummaryCard
          label="Published"
          value={publishedCount}
        />

        <SummaryCard
          label="Drafts"
          value={draftCount}
        />
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

      <FilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={
          setSubmittedSearch
        }
        onClearFilters={() => {
          setSearch("");
          setSubmittedSearch("");
        }}
        activeFilters={
          submittedSearch
            ? [
                `Search: ${submittedSearch}`,
              ]
            : []
        }
        searchPlaceholder="Search your packages"
      />

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
      ) : (
        <DataTable
          columns={columns}
          rows={filteredPackages}
          getRowId={(row) => row.id}
          caption="Provider package results"
          rowActionsLabel="Actions"
          rowActions={(row) => (
            <div className="flex justify-end gap-2">
              {row.status === "draft" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    aria-label={`Edit ${row.name}`}
                    onClick={() => {
                      setCreateOpen(false);
                      setEditingPackage(row);
                    }}
                  >
                    <Edit3
                      aria-hidden="true"
                      className="size-4"
                    />
                    Edit
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    aria-label={`Publish ${row.name}`}
                    onClick={() => {
                      setActionError(null);
                      setPublishPackage(row);
                    }}
                  >
                    <Send
                      aria-hidden="true"
                      className="size-4"
                    />
                    Publish
                  </Button>
                </>
              ) : null}

              {row.status !== "archived" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  aria-label={`Archive ${row.name}`}
                  onClick={() => {
                    setActionError(null);
                    setArchivePackage(row);
                  }}
                >
                  <Archive
                    aria-hidden="true"
                    className="size-4"
                  />
                  Archive
                </Button>
              ) : null}
            </div>
          )}
          emptyKind={
            submittedSearch
              ? "search"
              : "packages"
          }
        />
      )}
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