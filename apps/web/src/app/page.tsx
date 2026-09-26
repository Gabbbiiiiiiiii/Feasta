import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  PartyPopper,
  Search,
  Sparkles,
  CircleCheck,
} from "lucide-react";

import { ProviderCard } from "@/components/customer/providers/provider-card";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { StartYourEventForm } from "@/components/landing/start-your-event-form";
import { getPublicProviderPage } from "@/lib/customer/providers/provider-discovery-service";
import {parseProviderDiscoveryFilters, providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import {PUBLIC_PROVIDER_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";

/* ==========================================================================
   FEASTA HOME / EVENT DISCOVERY

   Completed:
   - Phase 1A: Event-first hero
   - Phase 1A: Start Your Event
   - Phase 1B: Celebration discovery
   - Phase 1B: Event services
   - Phase 1C: Recommended local providers
   - Phase 1E: How FEASTA Works
   - Phase 1F: Lower landing-page simplification

   Upcoming:
   - Final CTA / footer polish
   ========================================================================== */

const landingContainerClassName =
  "mx-auto w-full max-w-[1360px] px-5 sm:px-7 lg:px-10 xl:px-12";

const landingImages = {
  hero: "/images/landing/hero-event.jpg",
  celebrations: {
    birthday: "/images/landing/birthday.jpg",
    wedding: "/images/landing/wedding.jpg",
    debut: "/images/landing/debut.jpg",
    corporate: "/images/landing/corporate.jpg",
    anniversary: "/images/landing/anniversary.jpg",
    other: "/images/landing/other-event.jpg",
  },
  services: {
    catering: "/images/landing/catering.jpg",
    photography: "/images/landing/photography.jpg",
    eventStyling: "/images/landing/event-styling.jpg",
    entertainment: "/images/landing/entertainment.jpg",
  },
} as const;

const eventTypes = [
  {
    label: "Birthday",
    value: "birthday",
    description: "Plan a celebration for every milestone.",
    image: landingImages.celebrations.birthday,
    imageAlt: "Tasteful birthday celebration setup",
  },
  {
    label: "Wedding",
    value: "wedding",
    description: "Bring your special day together.",
    image: landingImages.celebrations.wedding,
    imageAlt: "Elegant wedding reception setup",
  },
  {
    label: "Debut",
    value: "debut",
    description: "Plan an elegant milestone celebration.",
    image: landingImages.celebrations.debut,
    imageAlt: "Elegant formal debut celebration",
  },
  {
    label: "Corporate",
    value: "corporate",
    description: "Organize a polished professional event.",
    image: landingImages.celebrations.corporate,
    imageAlt: "Professional corporate event setup",
  },
  {
    label: "Anniversary",
    value: "anniversary",
    description: "Celebrate the moments worth remembering.",
    image: landingImages.celebrations.anniversary,
    imageAlt: "Warm anniversary celebration setting",
  },
  {
    label: "Other",
    value: "other",
    description: "Explore services for your unique occasion.",
    image: landingImages.celebrations.other,
    imageAlt: "Decorated general celebration setup",
  },
] as const;

const journeySteps = [
  {
    number: "01",
    title: "Discover",
    description:
      "Explore event services and Providers that fit your celebration.",
    icon: Search,
  },
  {
    number: "02",
    title: "Plan & Request",
    description:
      "Build your event details and send requests to the Providers you want.",
    icon: CalendarDays,
  },
  {
    number: "03",
    title: "Confirm",
    description:
      "Review Provider responses and complete the required booking steps.",
    icon: CircleCheck,
  },
  {
    number: "04",
    title: "Manage & Celebrate",
    description:
      "Keep track of your event, communicate with Providers, and enjoy your celebration.",
    icon: PartyPopper,
  },
] as const;

export const revalidate = 300;

async function getFeaturedProviders() {
  try {
    const page = await getPublicProviderPage(
      {
        search: "",
        serviceType: "all",
        category: "all",
        cursor: null,
      },
      4,
    );

    return page.providers;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const featuredProviders = await getFeaturedProviders();

  const featuredProviderGridClassName =
    featuredProviders.length === 1
      ? "mx-auto mt-8 grid w-full max-w-[360px]"
      : featuredProviders.length === 2
        ? "mx-auto mt-8 grid w-full max-w-[760px] gap-4 sm:grid-cols-2"
        : featuredProviders.length === 3
          ? "mx-auto mt-8 grid w-full max-w-[1080px] gap-4 sm:grid-cols-2 lg:grid-cols-3"
          : "mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <>
      <LandingHeader />

      <main className="min-h-screen overflow-hidden bg-background pt-[72px] text-foreground">
        {/* ==================================================================
            PHASE 1A — EVENT-FIRST HERO
           ================================================================== */}

        <section
          id="home"
          className="relative isolate overflow-hidden bg-feasta-canvas"
        >
          {/* Soft branded ambience */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-48 top-24 size-[32rem] rounded-full bg-primary/[0.055] blur-3xl"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 top-0 size-[34rem] rounded-full bg-primary-tint-strong/60 blur-3xl"
          />

          <div
            className={`${landingContainerClassName} relative py-10 sm:py-12 lg:py-14 xl:py-16`}
          >
            <div className="grid items-center gap-10 sm:gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-12 xl:gap-20">
              {/* ============================================================
                  HERO MESSAGE
                 ============================================================ */}

              <div className="max-w-[670px]">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.07] px-3.5 py-2">
                  <Sparkles
                    aria-hidden="true"
                    className="size-4 text-primary-strong"
                  />

                  <span className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                    Your celebration starts here
                  </span>
                </div>

                <h1 className="mt-6 max-w-[650px] text-[clamp(2rem,9vw,3.5rem)] font-extrabold leading-[0.95] tracking-[-0.055em] text-foreground lg:text-[clamp(3rem,4.2vw,4.25rem)]">
                  Your event,
                  <span className="block whitespace-nowrap text-primary">
                    built in one place.
                  </span>
                </h1>

                <p className="mt-7 max-w-[590px] text-base leading-7 text-feasta-text-secondary sm:text-lg sm:leading-8">
                  Discover trusted local event providers, compare services, and
                  organize your celebration through one connected planning
                  experience.
                </p>

                {/* <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="#start-your-event"
                    className={[
                      "group inline-flex min-h-12 items-center justify-center",
                      "gap-2 rounded-full bg-primary px-6",
                      "text-sm font-bold text-primary-foreground",
                      "shadow-brand",
                      "transition-[transform,background-color,box-shadow]",
                      "duration-normal",
                      "hover:-translate-y-0.5 hover:bg-primary-hover",
                      "hover:shadow-brand-strong",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary focus-visible:ring-offset-2",
                      "motion-reduce:transform-none",
                    ].join(" ")}
                  >
                    Start Planning

                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                    />
                  </a>

                  <Link
                    href="/become-a-provider"
                    className={[
                      "inline-flex min-h-12 items-center justify-center",
                      "rounded-full border border-feasta-border-strong",
                      "bg-white px-6",
                      "text-sm font-bold text-foreground",
                      "transition-colors duration-fast",
                      "hover:border-primary/35 hover:bg-feasta-surface-soft",
                      "hover:text-primary-strong",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary focus-visible:ring-offset-2",
                    ].join(" ")}
                  >
                    Become a Provider
                  </Link>
                </div> */}

                {/* Trust indicators */}
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-feasta-text-secondary">
                    <span className="grid size-5 place-items-center rounded-full bg-success-subtle">
                      <Check
                        aria-hidden="true"
                        className="size-3.5 text-success"
                        strokeWidth={3}
                      />
                    </span>

                    Approved providers
                  </span>

                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-feasta-text-secondary">
                    <span className="grid size-5 place-items-center rounded-full bg-success-subtle">
                      <Check
                        aria-hidden="true"
                        className="size-3.5 text-success"
                        strokeWidth={3}
                      />
                    </span>

                    Local event services
                  </span>

                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-feasta-text-secondary">
                    <span className="grid size-5 place-items-center rounded-full bg-success-subtle">
                      <Check
                        aria-hidden="true"
                        className="size-3.5 text-success"
                        strokeWidth={3}
                      />
                    </span>

                    Organized booking journey
                  </span>
                </div>
              </div>

              {/* ============================================================
                  HERO EVENT PHOTOGRAPH
                 ============================================================ */}

              <div className="relative mx-auto w-full max-w-[700px] lg:mx-0">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] bg-muted shadow-brand-soft sm:aspect-[16/10] sm:rounded-[32px] lg:aspect-[5/4]">
                  <Image
                    src={landingImages.hero}
                    alt="Elegant reception tables arranged for an event celebration"
                    fill
                    priority
                    sizes="(min-width: 1280px) 650px, (min-width: 1024px) 52vw, (min-width: 640px) 700px, calc(100vw - 2rem)"
                    className="object-cover"
                  />

                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/45 to-transparent"
                  />

                  <div className="absolute bottom-4 left-4 sm:bottom-5 sm:left-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/55 bg-white/90 px-3.5 py-2 text-xs font-bold text-foreground shadow-brand-soft backdrop-blur-md">
                      <MapPin
                        aria-hidden="true"
                        className="size-4 text-primary"
                      />

                      Event services in Ormoc City
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ==============================================================
                START YOUR EVENT
               ============================================================== */}

            <div
              id="start-your-event"
              className="scroll-mt-28 pt-12 sm:pt-14 lg:pt-16"
            >
              <div className="rounded-[28px] border border-feasta-border-soft bg-white p-5 shadow-[0_18px_55px_rgb(43_33_29/0.07)] sm:p-7 lg:p-8">
                <div className="grid gap-7 xl:grid-cols-[0.72fr_1.28fr] xl:items-end">
                  <div className="max-w-md">
                    <p className="feasta-eyebrow">
                      Start your event
                    </p>

                    <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl">
                      What are you celebrating?
                    </h2>

                    <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">
                      Begin with your occasion, then explore services that can
                      help bring the celebration together.
                    </p>
                  </div>

                  <StartYourEventForm />
                </div>

                <p className="mt-4 text-xs leading-5 text-feasta-text-tertiary">
                  Event details help begin your planning journey. Marketplace
                  filtering will continue to become more personalized as the
                  FEASTA discovery experience is expanded.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================================
            PHASE 1B — CELEBRATION DISCOVERY
          ================================================================== */}

        <section
          id="celebrations"
          className="relative overflow-hidden bg-white py-12 sm:py-14 lg:py-16"
        >
          <div className={landingContainerClassName}>
            <div className="max-w-3xl">
              <p className="feasta-eyebrow">
                Plan around your celebration
              </p>

              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-4xl lg:text-[42px] lg:leading-[1.05]">
                Start with what you&apos;re celebrating.
              </h2>

              <p className="mt-4 max-w-2xl text-base leading-7 text-feasta-text-secondary">
                Choose your occasion and discover local services that can help
                bring it together.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {eventTypes.map((eventType) => (
                <Link
                  key={eventType.label}
                  href={providerDiscoveryHref(parseProviderDiscoveryFilters({eventType: eventType.value}))}
                  className={[
                    "group relative flex h-[220px] items-end overflow-hidden",
                    "rounded-[22px] border border-feasta-border-soft bg-muted",
                    "shadow-[0_4px_16px_rgb(43_33_29/0.06)]",
                    "transition-[transform,border-color,box-shadow]",
                    "duration-normal",
                    "hover:-translate-y-0.5 hover:border-primary/25",
                    "hover:shadow-[0_14px_34px_rgb(43_33_29/0.12)]",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-offset-2",
                    "motion-reduce:transform-none",
                  ].join(" ")}
                >
                  <Image
                    src={eventType.image}
                    alt={eventType.imageAlt}
                    fill
                    sizes="(min-width: 1440px) 410px, (min-width: 1024px) 31vw, (min-width: 640px) 46vw, calc(100vw - 2.5rem)"
                    className="object-cover transition-transform duration-slow group-hover:scale-[1.025] motion-reduce:transform-none"
                  />

                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
                  />

                  <div className="relative flex w-full items-end justify-between gap-4 p-5 text-white">
                    <div className="min-w-0">
                      <h3 className="text-xl font-extrabold tracking-[-0.025em]">
                        {eventType.label}
                      </h3>

                      <p className="mt-1 text-sm leading-5 text-white/85">
                        {eventType.description}
                      </p>
                    </div>

                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/35 bg-black/15 backdrop-blur-sm transition-colors duration-fast group-hover:border-white/60 group-hover:bg-white group-hover:text-primary">
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                      />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ==================================================================
            PHASE 1B — EVENT SERVICES
          ================================================================== */}

        {/* <section
          id="services"
          className="relative overflow-hidden bg-feasta-canvas-warm py-12 sm:py-14 lg:py-16"
        >
          <div className={landingContainerClassName}>
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="feasta-eyebrow">
                  Event services
                </p>

                <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-4xl sm:leading-[1.08]">
                  Services for every part of your event.
                </h2>

                <p className="mt-4 max-w-xl text-base leading-7 text-feasta-text-secondary">
                  Discover local providers for the services that bring your
                  celebration together.
                </p>
              </div>

              <Link
                href="/services"
                className={[
                  "group inline-flex min-h-11 shrink-0 items-center justify-center",
                  "gap-2 rounded-full border border-primary/20 bg-white px-5",
                  "text-sm font-bold text-primary-strong shadow-brand-subtle",
                  "transition-[transform,border-color,background-color,box-shadow]",
                  "duration-normal",
                  "hover:-translate-y-0.5 hover:border-primary/35",
                  "hover:bg-secondary hover:shadow-brand-soft",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary focus-visible:ring-offset-2",
                  "motion-reduce:transform-none",
                ].join(" ")}
              >
                Explore Event Services

                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </Link>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {services.map((service) => (
                <Link
                  key={service.title}
                  href="/customer/providers"
                  className={[
                    "group flex h-full flex-col overflow-hidden",
                    "rounded-[22px] border border-feasta-border-soft bg-white",
                    "shadow-[0_4px_16px_rgb(43_33_29/0.055)]",
                    "transition-[transform,border-color,box-shadow]",
                    "duration-normal",
                    "hover:-translate-y-0.5 hover:border-primary/25",
                    "hover:shadow-[0_14px_32px_rgb(43_33_29/0.1)]",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-offset-2",
                    "motion-reduce:transform-none",
                  ].join(" ")}
                >
                  <div className="relative h-[190px] overflow-hidden bg-muted">
                    <Image
                      src={service.image}
                      alt={service.imageAlt}
                      fill
                      sizes="(min-width: 1440px) 305px, (min-width: 1024px) 24vw, (min-width: 640px) 46vw, calc(100vw - 2.5rem)"
                      className="object-cover transition-transform duration-slow group-hover:scale-[1.025] motion-reduce:transform-none"
                    />
                  </div>

                  <div className="flex min-h-[130px] items-end justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <h3 className="text-xl font-extrabold tracking-[-0.025em] text-foreground">
                        {service.title}
                      </h3>

                      <p className="mt-2 text-sm leading-5 text-feasta-text-secondary">
                        {service.description}
                      </p>
                    </div>

                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-feasta-border-soft bg-feasta-canvas text-primary-strong transition-[border-color,background-color,color] duration-fast group-hover:border-primary/20 group-hover:bg-secondary group-hover:text-primary">
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                      />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section> */}

        {/* ==================================================================
            PHASE 1E — HOW FEASTA WORKS
          ================================================================== */}

        <section
          id="how-it-works"
          className="relative overflow-hidden bg-feasta-canvas-warm py-12 lg:py-16"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-48 top-0 size-[34rem] rounded-full bg-primary/[0.045] blur-3xl"
          />

          <div className={`${landingContainerClassName} relative`}>
            {/* ================================================================
                SECTION INTRO
              ================================================================ */}

            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10">
              <div className="max-w-2xl">
                <p className="feasta-eyebrow">
                  How FEASTA Works
                </p>

                <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-4xl sm:leading-[1.08]">
                  From idea to celebration.
                </h2>

                <p className="mt-4 max-w-xl text-base leading-7 text-feasta-text-secondary">
                  Plan your event, connect with Providers, and keep everything
                  organized in one place.
                </p>
              </div>

              <Link
                href="/how-it-works"
                className={[
                  "group inline-flex w-fit shrink-0 items-center gap-2",
                  "text-sm font-bold text-primary-strong",
                  "transition-colors duration-fast hover:text-primary",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary focus-visible:ring-offset-2",
                ].join(" ")}
              >
                View the complete process

                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </Link>
            </div>

            {/* ================================================================
                JOURNEY
              ================================================================ */}

            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {journeySteps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <li
                    key={step.number}
                    className="rounded-[22px] border border-feasta-border-soft bg-white p-5 shadow-[0_4px_16px_rgb(43_33_29/0.045)] sm:p-6"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-extrabold tracking-[0.12em] text-primary-strong">
                        {step.number}
                      </span>

                      <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary-strong">
                          <Icon
                            aria-hidden="true"
                            className="size-5"
                            strokeWidth={2}
                          />
                        </span>

                        {index < journeySteps.length - 1 ? (
                          <ArrowRight
                            aria-hidden="true"
                            className="hidden size-4 text-feasta-text-tertiary lg:block"
                          />
                        ) : null}
                      </div>
                    </div>

                    <h3 className="mt-5 text-xl font-extrabold tracking-[-0.025em] text-foreground">
                      {step.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                      {step.description}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ==================================================================
            PHASE 1C — RECOMMENDED LOCAL PROVIDERS
          ================================================================== */}

        <section
          id="providers"
          className="relative overflow-hidden bg-white py-12 lg:py-16"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-48 top-20 size-[30rem] rounded-full bg-primary/[0.035] blur-3xl"
          />

          <div className={`${landingContainerClassName} relative`}>
            {/* ================================================================
                SECTION INTRO
              ================================================================ */}

            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10">
              <div className="max-w-3xl">
                <p className="feasta-eyebrow">
                  Recommended local Providers
                </p>

                <h2 className="mt-3 max-w-[760px] text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-4xl sm:leading-[1.08]">
                  Find services for your celebration.
                </h2>

                <p className="mt-4 max-w-2xl text-base leading-7 text-feasta-text-secondary">
                  Explore local Providers available through FEASTA and compare
                  services that fit your event.
                </p>
              </div>

              <Link
                href={PUBLIC_PROVIDER_MARKETPLACE_PATH}
                className={[
                  "group inline-flex w-fit shrink-0 items-center gap-2",
                  "rounded-full border border-feasta-border-strong",
                  "bg-white px-5 py-3",
                  "text-sm font-bold text-foreground",
                  "transition-[border-color,background-color,color,transform]",
                  "duration-normal",
                  "hover:-translate-y-0.5 hover:border-primary/35",
                  "hover:bg-secondary hover:text-primary-strong",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary focus-visible:ring-offset-2",
                  "motion-reduce:transform-none",
                ].join(" ")}
              >
                Explore all Providers

                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </Link>
            </div>

            {/* ================================================================
                PROVIDER DISCOVERY
              ================================================================ */}

            {featuredProviders.length > 0 ? (
              <div className={featuredProviderGridClassName}>
                {featuredProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                  />
                ))}
              </div>
            ) : (
              /* ==============================================================
                  EMPTY STATE

                  Important:
                  The homepage no longer completely hides provider discovery when
                  Firestore returns zero public providers.
                ============================================================== */

              <div className="mt-9 overflow-hidden rounded-[26px] border border-feasta-border-soft bg-feasta-canvas">
                <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-10">
                  <div className="max-w-2xl">
                    <div className="grid size-12 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                      <Search
                        aria-hidden="true"
                        className="size-5"
                      />
                    </div>

                    <h3 className="mt-5 text-xl font-extrabold tracking-[-0.025em] text-foreground sm:text-2xl">
                      Explore the FEASTA marketplace.
                    </h3>

                    <p className="mt-2.5 text-sm leading-6 text-feasta-text-secondary sm:text-base sm:leading-7">
                      Browse available event providers and discover services for
                      your celebration.
                    </p>
                  </div>

                  <Link
                    href={PUBLIC_PROVIDER_MARKETPLACE_PATH}
                    className={[
                      "group inline-flex min-h-11 w-fit items-center",
                      "justify-center gap-2 rounded-full border border-feasta-border-strong bg-white px-5",
                      "text-sm font-bold text-foreground",
                      "transition-[transform,border-color,background-color,color]",
                      "duration-normal",
                      "hover:-translate-y-0.5 hover:border-primary/35",
                      "hover:bg-secondary hover:text-primary-strong",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary focus-visible:ring-offset-2",
                      "motion-reduce:transform-none",
                    ].join(" ")}
                  >
                    Browse providers

                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                    />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
