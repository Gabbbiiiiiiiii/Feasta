"use client";

import type {
  ServiceCategoryCode,
} from "@feasta/shared-types";

import type {
  ServiceCategoryOption,
} from "@/lib/service-categories/service-category-service";
import {
  AlertCircle,
  Archive,
  Edit3,
  Eye,
  Plus,
  RefreshCw,
  Send,
  Wrench,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  FilterToolbar,
  SummaryCard,
} from "@/components/data";
import {
  PageHeading,
} from "@/components/layout/page-heading";
import {EmptyState} from "@/components/feedback/states";
import {FreelanceServiceSummary} from "@/components/shared/freelance-service-summary";
import {ImagePlaceholder} from "@/components/shared/image-placeholder";
import {PackagePaymentTerms} from "@/components/shared/package-payment-terms";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  isFreelancer?: boolean;
  providerId: string;
  serviceCategories:
  readonly ServiceCategoryCode[];
  serviceCategoryOptions:
    readonly ServiceCategoryOption[];
};

export function ProviderServicesClient({
  isFreelancer,
  providerId,
  serviceCategories,
  serviceCategoryOptions,
}: ProviderServicesClientProps) {
  const [
    services,
    setServices,
  ] = useState<ProviderService[]>([]);

  const serviceCategoryNames =
    useMemo(
      () =>
        new Map(
          serviceCategoryOptions.map(
            (category) => [
              category.code,
              category.name,
            ] as const,
          ),
        ),
      [serviceCategoryOptions],
    );

  const serviceCategoryName =
    useCallback(
      (category: ServiceCategoryCode) =>
        serviceCategoryNames.get(category) ??
        category
          .replaceAll("_", " ")
          .replace(
            /\b\w/gu,
            (character) =>
              character.toUpperCase(),
          ),
      [serviceCategoryNames],
    );

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

  const [creating, setCreating] = useState(false);

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

  const requestId = useRef(0);
  const loadServices = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listProviderServices(providerId);
      if (current === requestId.current) setServices(result);
    } catch {
      if (current === requestId.current) setError("We couldn't load your event services. Please try again.");
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return loadServices(); });
    return () => { active = false; requestId.current += 1; };
  }, [loadServices]);

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
          serviceCategoryName(service.category)
            .toLowerCase()
            .includes(term) ||
          formatPricingType(
            service.pricingType,
          )
            .toLowerCase()
            .includes(term),
      );
    }, [
      serviceCategoryName,
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

  return (
    <Dialog
      open={createOpen}
      onOpenChange={(open) => {
        if (!creating) setCreateOpen(open);
      }}
    >
    <div className="@container grid gap-6">
      <PageHeading
        eyebrow="Provider management"
        title="Event Services"
        description="Create and manage the event services customers can discover and book through FEASTA."
        actions={
          <DialogTrigger asChild>
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
          </DialogTrigger>
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

      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        className="flex max-h-[90dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-16">
            <DialogTitle>
              Create event service
            </DialogTitle>

            <DialogDescription>
              Add the details customers need to understand your service.
            </DialogDescription>
          </DialogHeader>

          <ProviderServiceForm
            isFreelancer={isFreelancer}
            inDialog
            onSubmittingChange={setCreating}
            serviceCategories={
              serviceCategories
            }
            serviceCategoryOptions={
              serviceCategoryOptions
            }
            onCancel={() =>
              setCreateOpen(false)
            }
            onSaved={async () => {
              setCreateOpen(false);
              await loadServices();
            }}
          />
      </DialogContent>

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
            isFreelancer={isFreelancer}
            key={editingService.id}
            serviceCategories={
              serviceCategories
            }
            serviceCategoryOptions={
              serviceCategoryOptions
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
      ) : error ? null : filteredServices.length ? (
        <div className="grid grid-cols-1 items-start gap-3 @min-[42rem]:grid-cols-2" aria-label="Provider event service results">
          {filteredServices.map((service) => {
            const cover = service.portfolio?.photos.find((photo) => photo.id === service.portfolio?.coverAssetId);
            const imageUrl = cover?.thumbnailUrl || service.imageUrl;
            const category = serviceCategoryName(service.category);
            return (
              <article key={service.id} aria-label={service.name}
                className="flex min-w-0 flex-col self-start overflow-hidden rounded-card border border-border bg-card shadow-card sm:flex-row">
                <div className="relative h-28 shrink-0 overflow-hidden bg-muted sm:h-auto sm:w-28">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={cover?.altText ?? service.name} loading="lazy" className="absolute inset-0 size-full object-contain" />
                  ) : <ImagePlaceholder className="h-full min-h-0 rounded-none" label="No service image" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="grid content-start gap-1 p-2.5">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <h2 className="min-w-0 line-clamp-1 break-words text-sm font-bold sm:text-base" title={service.name}>{service.name}</h2>
                      <StatusBadge status={service.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-[11px] font-semibold uppercase text-primary-strong">{category}</p>
                      {service.status === "published" ? <p className="text-xs text-muted-foreground">{service.isAvailable ? "Available" : "Unavailable"}</p> : null}
                    </div>
                    {service.price !== null ? <PriceDisplay amount={service.price} /> :
                      <p className="text-sm font-semibold">Contact for quote</p>}
                    <p className="text-xs text-muted-foreground">{formatPricingType(service.pricingType)}</p>
                    <PackagePaymentTerms source={{paymentPolicy: "full_payment"}} />
                  </div>
                  {service.status !== "archived" ? <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-border p-1.5">
                    {service.status === "draft" ? <>
                      <Button type="button" variant="secondary" size="compact" className="mr-auto"
                        aria-label={`Edit ${service.name}`} onClick={() => {
                          setCreateOpen(false);
                          setEditingService(service);
                        }}>
                        <Edit3 aria-hidden="true" className="size-4" />Edit
                      </Button>
                      <Button type="button" variant="ghost" size="icon" title="Publish service"
                        aria-label={`Publish ${service.name}`} onClick={() => {
                          setActionError(null);
                          setPublishService(service);
                        }}>
                        <Send aria-hidden="true" className="size-4" />
                      </Button>
                    </> : null}
                    {service.status === "published" ? <>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button type="button" variant="secondary" size="compact" aria-label={`View ${service.name}`}>
                            <Eye aria-hidden="true" className="size-4" />View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[88dvh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>{service.name}</DialogTitle>
                            <DialogDescription>{category}</DialogDescription>
                          </DialogHeader>
                          <p className="whitespace-pre-wrap break-words text-sm">{service.description}</p>
                          {service.freelanceDetails ? <FreelanceServiceSummary details={service.freelanceDetails} /> : null}
                        </DialogContent>
                      </Dialog>
                      <Button type="button" variant="ghost" size="icon" title="Archive service"
                        aria-label={`Archive ${service.name}`} onClick={() => {
                          setActionError(null);
                          setArchiveService(service);
                        }}>
                        <Archive aria-hidden="true" className="size-4" />
                      </Button>
                    </> : null}
                  </div> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-card border border-border bg-card">
          <EmptyState
            title={submittedSearch ? "No matching event services" : "No event services yet"}
            description={submittedSearch ? "Try a different search or clear your filters." :
              "Create your first event service to start building your provider catalog."}
          />
        </div>
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
    </Dialog>
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
