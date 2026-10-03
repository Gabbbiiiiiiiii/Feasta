import type {Metadata} from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  PackageOpen,
  PartyPopper,
  Search,
  SlidersHorizontal,
  Store,
} from "lucide-react";

import {LandingFooter} from "@/components/landing/landing-footer";
import {LandingHeader} from "@/components/landing/landing-header";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "See how FEASTA helps customers discover event services, send requests, confirm bookings, and follow event progress.",
};

const landingContainerClassName =
  "mx-auto w-full max-w-[1360px] px-5 sm:px-7 lg:px-10 xl:px-12";

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
    icon: ClipboardCheck,
  },
  {
    number: "03",
    title: "Confirm",
    description:
      "Review Provider responses and complete the required booking steps.",
    icon: CheckCircle2,
  },
  {
    number: "04",
    title: "Manage & Celebrate",
    description:
      "Track your event, communicate with Providers, and follow the celebration through completion.",
    icon: PartyPopper,
  },
] as const;

const discoveryFeatures = [
  {
    title: "Browse service categories",
    description: "Explore the types of event services available through FEASTA.",
    icon: Search,
  },
  {
    title: "Discover Providers",
    description: "Find local Providers offering services for your celebration.",
    icon: Store,
  },
  {
    title: "Review available options",
    description: "View services and packages where a Provider makes them available.",
    icon: PackageOpen,
  },
  {
    title: "Compare the right fit",
    description: "Consider the available options that suit your event needs.",
    icon: SlidersHorizontal,
  },
] as const;

const eventDetails = [
  "Event type",
  "Event date and time",
  "Expected guest count",
  "Package or service selection",
  "Service inclusions or add-ons",
  "Venue or address",
  "Notes or requirements",
] as const;

const confirmationSteps = [
  {
    title: "Provider review",
    description: "The Provider reviews the event details in the request.",
  },
  {
    title: "Provider response",
    description: "The Provider may accept or reject through the supported workflow.",
  },
  {
    title: "Booking step",
    description:
      "If accepted, the Customer completes the required booking or payment steps shown by FEASTA.",
  },
  {
    title: "Toward confirmation",
    description:
      "Successful completion moves the request toward a confirmed booking.",
  },
] as const;

const managementFeatures = [
  "Follow booking progress",
  "Communicate with the selected Provider",
  "Review important booking details",
  "Follow the event toward completion",
] as const;

