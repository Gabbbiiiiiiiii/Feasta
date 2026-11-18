import {ImageGallery} from "@/components/customer/discovery/image-gallery";
import {ExpandablePackageDescription} from "./expandable-package-description";
import {ArrowLeft, ArrowRight, Check, MapPin, PackageOpen, Store} from "lucide-react";
import Link from "next/link";
import type {ReactNode} from "react";

import {providerServiceTypeLabel} from "@/lib/customer/providers/provider-catalog";
import {providerProfileHref} from "@/lib/customer/providers/provider-query";
import {PUBLIC_PACKAGE_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";
import {serviceCategoryName, type ServiceCategoryOption} from "@/lib/service-categories/service-category-types";

export function PackageBackLink({href, label = "Back to packages"}: {href: string; label?: string}) {
  return (
    <Link
      href={href}
      className={[
        "group inline-flex min-h-11 w-fit items-center gap-2",
        "rounded-full px-1",
        "text-sm font-bold text-primary-strong",
        "transition-colors",
        "hover:text-primary",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-primary focus-visible:ring-offset-2",
      ].join(" ")}
    >
      <ArrowLeft
        aria-hidden="true"
        className="size-4 transition-transform duration-normal group-hover:-translate-x-0.5 motion-reduce:transform-none"
      />

      {label}
    </Link>
  );
}

export function PackageHero({name, description, provider, images, booking}: {
  name: string;
  description: string | null;
  provider: Pick<PublicProvider, "id" | "businessName" | "location">;
  images: readonly {url: string; title: string}[];
  booking: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-feasta-border-soft bg-white shadow-[0_14px_42px_rgb(0_75_59/0.065)]">
      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Event package
          </p>

          <h1 className="mt-2 break-words text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl">
            {name}
          </h1>

          <p className="mt-3 text-sm text-feasta-text-secondary sm:text-base">
            By{" "}
            <Link
              href={providerProfileHref(
                provider.id,
                PUBLIC_PACKAGE_MARKETPLACE_PATH,
              )}
              className="font-bold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {provider.businessName}
            </Link>
          </p>

          {provider.location ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-feasta-text-secondary">
              <MapPin
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />

              <span className="break-words">
                {provider.location}
              </span>
            </p>
          ) : null}

          {description ? (
            <ExpandablePackageDescription
              description={description}
            />
          ) : null}
        </div>

        <aside aria-label="Price and booking" className="min-w-0 rounded-[20px] border border-feasta-border-soft bg-feasta-canvas p-4 [overflow-wrap:anywhere]">
          {booking}
        </aside>
      </div>
      {images.length > 0 ? (
        <div className="border-t border-feasta-divider p-5 sm:p-6">
          <ImageGallery featured label="Package images" images={images} />
        </div>
      ) : (
        <div className="mx-5 mb-5 flex items-center gap-3 rounded-xl bg-feasta-canvas px-4 py-3 text-sm text-feasta-text-tertiary sm:mx-6 sm:mb-6">
          <PackageOpen aria-hidden="true" className="size-5 shrink-0" />
          No package images available
        </div>
      )}
    </section>
  );
}

export function PackageInclusions({inclusionGroups = [], children}: {
  inclusionGroups?: readonly {label: string; items: readonly string[]}[];
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="package-inclusions"
      className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(0_75_59/0.035)] sm:p-6"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          Package inclusions
        </p>

        <h2
          id="package-inclusions"
          className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
        >
          What comes with this package.
        </h2>

      </div>

      {inclusionGroups.map((group) => <div key={group.label} className="mt-6">
        <h3 className="text-base font-bold">{group.label}</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {group.items.map((inclusion) => (
            <li
              key={inclusion}
              className="flex min-w-0 items-start gap-2 py-1"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary-strong">
                <Check
                  aria-hidden="true"
                  className="size-4"
                />
              </span>

              <span className="min-w-0 break-words text-sm font-semibold leading-6 text-feasta-text-secondary">
                {inclusion}
              </span>
            </li>
          ))}
        </ul>
      </div>)}
      {children}
    </section>
  );
}

