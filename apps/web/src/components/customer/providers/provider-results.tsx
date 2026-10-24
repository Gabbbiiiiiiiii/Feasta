"use client";

import {
  ArrowRight,
  Search,
  SearchX,
  SlidersHorizontal,
  Store,
} from "lucide-react";
import Link from "next/link";
import {useEffect, useMemo, useRef, useState} from "react";

import {
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import {rankProviderBestFits} from "@/lib/customer/providers/provider-best-fit";
import {providerDiscoverySections} from "@/lib/customer/providers/provider-discovery-sections";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
  PublicProvider,
} from "@/lib/customer/providers/provider-types";
import type {CustomerProviderAvailability} from "@/lib/customer/bookings/customer-provider-availability-client";
import {
  serviceCategoryName,
  type ServiceCategoryOption,
} from "@/lib/service-categories/service-category-types";

import {ProviderIndustrySelector} from "./provider-industry-selector";
import {ProviderLogoCard} from "./provider-logo-card";

export function ProviderResults({
  page,
  filters,
  favoriteProviderIds = new Set<string>(),
  authenticatedCustomer = false,
  serviceCategoryOptions = [],
}: {
  page: ProviderDiscoveryPage;
  filters: ProviderDiscoveryFilters;
  favoriteProviderIds?: ReadonlySet<string>;
  authenticatedCustomer?: boolean;
  serviceCategoryOptions?: readonly ServiceCategoryOption[];
}) {
  const providerIds = useMemo(
    () => page.providers.map((provider) => provider.id),
    [page.providers],
  );
  const [retryAttempt, setRetryAttempt] = useState(0);
  const requestKey = filters.eventContext
    ? JSON.stringify([providerIds, filters.eventContext, authenticatedCustomer, retryAttempt])
    : null;
  const generationRef = useRef(0);
  const [availabilityStatus, setAvailabilityStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [availabilityByProvider, setAvailabilityByProvider] = useState<
    ReadonlyMap<string, CustomerProviderAvailability>
  >(new Map());
  const [availabilityCheckedKey, setAvailabilityCheckedKey] = useState<string | null>(null);
  const [availabilityRequestKey, setAvailabilityRequestKey] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const context = filters.eventContext;
    if (!context || !authenticatedCustomer || providerIds.length === 0 || !requestKey) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (generationRef.current !== generation) return;
      setAvailabilityStatus("loading");
      setAvailabilityRequestKey(requestKey);
      setAvailabilityByProvider(new Map());
      setAvailabilityCheckedKey(null);
      setAvailabilityError(null);
      void import("@/lib/customer/providers/marketplace-provider-availability-client")
        .then(({checkMarketplaceProviderAvailability}) =>
          checkMarketplaceProviderAvailability(providerIds, context)
        )
        .then((results) => {
          if (generationRef.current !== generation) return;
          setAvailabilityByProvider(new Map(results.map((result) => [result.providerId, result])));
          setAvailabilityCheckedKey(requestKey);
          setAvailabilityStatus("ready");
        })
        .catch((error: unknown) => {
          if (generationRef.current !== generation) return;
          setAvailabilityError(error instanceof Error ? error.message : "Provider availability could not be checked.");
          setAvailabilityStatus("error");
        });
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [authenticatedCustomer, filters.eventContext, providerIds, requestKey]);

  const availabilityIsCurrent = authenticatedCustomer && availabilityStatus === "ready" &&
    availabilityCheckedKey === requestKey;
  const currentAvailabilityStatus = availabilityRequestKey === requestKey
    ? availabilityStatus
    : "idle";
  const hasEventPlanningContext = Boolean(
    filters.eventContext || filters.planningContext,
  );
  const filtered =
    filters.search.length > 0 ||
    filters.serviceType !== "all" ||
    filters.category !== "all" || Boolean(filters.categories?.length);

  const activeFilterLabels = [
    ...(filters.categories ?? []).map((code) => serviceCategoryName(code, serviceCategoryOptions)),
    filters.search
      ? `"${filters.search}"`
      : null,
    filters.serviceType !== "all"
      ? providerServiceTypeLabel(filters.serviceType)
      : null,
    filters.category !== "all"
      ? serviceCategoryName(
          filters.category,
          serviceCategoryOptions,
        )
      : null,
  ].filter((value): value is string => value !== null);

  /* ======================================================================
     EMPTY STATE
     ====================================================================== */

  if (page.providers.length === 0) {
    const allProvidersHref = providerDiscoveryHref({
      ...filters,
      search: "",
      serviceType: "all",
      category: "all",
      categories: undefined,
      cursor: null,
      eventContext: filters.eventContext
        ? {...filters.eventContext, serviceType: "all"}
        : null,
    });
    const hasIndustryChoices = serviceCategoryOptions.some(
      (option) => option.status === "active",
    );
    return (
      <section className="grid min-w-0 gap-5" aria-labelledby="provider-results-title">
        <ProviderIndustrySelector
          filters={filters}
          serviceCategoryOptions={serviceCategoryOptions}
        />
        <section
          aria-label="Provider results"
          className="relative grid min-h-[360px] place-items-center overflow-hidden rounded-[26px] border border-feasta-border-soft bg-white px-6 py-12 text-center shadow-[0_8px_28px_rgb(0_75_59/0.035)]"
        >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-primary/[0.045] blur-3xl"
        />

        <div className="relative grid max-w-md justify-items-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary-strong">
            {filtered ? (
              <SearchX
                aria-hidden="true"
                className="size-6"
              />
            ) : (
              <Store
                aria-hidden="true"
                className="size-6"
              />
            )}
          </span>

          <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Marketplace results
          </p>

          <h1 id="provider-results-title" tabIndex={-1} className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground">
            {filtered
              ? "No providers match those filters."
              : "No public providers yet."}
          </h1>

          <p className="mt-3 max-w-sm text-sm leading-6 text-feasta-text-secondary">
            {filtered
              ? "Try broadening your search or removing one of the active filters."
              : "Approved public event providers will appear here when they become available."}
          </p>

          {filtered ? (
            <Link
              href={allProvidersHref}
              className={[
                "mt-6 inline-flex min-h-11 items-center justify-center",
                "gap-2 rounded-full bg-primary px-5",
                "text-sm font-bold text-primary-foreground",
                "shadow-brand-soft",
                "transition-[transform,background-color]",
                "duration-normal",
                "hover:-translate-y-0.5 hover:bg-primary-hover",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
                "motion-reduce:transform-none",
              ].join(" ")}
            >
              <Search
                aria-hidden="true"
                className="size-4"
              />

              View all providers
            </Link>
          ) : null}
          {filtered && hasIndustryChoices ? (
            <p className="mt-3 text-xs font-semibold text-feasta-text-tertiary">
              Or choose another industry above.
            </p>
          ) : null}
        </div>
        </section>
      </section>
    );
  }

  const marketplaceHref = providerDiscoveryHref(
    filters,
    filters.cursor,
  );
  const bestFitContext = hasEventPlanningContext || filters.category !== "all" || Boolean(filters.categories?.length);
  const fits = rankProviderBestFits(page.providers, filters,
    availabilityIsCurrent ? availabilityByProvider : new Map());
  const recommendations = bestFitContext ? fits.filter((fit) => fit.recommended).slice(0, 4) : [];
  const recommendedIds = new Set(recommendations.map((fit) => fit.provider.id));
  const {sections, remaining} = bestFitContext
    ? {sections: [], remaining: page.providers.filter((provider) => !recommendedIds.has(provider.id))}
    : providerDiscoverySections(
      page,
      filters,
      serviceCategoryOptions,
    );

  function providerGrid(providers: readonly PublicProvider[]) {
    return (
      <div className="grid min-w-0 auto-rows-fr grid-cols-[repeat(auto-fill,minmax(min(100%,12.5rem),1fr))] gap-3">
        {providers.map((provider) => (
          <ProviderLogoCard
            key={provider.id}
            provider={provider}
            marketplaceHref={marketplaceHref}
            serviceCategoryOptions={serviceCategoryOptions}
            favoriteState={{
              authenticated: authenticatedCustomer,
              favorited: favoriteProviderIds.has(provider.id),
            }}
            fitExplanations={recommendedIds.has(provider.id)
              ? fits.find((fit) => fit.provider.id === provider.id)?.explanations
              : undefined}
            preliminaryFit={recommendedIds.has(provider.id) && fits.find((fit) => fit.provider.id === provider.id)?.availability === "unknown"}
            availability={availabilityIsCurrent
              ? availabilityByProvider.get(provider.id) ?? null
              : null}
            availabilityLoading={Boolean(filters.eventContext) && currentAvailabilityStatus === "loading"}
          />
        ))}
      </div>
    );
  }

  return (
    <section
      className="grid min-w-0 gap-5"
      aria-labelledby="provider-results-title"
    >
      <ProviderIndustrySelector
        filters={filters}
        serviceCategoryOptions={serviceCategoryOptions}
      />
      {/* ================================================================
          RESULT HEADER
         ================================================================ */}

      <header className="rounded-[22px] border border-feasta-border-soft bg-white p-4 shadow-[0_5px_20px_rgb(0_75_59/0.03)] sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Marketplace results
            </p>

            <h1
              id="provider-results-title"
              tabIndex={-1}
              className="mt-1.5 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
            >
              {hasEventPlanningContext ? "Providers for your event" : "Marketplace providers"}
            </h1>

            <p
              className="mt-2 text-sm text-feasta-text-secondary"
              aria-live="polite"
            >
              Showing{" "}
              <span className="font-bold text-foreground">
                {page.providers.length}
              </span>{" "}
              {page.providers.length === 1
                ? "provider"
                : "providers"}{" "}
              on this page.
            </p>
            {!hasEventPlanningContext ? (
              <p className="mt-2 text-sm text-feasta-text-secondary">
                Choose your event date and details to check availability.
              </p>
            ) : null}
            {filters.eventContext ? (
              <p className="mt-2 text-sm text-feasta-text-secondary" aria-live="polite">
                {currentAvailabilityStatus === "loading" ? "Checking provider availability…" : null}
                {currentAvailabilityStatus === "ready" ? "Availability checked for the providers on this page." : null}
                {currentAvailabilityStatus === "error" ? <>
                  {availabilityError} {authenticatedCustomer ? (
                    <button type="button" onClick={() => setRetryAttempt((attempt) => attempt + 1)} className="min-h-10 rounded-lg px-2 font-bold text-primary-strong underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Retry availability check</button>
                  ) : null}
                </> : null}
                {currentAvailabilityStatus === "idle" && !authenticatedCustomer
                  ? "Sign in as a customer to check provider availability."
                  : null}
              </p>
            ) : null}
          </div>

          {filtered ? (
            <div className="flex items-center gap-2 rounded-xl bg-feasta-canvas px-3.5 py-2.5">
              <SlidersHorizontal
                aria-hidden="true"
                className="size-4 shrink-0 text-primary-strong"
              />

              <span className="text-xs font-semibold text-feasta-text-secondary">
                Filtered results
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-feasta-canvas px-3.5 py-2.5">
              <Store
                aria-hidden="true"
                className="size-4 shrink-0 text-primary-strong"
              />

              <span className="text-xs font-semibold text-feasta-text-secondary">
                All public providers
              </span>
            </div>
          )}
        </div>

        {/* Active filter summary */}
        {activeFilterLabels.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-feasta-divider pt-3">
            {activeFilterLabels.map((label) => (
              <span
                key={label}
                className="inline-flex rounded-full border border-primary/15 bg-secondary px-3 py-1.5 text-xs font-bold text-primary-strong"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {/* ================================================================
          PROVIDER GRID
         ================================================================ */}

      {bestFitContext ? (
        <section aria-labelledby="provider-best-fit-title" className="grid min-w-0 gap-3 rounded-[22px] border border-primary/15 bg-secondary/50 p-4 sm:p-5">
          <header>
            <h2 id="provider-best-fit-title" className="text-xl font-extrabold tracking-tight text-foreground">Best matches on this page</h2>
            <p className="mt-1 text-sm text-feasta-text-secondary">Providers that match your selected services and event details.</p>
            <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">Based on this page only. Confirmed availability comes first, then service, occasion, guest capacity, and documented service area. Missing details are not confirmed matches.</p>
            <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">{!authenticatedCustomer
              ? "Preliminary matches only. Availability has not been checked. Sign in as a customer to check your schedule."
              : !filters.eventContext ? "Availability has not been checked. Add a valid date, start and end time, and guest count."
              : "Availability and booking lead time are validated by the existing schedule check."}</p>
          </header>
          {recommendations.length ? providerGrid(recommendations.map((fit) => fit.provider)) : (
            <p className="text-sm text-feasta-text-secondary" role="status">No supported best-fit matches on this page. You can still browse the providers below or update your event details.</p>
          )}
        </section>
      ) : null}
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`provider-discovery-${section.id}`} className="grid min-w-0 gap-4">
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h2 id={`provider-discovery-${section.id}`} className="text-xl font-extrabold tracking-tight text-foreground">{section.title}</h2>
              <p className="mt-1 text-sm text-feasta-text-secondary">{section.description}</p>
            </div>
            {section.href ? (
              <Link href={section.href} aria-label={`See all ${section.title} providers`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-bold text-primary-strong hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                See all <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </header>
          {providerGrid(section.providers)}
        </section>
      ))}
      {remaining.length > 0 && (sections.length > 0 || recommendations.length > 0) ? (
        <section aria-labelledby="remaining-provider-results-title" className="grid min-w-0 gap-4">
          <h2 id="remaining-provider-results-title" className="text-xl font-extrabold tracking-tight text-foreground">More providers</h2>
          {providerGrid(remaining)}
        </section>
      ) : providerGrid(remaining)}
    </section>
  );
}
