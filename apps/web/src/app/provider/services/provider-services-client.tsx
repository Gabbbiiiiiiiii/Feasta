"use client";

import type {
  ProviderServiceCategory,
} from "@feasta/shared-types";
import {
  AlertCircle,
  Archive,
  Edit3,
  Plus,
  RefreshCw,
  Send,
  Wrench,
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
  ConfirmationDialog,
} from "@/components/shared/confirmation-dialog";
import {
  PriceDisplay,
} from "@/components/shared/price-display";
import {
  StatusBadge,
} from "@/components/shared/status-badge";
import {
  Button,
} from "@/components/ui/button";
import {
  archiveProviderService,
  listProviderServices,
  publishProviderService,
  type ProviderService,
} from "@/lib/provider/provider-service-client";

import {
  ProviderServiceForm,
} from "./provider-service-form";

type ProviderServicesClientProps = {
  providerId: string;
  serviceCategories:
    readonly ProviderServiceCategory[];
};

export function ProviderServicesClient({
  providerId,
  serviceCategories,
}: ProviderServicesClientProps) {
  const [
    services,
    setServices,
  ] = useState<ProviderService[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    actionError,
    setActionError,
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
    editingService,
    setEditingService,
  ] = useState<ProviderService | null>(
    null,
  );

  const [
    publishService,
    setPublishService,
  ] = useState<ProviderService | null>(
    null,
  );

  const [
    archiveService,
    setArchiveService,
  ] = useState<ProviderService | null>(
    null,
  );

  const loadServices =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const result =
          await listProviderServices(
            providerId,
          );

        setServices(result);
      } catch (caught) {
        console.error(
          "[FEASTA provider services]",
          caught,
        );

        setError(
          "We couldn't load your event services. Please try again.",
        );
      } finally {
        setLoading(false);
      }
    }, [providerId]);

  useEffect(() => {
    let cancelled = false;

    const loadInitialServices =
      async () => {
        try {
          const result =
            await listProviderServices(
              providerId,
            );

          if (cancelled) {
            return;
          }

          setServices(result);
          setError(null);
        } catch (caught) {
          if (cancelled) {
            return;
          }

          console.error(
            "[FEASTA provider services]",
            caught,
          );

          setError(
            "We couldn't load your event services. Please try again.",
          );
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

    void loadInitialServices();

    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const filteredServices =
    useMemo(() => {
      const term =
        submittedSearch
          .trim()
          .toLowerCase();

      if (!term) {
        return services;
      }

      return services.filter(
        (service) =>
          service.name
            .toLowerCase()
            .includes(term) ||
          service.description
            .toLowerCase()
            .includes(term) ||
          formatServiceCategory(
            service.category,
          )
            .toLowerCase()
            .includes(term) ||
          formatPricingType(
            service.pricingType,
          )
            .toLowerCase()
            .includes(term),
      );
    }, [
      services,
      submittedSearch,
    ]);

  const publishedCount =
    useMemo(
      () =>
        services.filter(
          (service) =>
            service.status ===
            "published",
        ).length,
      [services],
    );

  const draftCount =
    useMemo(
      () =>
        services.filter(
          (service) =>
            service.status ===
            "draft",
        ).length,
      [services],
    );

  const columns =
    useMemo<
      readonly DataTableColumn<ProviderService>[]
    >(
      () => [
        {
          id: "name",
          header: "Service",
          sortable: true,
          cell: (row) => (
            <div className="grid gap-1">
              <span className="font-medium text-foreground">
                {row.name}
              </span>

              <span className="text-sm text-muted-foreground">
                {formatServiceCategory(
                  row.category,
                )}
              </span>
            </div>
          ),
        },
        {
          id: "pricing",
          header: "Pricing",
          cell: (row) => (
            <div className="grid gap-1">
              <span className="text-sm text-foreground">
                {formatPricingType(
                  row.pricingType,
                )}
              </span>

              {row.price !== null ? (
                <PriceDisplay
                  amount={row.price}
                />
              ) : (
                <span className="text-sm text-muted-foreground">
                  Contact for quote
                </span>
              )}
            </div>
          ),
        },
        {
          id: "availability",
          header: "Availability",
          cell: (row) => (
            <span className="text-sm">
              {row.isAvailable
                ? "Available"
                : "Unavailable"}
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
        title="Event Services"
        description="Create and manage the event services customers can discover and book through FEASTA."
        actions={
          <Button
            type="button"
            disabled={
              loading ||
              serviceCategories.length === 0
            }
            onClick={() => {
              setEditingService(null);
              setCreateOpen(true);
            }}
          >
            <Plus aria-hidden="true" />
            New service
          </Button>
        }
      />

      {serviceCategories.length === 0 ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />

          <div>
            <p className="font-medium text-foreground">
              No service categories available
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Your provider profile does not have an event
              service category available for creating services.
            </p>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="rounded-xl border bg-card p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">
              Create event service
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Save the service as a draft first. You can
              review and publish it afterward.
            </p>
          </div>

          <ProviderServiceForm
            serviceCategories={
              serviceCategories
            }
            onCancel={() =>
              setCreateOpen(false)
            }
            onSaved={async () => {
              setCreateOpen(false);
              await loadServices();
            }}
          />
        </div>
      ) : null}

      {editingService ? (
        <div className="rounded-xl border bg-card p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">
              Edit event service
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Update the service details and save your
              changes.
            </p>
          </div>

          <ProviderServiceForm
            key={editingService.id}
            serviceCategories={
              serviceCategories
            }
            initialService={
              editingService
            }
            onCancel={() =>
              setEditingService(null)
            }
            onSaved={async () => {
              setEditingService(null);
              await loadServices();
            }}
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total services"
          value={services.length}
          icon={
            <Wrench className="size-6" />
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
              Service action failed
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
                Event services unavailable
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
              void loadServices();
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
        searchPlaceholder="Search your event services"
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

            Loading event services...
          </div>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredServices}
          getRowId={(row) => row.id}
          caption="Provider event service results"
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
                      setEditingService(row);
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
                      setPublishService(row);
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

              {row.status === "published" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  aria-label={`Archive ${row.name}`}
                  onClick={() => {
                    setActionError(null);
                    setArchiveService(row);
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
            : undefined
        }
        emptyTitle="No event services yet"
        emptyDescription="Create your first event service to start building your provider catalog."
        />
      )}

      <ConfirmationDialog
        open={publishService !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPublishService(null);
          }
        }}
        title="Publish event service?"
        description={
          publishService
            ? `"${publishService.name}" will become available as a published event service.`
            : "This event service will be published."
        }
        confirmLabel="Publish service"
        loadingLabel="Publishing"
        onConfirm={async () => {
          if (!publishService) {
            return;
          }

          try {
            setActionError(null);

            await publishProviderService(
              publishService.id,
            );

            setPublishService(null);

            await loadServices();
          } catch (caught) {
            console.error(
              "[FEASTA publish service]",
              caught,
            );

            setActionError(
              "The service could not be published. Check its details and try again.",
            );
          }
        }}
      />

      <ConfirmationDialog
        open={archiveService !== null}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveService(null);
          }
        }}
        title="Archive event service?"
        description={
          archiveService
            ? `"${archiveService.name}" will be removed from your active event services and will no longer be available to customers.`
            : "This event service will be archived."
        }
        confirmLabel="Archive service"
        loadingLabel="Archiving"
        destructive
        onConfirm={async () => {
          if (!archiveService) {
            return;
          }

          try {
            setActionError(null);

            await archiveProviderService(
              archiveService.id,
            );

            setArchiveService(null);

            if (
              editingService?.id ===
              archiveService.id
            ) {
              setEditingService(null);
            }

            await loadServices();
          } catch (caught) {
            console.error(
              "[FEASTA archive service]",
              caught,
            );

            setActionError(
              "The service could not be archived. Please try again.",
            );
          }
        }}
      />
    </div>
  );
}

function formatServiceCategory(
  value: ProviderServiceCategory,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/gu,
      (character) =>
        character.toUpperCase(),
    );
}

function formatPricingType(
  value: ProviderService["pricingType"],
): string {
  switch (value) {
    case "fixed":
      return "Fixed price";

    case "per_guest":
      return "Per guest";

    case "per_hour":
      return "Per hour";

    case "per_unit":
      return "Per unit";

    case "custom_quote":
      return "Custom quote";
  }
}