const publicStatuses = [
  {
    label: "Request submitted",
    description: "Your event details have been sent to the Provider for review.",
  },
  {
    label: "Provider reviewing",
    description: "The Provider is considering the details of your event request.",
  },
  {
    label: "Payment required",
    description: "Complete the payment required for the booking when prompted.",
  },
  {
    label: "Confirmed",
    description: "The required booking steps have been completed successfully.",
  },
  {
    label: "In progress",
    description: "Your confirmed event is moving toward service and event day.",
  },
  {
    label: "Completed",
    description: "The event journey has reached completion.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <LandingHeader />

      <main className="overflow-hidden bg-feasta-canvas pt-[72px] text-foreground">
        {/* Compact hero */}
        <section
          aria-labelledby="how-it-works-title"
          className="relative isolate overflow-hidden bg-secondary py-12 sm:py-14 lg:py-16"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -top-48 size-[30rem] rounded-full bg-primary/[0.07] blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-52 -left-40 size-[28rem] rounded-full bg-primary/[0.05] blur-3xl"
          />

          <div className={`${landingContainerClassName} relative text-center`}>
            <p className="feasta-eyebrow">How FEASTA Works</p>
            <h1
              id="how-it-works-title"
              className="mx-auto mt-4 max-w-[900px] text-4xl font-extrabold leading-[1.06] tracking-[-0.045em] sm:text-[46px] lg:text-[52px]"
            >
              From planning to celebration, keep everything organized.
            </h1>
            <p className="mx-auto mt-5 max-w-[850px] text-base leading-7 text-feasta-text-secondary sm:text-lg sm:leading-8">
              FEASTA helps customers discover local event services, send event
              requests, complete the required booking steps, communicate with
              Providers, and follow event progress in one place.
            </p>
          </div>
        </section>

        {/* Four-step journey overview */}
        <section
          aria-labelledby="journey-overview-title"
          className="bg-feasta-canvas py-12 lg:py-14"
        >
          <div className={landingContainerClassName}>
            <div className="max-w-2xl">
              <p className="feasta-eyebrow">The journey</p>
              <h2
                id="journey-overview-title"
                className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl"
              >
                Four steps from idea to event day.
              </h2>
            </div>

            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {journeySteps.map((step) => {
                const Icon = step.icon;

                return (
                  <li
                    key={step.number}
                    className="rounded-[22px] border border-feasta-border-soft bg-white p-5 shadow-card sm:p-6"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-extrabold tracking-[0.12em] text-primary-strong">
                        {step.number}
                      </span>
                      <span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary-strong">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                    </div>
                    <h3 className="mt-5 text-xl font-extrabold tracking-[-0.025em]">
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

        {/* Discover */}
        <section
          aria-labelledby="discover-title"
          className="border-y border-feasta-border-soft bg-white py-12 lg:py-16"
        >
          <div
            className={`${landingContainerClassName} grid gap-9 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-16`}
          >
            <div className="max-w-xl">
              <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary-strong">
                <Search aria-hidden="true" className="size-5" />
              </span>
              <p className="feasta-eyebrow mt-5">Discover</p>
              <h2
                id="discover-title"
                className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl"
              >
                Find the services that fit your event.
              </h2>
              <p className="mt-4 text-base leading-7 text-feasta-text-secondary">
                Start with the occasion you are planning, then explore local
                Providers and the service options they make available through
                FEASTA.
              </p>
              <Link
                href="/customer/providers"
                className="group mt-6 inline-flex items-center gap-2 rounded-md text-sm font-bold text-primary-strong transition-colors duration-fast hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Explore Providers
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </Link>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {discoveryFeatures.map((feature) => {
                const Icon = feature.icon;

                return (
                  <li
                    key={feature.title}
                    className="flex gap-4 rounded-[18px] border border-feasta-border-soft bg-feasta-canvas p-4 sm:p-5"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
                      <Icon aria-hidden="true" className="size-[18px]" />
                    </span>
                    <div>
                      <h3 className="font-extrabold tracking-[-0.015em]">
                        {feature.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                        {feature.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Plan and request */}
        <section
          aria-labelledby="plan-request-title"
          className="bg-feasta-canvas-warm py-12 lg:py-16"
        >
          <div className={landingContainerClassName}>
            <div className="grid gap-9 lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:gap-16">
              <div className="max-w-xl">
                <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary-strong">
                  <ClipboardCheck aria-hidden="true" className="size-5" />
                </span>
                <p className="feasta-eyebrow mt-5">Plan &amp; Request</p>
                <h2
                  id="plan-request-title"
                  className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl"
                >
                  Shape your event and send your request.
                </h2>
                <p className="mt-4 text-base leading-7 text-feasta-text-secondary">
                  Depending on the selected Provider, service, or package, the
                  request may include the details needed to understand your event.
                </p>

                <aside className="mt-6 rounded-[18px] border border-primary/20 bg-white p-5 shadow-brand-subtle">
                  <p className="font-extrabold text-foreground">
                    A request is not an instant booking.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                    Submitting your details starts the Provider review. The
                    Provider must respond before the booking can move forward.
                  </p>
                </aside>
              </div>

              <div className="rounded-[22px] border border-feasta-border-soft bg-white p-5 shadow-card sm:p-6">
                <h3 className="text-lg font-extrabold tracking-[-0.02em]">
                  Request details may include
                </h3>
                <ul className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                  {eventDetails.map((detail) => (
                    <li key={detail} className="flex items-start gap-3 py-2.5">
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-5 shrink-0 text-primary-strong"
                      />
                      <span className="text-sm font-bold leading-6">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Confirm */}
        <section
          aria-labelledby="confirm-title"
          className="border-y border-feasta-border-soft bg-white py-12 lg:py-16"
        >
          <div className={landingContainerClassName}>
            <div className="max-w-3xl">
              <p className="feasta-eyebrow">Confirm</p>
              <h2
                id="confirm-title"
                className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl"
              >
                Review the Provider response and confirm.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-feasta-text-secondary">
                The response determines the next step. If a Provider cannot
                accept the request, the Customer can continue exploring other
                available Providers.
              </p>
            </div>

            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {confirmationSteps.map((step, index) => (
                <li
                  key={step.title}
                  className="rounded-[18px] border border-feasta-border-soft bg-feasta-canvas p-5"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-extrabold tracking-[-0.015em]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-5 flex items-start gap-3 rounded-[16px] border border-feasta-border-soft bg-secondary/60 p-4 sm:max-w-3xl">
              <CreditCard
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-primary-strong"
              />
              <p className="text-sm leading-6 text-feasta-text-secondary">
                When payment is required for the booking, FEASTA presents that
                step after acceptance. A successful payment helps move the
                request toward confirmation.
              </p>
            </div>
          </div>
        </section>

        {/* Manage and celebrate */}
        <section
          aria-labelledby="manage-title"
          className="bg-feasta-surface-muted py-12 lg:py-16"
        >
          <div
            className={`${landingContainerClassName} grid gap-9 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16`}
          >
            <div className="max-w-xl">
              <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary-strong">
                <PartyPopper aria-hidden="true" className="size-5" />
              </span>
              <p className="feasta-eyebrow mt-5">Manage &amp; Celebrate</p>
              <h2
                id="manage-title"
                className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl"
              >
                Stay connected through event day.
              </h2>
              <p className="mt-4 text-base leading-7 text-feasta-text-secondary">
                Keep the important parts of the booking journey together as the
                event approaches and moves through completion.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {managementFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-3 rounded-[16px] border border-feasta-border-soft bg-white p-4"
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-primary-strong"
                  />
                  <p className="text-sm font-bold leading-6">{feature}</p>
                </div>
              ))}
              <p className="mt-1 text-sm leading-6 text-feasta-text-secondary sm:col-span-2">
                After completion, the Customer may leave a review where that
                feature is supported.
              </p>
            </div>
          </div>
        </section>

        {/* Booking progress */}
        <section
          aria-labelledby="booking-progress-title"
          className="border-y border-feasta-border-soft bg-white py-12 lg:py-16"
        >
          <div className={landingContainerClassName}>
            <div className="max-w-3xl">
              <p className="feasta-eyebrow">Booking progress</p>
              <h2
                id="booking-progress-title"
                className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl"
              >
                Know what happens next.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-feasta-text-secondary">
                Clear, customer-friendly labels show what has happened and which
                action may be needed next.
              </p>
            </div>

            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {publicStatuses.map((status, index) => (
                <li
                  key={status.label}
                  className="relative flex gap-4 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-4 sm:p-5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-extrabold text-primary-strong">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-extrabold tracking-[-0.015em]">
                      {status.label}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                      {status.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Final CTA */}
        <section
          aria-labelledby="final-cta-title"
          className="bg-feasta-canvas-warm py-12 lg:py-14"
        >
          <div className={landingContainerClassName}>
            <div className="rounded-[24px] border border-primary/15 bg-secondary px-5 py-9 text-center shadow-brand-subtle sm:px-8 sm:py-10">
              <p className="feasta-eyebrow">Ready to start?</p>
              <h2
                id="final-cta-title"
                className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl"
              >
                Start planning your celebration.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-feasta-text-secondary">
                Explore local event Providers and find services for your event.
              </p>
              <div className="mt-6 flex justify-center">
                <Link
                  href="/customer/providers"
                  className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-brand-soft transition-[transform,background-color,box-shadow] duration-normal hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none"
                >
                  Explore Providers
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                  />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </>
  );
}