export function PackageProvider({provider, serviceCategoryOptions}: {
  provider: Pick<PublicProvider, "id" | "businessName" | "serviceType" | "categories" | "location">;
  serviceCategoryOptions: readonly ServiceCategoryOption[];
}) {
  return (
    <section
      aria-labelledby="package-provider"
      className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(0_75_59/0.035)] sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-secondary text-primary-strong">
              <Store
                aria-hidden="true"
                className="size-5"
              />
            </span>

            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                Package provider
              </p>

              <h2
                id="package-provider"
                className="mt-1 break-words text-lg font-extrabold text-foreground"
              >
                {provider.businessName}
              </h2>

              <p className="mt-2 text-sm font-semibold text-feasta-text-secondary">
                {providerServiceTypeLabel(
                  provider.serviceType,
                )}
              </p>
            </div>
          </div>

          {provider.categories.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {provider.categories.map((category) => (
                <li key={category}>
                  <span className="inline-flex rounded-full border border-primary/10 bg-secondary px-3 py-1.5 text-xs font-bold text-primary-strong">
                    {serviceCategoryName(category, serviceCategoryOptions)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {provider.location ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-feasta-text-secondary">
              <MapPin
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />

              <span>
                {provider.location}
              </span>
            </p>
          ) : null}
        </div>

        <Link
          href={providerProfileHref(
            provider.id,
            PUBLIC_PACKAGE_MARKETPLACE_PATH,
          )}
          className={[
            "group inline-flex min-h-12 items-center justify-center gap-2",
            "rounded-full border border-feasta-border-strong bg-white px-5",
            "text-sm font-bold text-foreground",
            "transition-[transform,border-color,background-color,color]",
            "hover:-translate-y-0.5 hover:border-primary/25",
            "hover:bg-secondary hover:text-primary-strong",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary focus-visible:ring-offset-2",
            "motion-reduce:transform-none",
          ].join(" ")}
        >
          View provider

          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
          />
        </Link>
      </div>
    </section>
  );
}

export function DetailFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-primary-strong shadow-sm [&_svg]:size-[18px]">
        {icon}
      </span>

      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-feasta-text-tertiary">
          {label}
        </p>

        <p className="mt-1 break-words text-sm font-extrabold text-foreground">
          {value}
        </p>

      </div>
    </div>
  );
}

export const packageRequestClassName = [
  "group mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2",
  "rounded-full bg-primary px-5",
  "text-sm font-bold text-primary-foreground",
  "shadow-brand-soft",
  "transition-[transform,background-color,box-shadow]",
  "hover:-translate-y-0.5 hover:bg-primary-hover",
  "hover:shadow-brand",
  "focus-visible:outline-none focus-visible:ring-2",
  "focus-visible:ring-primary focus-visible:ring-offset-2",
  "motion-reduce:transform-none",
].join(" ");

export function packageGuestRange(
  packageRecord: Pick<PublicProvider, "minimumGuests" | "maximumGuests">,
): string | null {
  const {
    minimumGuests,
    maximumGuests,
  } = packageRecord;

  if (
    minimumGuests !== null &&
    maximumGuests !== null
  ) {
    return minimumGuests === maximumGuests
      ? `${minimumGuests.toLocaleString("en-PH")} guests`
      : `${minimumGuests.toLocaleString(
          "en-PH",
        )}–${maximumGuests.toLocaleString(
          "en-PH",
        )} guests`;
  }

  if (maximumGuests !== null) {
    return `Up to ${maximumGuests.toLocaleString(
      "en-PH",
    )} guests`;
  }

  return minimumGuests !== null
    ? `From ${minimumGuests.toLocaleString(
        "en-PH",
      )} guests`
    : null;
}
