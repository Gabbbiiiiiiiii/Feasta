import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Camera,
  Check,
  MapPinned,
  Mic2,
  Search,
  Utensils,
} from "lucide-react";

import {LandingFooter} from "@/components/landing/landing-footer";
import {LandingHeader} from "@/components/landing/landing-header";


export const metadata: Metadata = {
  title: "Event Services",
  description:
    "Explore event-service providers and service options through FEASTA.",
};

export const revalidate = 300;

const serviceCategories = [
  {
    title: "Catering",
    description:
      "Explore catering providers and packages for different event needs.",
    href: "/customer/providers?service=catering",
    icon: Utensils,
  },
  {
    title: "Venues",
    description:
      "Discover spaces suited for intimate gatherings and larger celebrations.",
    href: "/customer/providers?category=venue_provider",
    icon: MapPinned,
  },
  {
    title: "Photography",
    description:
      "Find professionals who can document the moments that matter.",
    href: "/customer/providers?category=photographer",
    icon: Camera,
  },
  {
    title: "Entertainment",
    description:
      "Explore music and entertainment options that help bring events to life.",
    href: "/customer/providers",
    icon: Mic2,
  },
] as const;

const comparisonFactors = [
  {
    title: "Event type",
    description: "Consider the kind of celebration and the experience you want to create.",
  },
  {
    title: "Guest count",
    description: "Check whether a service or space can suit the expected size of your event.",
  },
  {
    title: "Budget",
    description: "Compare options against the amount you plan to allocate for each service.",
  },
  {
    title: "Package inclusions",
    description: "Review what each package covers and what may need to be arranged separately.",
  },
  {
    title: "Service availability",
    description: "Ask whether the provider can accommodate your preferred event date and needs.",
  },
  {
    title: "Provider fit",
    description: "Look for an approach, style, and service offering that align with your plans.",
  },
] as const;

const serviceValues = [
  {
    title: "One organized marketplace",
    description: "Discover event professionals and service options through one place.",
    icon: Search,
  },
  {
    title: "Compare options clearly",
    description: "Explore provider details and packages with your event needs in mind.",
    icon: Check,
  },
  {
    title: "Keep planning connected",
    description: "Carry service discovery forward into the supported booking journey.",
    icon: CalendarCheck,
  },
] as const;

export default function ServicesPage() {
  return (
    <>
      <LandingHeader />

      <main className="overflow-hidden bg-background pt-[72px] text-foreground">
        {/* Services hero */}
        <section className="bg-secondary px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
          <div className="mx-auto grid max-w-[1180px] items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Event Services
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.035em] sm:text-5xl lg:text-6xl">
                Find the right services for your celebration.
              </h1>
              <p className="mt-6 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                FEASTA helps you explore event professionals and service
                options through one organized marketplace, so you can find
                choices that fit your plans.
              </p>
            </div>

            <div className="relative aspect-[4/3] overflow-hidden rounded-card shadow-card sm:aspect-[16/10] lg:aspect-[4/5] xl:aspect-[6/5]">
              <Image
                src="https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=85"
                alt="Event tables and décor prepared for a celebration"
                fill
                priority
                sizes="(min-width: 1280px) 510px, (min-width: 1024px) 44vw, (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* Service categories */}
        <section className="px-5 py-16 sm:px-8 sm:py-20 lg:py-24" aria-labelledby="service-categories-title">
          <div className="mx-auto max-w-[1180px]">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Explore by service
              </p>
              <h2 id="service-categories-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Services for every part of your event.
              </h2>
              <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
                Start with a service category, then explore available provider
                profiles and package options in the marketplace.
              </p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
              {serviceCategories.map((category) => {
                const Icon = category.icon;

                return (
                  <Link
                    key={category.title}
                    href={category.href}
                    className="group flex min-h-64 flex-col rounded-card border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-floating focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary-strong transition-colors group-hover:bg-primary group-hover:text-white">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <h3 className="mt-7 text-xl font-bold">{category.title}</h3>
                    <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                      {category.description}
                    </p>
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary-strong">
                      Explore {category.title}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 transition-transform group-hover:translate-x-1"
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* How to choose */}
        <section className="bg-secondary px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <div className="max-w-xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Compare thoughtfully
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                What to consider when choosing a service.
              </h2>
              <p className="mt-5 leading-7 text-muted-foreground">
                The right option depends on your event, priorities, and the
                details offered by each provider. These factors can help guide
                your comparison.
              </p>
            </div>

            <dl className="border-y border-border">
              {comparisonFactors.map((factor, index) => (
                <div
                  key={factor.title}
                  className="grid gap-2 border-b border-border py-5 last:border-b-0 sm:grid-cols-[2.5rem_10rem_1fr] sm:items-start sm:gap-4 sm:py-6"
                >
                  <span className="text-sm font-bold tracking-[0.14em] text-primary-strong">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <dt className="font-bold text-foreground">{factor.title}</dt>
                  <dd className="text-sm leading-6 text-muted-foreground">
                    {factor.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Service discovery value */}
        <section className="bg-secondary px-5 py-20 sm:px-8 lg:py-24">
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Why discover with Feasta
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                A clearer path from searching to planning.
              </h2>
            </div>

            <div className="mt-12 grid divide-y divide-border border-y border-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {serviceValues.map((value, index) => {
                const Icon = value.icon;

                return (
                  <article
                    key={value.title}
                    className={`py-7 lg:px-8 lg:py-3 ${index === 0 ? "lg:pl-0" : ""} ${index === serviceValues.length - 1 ? "lg:pr-0" : ""}`}
                  >
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary-strong">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <h3 className="mt-5 text-xl font-bold">{value.title}</h3>
                    <p className="mt-2 leading-7 text-muted-foreground">
                      {value.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </>
  );
}
