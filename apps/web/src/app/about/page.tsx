import type {Metadata} from "next";
import Image from "next/image";
import {
  CalendarCheck,
  Check,
  MapPin,
  Search,
  Store,
  UsersRound,
} from "lucide-react";

import {LandingFooter} from "@/components/landing/landing-footer";
import {LandingHeader} from "@/components/landing/landing-header";

export const metadata: Metadata = {
  title: "About Feasta",
  description:
    "Learn how FEASTA connects customers with event-service providers in Ormoc City.",
};

const customerBenefits = [
  "Discover event professionals",
  "Compare services and packages",
  "Customize event needs",
  "Manage booking progress",
];

const providerBenefits = [
  "Present services and packages",
  "Receive customer booking requests",
  "Review and manage event participation",
  "Connect with potential customers",
];

const planningFriction = [
  "Discovering suitable providers",
  "Comparing available options",
  "Organizing booking details",
  "Keeping the event process clear",
];

const customerJourney = [
  "Discover a provider",
  "Explore services or packages",
  "Share event needs",
  "Submit a booking request",
];

const providerJourney = [
  "Receive the request",
  "Review event requirements",
  "Accept or reject",
  "Continue the booking journey",
];

const landingContainerClassName =
  "mx-auto w-full max-w-[1360px] px-5 sm:px-7 lg:px-10 xl:px-12";

export default function AboutPage() {
  return (
    <>
      <LandingHeader />

      <main className="overflow-hidden bg-background pt-[72px] text-foreground">
        {/* About introduction */}
        <section className="py-14 sm:py-16 lg:py-20">
          <div
            className={`${landingContainerClassName} grid items-center gap-9 md:grid-cols-2 md:gap-12 lg:gap-16`}
          >
            <div className="relative h-[320px] overflow-hidden rounded-[24px] border border-border bg-muted shadow-card sm:h-[400px] md:h-[460px] lg:h-[500px]">
              <Image
                src="/images/landing/cta-banner.jpg"
                alt="Outdoor celebration venue arranged with dining tables, flowers, and string lights"
                fill
                priority
                sizes="(min-width: 1280px) 620px, (min-width: 1024px) calc(50vw - 56px), (min-width: 600px) calc(100vw - 56px), calc(100vw - 40px)"
                className="object-cover object-center"
              />
            </div>

            <div className="max-w-[600px] md:justify-self-end">
              <p className="feasta-eyebrow">
                What Feasta is
              </p>
              <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-[3.4rem]">
                One place to discover and plan your event.
              </h1>
              <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                FEASTA brings customers and event-service providers into one
                organized marketplace, making it easier to discover services,
                compare options, and move through the booking journey.
              </p>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Customers can keep their planning journey organized while
                providers have a clear place to present their services and
                respond to event opportunities.
              </p>
            </div>
          </div>
        </section>

        {/* Who Feasta serves */}
        <section className="bg-secondary py-14 sm:py-16 lg:py-20">
          <div className={landingContainerClassName}>
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Who Feasta serves
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Built for both sides of every celebration.
              </h2>
              <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
                FEASTA gives customers a clearer way to plan and gives event
                professionals a focused place to offer their services.
              </p>
            </div>

            <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-14 lg:mt-14 lg:gap-20">
              <article className="border-t-2 border-primary pt-7">
                <div className="flex items-center gap-4">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
                    <UsersRound aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary-strong">
                      Planning an event
                    </p>
                    <h3 className="mt-1 text-2xl font-bold">Customers</h3>
                  </div>
                </div>
                <p className="mt-5 leading-7 text-muted-foreground">
                  Explore the people and services that fit an event, then keep
                  requests and booking progress in one place.
                </p>
                <ul className="mt-6 grid gap-3">
                  {customerBenefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3">
                      <Check
                        aria-hidden="true"
                        className="mt-1 size-5 shrink-0 text-primary-strong"
                      />
                      <span className="leading-7">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="border-t-2 border-primary pt-7">
                <div className="flex items-center gap-4">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
                    <Store aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary-strong">
                      Offering event services
                    </p>
                    <h3 className="mt-1 text-2xl font-bold">Providers</h3>
                  </div>
                </div>
                <p className="mt-5 leading-7 text-muted-foreground">
                  Maintain a service presence, receive event requests, and
                  decide which opportunities are the right fit.
                </p>
                <ul className="mt-6 grid gap-3">
                  {providerBenefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3">
                      <Check
                        aria-hidden="true"
                        className="mt-1 size-5 shrink-0 text-primary-strong"
                      />
                      <span className="leading-7">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* Why Feasta exists */}
        <section className="py-14 sm:py-16 lg:py-20">
          <div className={`${landingContainerClassName} grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20`}>
            <div className="max-w-xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Why Feasta exists
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Event planning should not require juggling multiple platforms.
              </h2>
              <p className="mt-5 leading-7 text-muted-foreground">
                FEASTA was created to bring the essential parts of finding and
                booking event services into a clearer, more organized journey.
              </p>
            </div>

            <ol className="border-y border-border">
              {planningFriction.map((item, index) => (
                <li
                  key={item}
                  className="flex items-center gap-5 border-b border-border py-5 last:border-b-0 sm:gap-6 sm:py-6"
                >
                  <span className="text-sm font-bold tracking-[0.14em] text-primary-strong">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-lg font-bold">{item}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Marketplace connection */}
        <section className="bg-foreground py-14 text-white sm:py-16 lg:py-20">
          <div className={landingContainerClassName}>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/70">
                One connected marketplace
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
                How Feasta connects both sides.
              </h2>
              <p className="mt-5 leading-7 text-white/70">
                Customers share what they need, providers review the request,
                and the booking journey continues with clear next steps.
              </p>
            </div>

            <div className="mt-12 grid gap-12 lg:mt-14 lg:grid-cols-2 lg:gap-16">
              <div>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Search aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="text-xl font-bold text-white">Customer journey</h3>
                </div>
                <ol className="mt-6 border-l border-white/20 pl-6">
                  {customerJourney.map((step, index) => (
                    <li key={step} className="relative pb-6 last:pb-0">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[29px] top-1.5 size-2 rounded-full bg-primary"
                      />
                      <span className="text-xs font-bold tracking-[0.14em] text-white/70">
                        STEP {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="mt-1 font-bold text-white">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <CalendarCheck aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="text-xl font-bold text-white">Provider response</h3>
                </div>
                <ol className="mt-6 border-l border-white/20 pl-6">
                  {providerJourney.map((step, index) => (
                    <li key={step} className="relative pb-6 last:pb-0">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[29px] top-1.5 size-2 rounded-full bg-primary"
                      />
                      <span className="text-xs font-bold tracking-[0.14em] text-white/70">
                        STEP {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="mt-1 font-bold text-white">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <p className="mx-auto mt-12 max-w-3xl border-t border-white/10 pt-7 text-center leading-7 text-white/70">
              When a request moves forward, the supported booking journey can
              continue through confirmation, payment, and event completion.
            </p>
          </div>
        </section>

        {/* Local focus */}
        <section className="py-14 sm:py-16 lg:py-20">
          <div className={`${landingContainerClassName} flex flex-col gap-6 rounded-dialog border border-border bg-secondary py-10 shadow-card sm:py-12 md:flex-row md:items-center md:gap-10`}>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
              <MapPin aria-hidden="true" className="size-6" />
            </span>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Ormoc City, Leyte
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Built around event planning in Ormoc City.
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                FEASTA&apos;s current focus is helping customers and event-service
                providers connect around celebrations in Ormoc City, Leyte.
              </p>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </>
  );
}
