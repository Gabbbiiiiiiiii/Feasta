"use client";

import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import type {ProviderDiscoveryFilters} from "@/lib/customer/providers/provider-types";
import type {ServiceCategoryOption} from "@/lib/service-categories/service-category-types";
import {cn} from "@/lib/utils";

export function ProviderIndustrySelector({
  filters,
  serviceCategoryOptions,
}: {
  filters: ProviderDiscoveryFilters;
  serviceCategoryOptions: readonly ServiceCategoryOption[];
}) {
  const categories = serviceCategoryOptions.filter(
    (option) => option.status === "active",
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  const [canScrollLeft, setCanScrollLeft] =
    useState(false);

  const [canScrollRight, setCanScrollRight] =
    useState(false);

  const updateScrollState = useCallback(() => {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    const remainingRight =
      container.scrollWidth -
      container.clientWidth -
      container.scrollLeft;

    setCanScrollLeft(
      container.scrollLeft > 8,
    );

    setCanScrollRight(
      remainingRight > 8,
    );
  }, []);

  useEffect(() => {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    const frame = requestAnimationFrame(
      updateScrollState,
    );

    container.addEventListener(
      "scroll",
      updateScrollState,
      {passive: true},
    );

    const resizeObserver =
      new ResizeObserver(updateScrollState);

    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frame);

      container.removeEventListener(
        "scroll",
        updateScrollState,
      );

      resizeObserver.disconnect();
    };
  }, [
    categories.length,
    updateScrollState,
  ]);

  if (categories.length === 0) {
    return null;
  }

  function scrollCategories(
    direction: "left" | "right",
  ) {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    const distance = Math.max(
      300,
      container.clientWidth * 0.65,
    );

    container.scrollBy({
      left:
        direction === "right"
          ? distance
          : -distance,
      behavior: "smooth",
    });
  }

  return (
    <nav
      aria-label="Provider industries"
      className={[
        "sticky top-[4.75rem] z-30",
        "w-full max-w-full overflow-hidden",
        "rounded-[22px]",
        "border border-feasta-border-soft",
        "bg-white/95",
        "shadow-[0_10px_30px_rgb(43_33_29/0.075)]",
        "backdrop-blur-md",
      ].join(" ")}
    >
      <div className="flex w-full min-w-0 items-center gap-3 p-3">
        {/* =====================================================
            TITLE
           ===================================================== */}

        <div className="hidden shrink-0 pl-1 sm:block">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Industries
          </p>

          <p className="mt-0.5 whitespace-nowrap text-xs font-semibold text-feasta-text-secondary">
            Choose a service
          </p>
        </div>

        {/* =====================================================
            LEFT ARROW
           ===================================================== */}

        <CategoryArrow
          direction="left"
          visible={canScrollLeft}
          onClick={() =>
            scrollCategories("left")
          }
        />

        {/* =====================================================
            SCROLLABLE CATEGORY ROW
           ===================================================== */}

        <div className="relative min-w-0 flex-1 overflow-hidden">
          {canScrollLeft ? (
            <div
              aria-hidden="true"
              className={[
                "pointer-events-none absolute",
                "inset-y-0 left-0 z-10 w-8",
                "bg-gradient-to-r",
                "from-white via-white/80",
                "to-transparent",
              ].join(" ")}
            />
          ) : null}

          <div
            ref={scrollRef}
            className={[
              "flex w-full min-w-0 max-w-full",
              "items-center gap-2",
              "overflow-x-auto overflow-y-hidden",
              "overscroll-x-contain",
              "scroll-smooth",
              "[scrollbar-width:none]",
              "[-ms-overflow-style:none]",
              "[&::-webkit-scrollbar]:hidden",
            ].join(" ")}
          >
            <IndustryLink
              href={buildCategoryHref(
                filters,
                "all",
              )}
              active={
                filters.category === "all"
              }
              label="All services"
            />

            {categories.map((category) => (
              <IndustryLink
                key={category.code}
                href={buildCategoryHref(
                  filters,
                  category.code,
                )}
                active={
                  filters.category ===
                  category.code
                }
                label={category.name}
              />
            ))}
          </div>

          {canScrollRight ? (
            <div
              aria-hidden="true"
              className={[
                "pointer-events-none absolute",
                "inset-y-0 right-0 z-10 w-8",
                "bg-gradient-to-l",
                "from-white via-white/80",
                "to-transparent",
              ].join(" ")}
            />
          ) : null}
        </div>

        {/* =====================================================
            RIGHT ARROW
           ===================================================== */}

        <CategoryArrow
          direction="right"
          visible={canScrollRight}
          onClick={() =>
            scrollCategories("right")
          }
        />
      </div>
    </nav>
  );
}

function CategoryArrow({
  direction,
  visible,
  onClick,
}: {
  direction: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  const Icon =
    direction === "left"
      ? ChevronLeft
      : ChevronRight;

  const label =
    direction === "left"
      ? "Show previous service categories"
      : "Show more service categories";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!visible}
      aria-label={label}
      className={cn(
        [
          "grid size-10 shrink-0",
          "place-items-center rounded-full",
          "border border-feasta-border-soft",
          "bg-white text-primary-strong",
          "shadow-[0_4px_14px_rgb(43_33_29/0.12)]",
          "outline-none",
          "transition-[transform,background-color,opacity]",
          "focus-visible:ring-2",
          "focus-visible:ring-primary",
          "focus-visible:ring-offset-2",
        ].join(" "),
        visible
          ? [
              "opacity-100",
              "hover:scale-105",
              "hover:bg-secondary",
            ].join(" ")
          : [
              "pointer-events-none",
              "w-0 border-0 p-0 opacity-0",
            ].join(" "),
      )}
    >
      <Icon
        aria-hidden="true"
        className="size-5"
      />
    </button>
  );
}

function buildCategoryHref(
  filters: ProviderDiscoveryFilters,
  category: ProviderDiscoveryFilters["category"],
): string {
  return providerDiscoveryHref({
    ...filters,
    serviceType: "all",
    category,
    cursor: null,
  });
}

function IndustryLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={
        active ? "page" : undefined
      }
      className={cn(
        [
          "inline-flex min-h-10 shrink-0",
          "items-center justify-center",
          "whitespace-nowrap rounded-full",
          "border px-4",
          "text-xs font-extrabold",
          "outline-none",
          "transition-[transform,border-color,background-color,color,box-shadow]",
          "focus-visible:ring-2",
          "focus-visible:ring-primary",
          "focus-visible:ring-offset-2",
          "motion-reduce:transform-none",
        ].join(" "),
        active
          ? [
              "border-primary bg-primary",
              "text-primary-foreground",
              "shadow-brand-soft",
            ].join(" ")
          : [
              "border-feasta-border-soft",
              "bg-feasta-canvas",
              "text-foreground",
              "hover:-translate-y-0.5",
              "hover:border-primary/25",
              "hover:bg-secondary",
              "hover:text-primary-strong",
            ].join(" "),
      )}
    >
      {label}
    </Link>
  );
}