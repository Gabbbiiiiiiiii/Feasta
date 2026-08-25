import type {Metadata} from "next";
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
    "Learn how the FEASTA customer journey moves from service discovery to booking completion.",
};

const journeyStages = [
  {
    number: "01",
    title: "Discover",
    description: "Browse event professionals and service categories.",
    icon: Search,
  },
  {
    number: "02",
    title: "Explore",
    description: "Review provider offerings, services, and packages.",
    icon: PackageOpen,
  },
  {
    number: "03",
    title: "Customize",
    description: "Shape the event details and options you need.",
    icon: SlidersHorizontal,
  },
  {
    number: "04",
    title: "Request",
    description: "Send your event requirements to the provider.",
    icon: ClipboardCheck,
  },
  {
    number: "05",
    title: "Provider Decision",
    description: "The provider reviews and accepts or rejects the request.",
    icon: Store,
  },
  {
    number: "06",
    title: "Payment",
    description: "Complete the required down-payment step after acceptance.",
    icon: CreditCard,
  },
  {
    number: "07",
    title: "Confirm",
    description: "A successfully processed payment confirms the booking.",
    icon: CheckCircle2,
  },
  {
    number: "08",
    title: "Celebrate",
    description: "Follow progress through the event and completion.",
    icon: PartyPopper,
  },
] as const;

const discoveryPoints = [
  "Browse event professionals",
  "Explore service categories",
  "View provider offerings and packages",
  "Compare options for your celebration",
] as const;

const eventDetails = [
  "Event type",
  "Event date and time",
  "Expected guest count",
  "Package or service options",
  "Service inclusions and add-ons",
  "Venue or address details",
  "Notes and event requirements",
] as const;

const publicStatuses = [
  {
    label: "Request submitted",
    description: "Your event details have been sent for review.",
  },
  {
    label: "Provider reviewing",
    description: "The provider is considering your event requirements.",
  },
  {
    label: "Payment required",
    description: "An accepted request is waiting for the required down payment.",
  },
  {
    label: "Confirmed",
    description: "The required payment has been processed successfully.",
  },
  {
    label: "In progress",
    description: "The confirmed event is moving toward delivery.",
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

      <main className="overflow-hidden bg-background pt-[72px] text-foreground">
        {/* How it works hero */}
        <section className="relative isolate overflow-hidden bg-secondary px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
          <div
            aria-hidden="true"
            className="absolute -right-32 -top-40 size-96 rounded-full bg-primary/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-48 -left-32 size-96 rounded-full bg-primary/10 blur-3xl"
          />

          <div className="relative mx-auto max-w-[1180px] text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
              How Feasta Works
            </p>
            <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-bold leading-tight tracking-[-0.035em] sm:text-5xl lg:text-6xl">
              From discovery to celebration, keep your event journey organized.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              FEASTA guides customers through finding providers, planning event
              details, submitting requests, and following booking progress as
              each step is completed.
            </p>
          </div>
        </section>

        {/* Journey overview */}
        <section className="px-5 py-16 sm:px-8 sm:py-20 lg:py-24" aria-labelledby="journey-overview-title">
          <div className="mx-auto max-w-[1180px]">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Journey overview
              </p>
              <h2 id="journey-overview-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Eight clear stages from search to event day.
              </h2>
              <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
                Each stage reflects an action taken by the customer or provider.
                A request is not confirmed until the required steps are complete.
              </p>
            </div>

            <ol className="mt-10 grid overflow-hidden rounded-card border border-border bg-border shadow-card sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
              {journeyStages.map((stage) => {
                const Icon = stage.icon;

                return (
                  <li key={stage.number} className="min-w-0 bg-card p-6">
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary-strong">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <span className="text-sm font-bold tracking-[0.16em] text-primary-strong">
                        {stage.number}
                      </span>
                    </div>
                    <h3 className="mt-6 text-xl font-bold">{stage.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {stage.description}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Discover */}
        <section className="bg-secondary px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto grid max-w-[1180px] items-start gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <div className="max-w-xl">
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
                <Search aria-hidden="true" className="size-5" />
              </span>
              <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Step one
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Start by discovering your options.
              </h2>
              <p className="mt-5 leading-7 text-muted-foreground">
                Browse the marketplace by service, learn what providers offer,
                and compare the options that may fit your event.
              </p>
            </div>

            <ul className="border-y border-border">
              {discoveryPoints.map((point, index) => (
                <li
                  key={point}
                  className="flex items-center gap-5 border-b border-border py-5 last:border-b-0 sm:gap-6 sm:py-6"
                >
                  <span className="text-sm font-bold tracking-[0.14em] text-primary-strong">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-lg font-bold">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Plan and customize */}
        <section className="px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto max-w-[1180px]">
            <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-20">
              <div className="max-w-xl">
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
                  <SlidersHorizontal aria-hidden="true" className="size-5" />
                </span>
                <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                  Plan and customize
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                  Shape the request around your event.
                </h2>
              </div>
              <p className="max-w-xl leading-7 text-muted-foreground lg:justify-self-end">
                Where supported by the selected service or package, customers
                can provide the details a provider needs to understand the
                event and review the request.
              </p>
            </div>

            <ul className="mt-10 grid gap-x-10 gap-y-3 border-y border-border py-7 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3">
              {eventDetails.map((detail) => (
                <li key={detail} className="flex items-start gap-3 py-2">
                  <Check
                    aria-hidden="true"
                    className="mt-1 size-5 shrink-0 text-primary-strong"
                  />
                  <span className="font-bold leading-7">{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Submit request */}
        <section className="px-5 pb-20 sm:px-8 lg:pb-28">
          <div className="relative isolate mx-auto max-w-[1180px] overflow-hidden rounded-dialog bg-foreground px-6 py-12 text-white shadow-modal sm:px-10 sm:py-14 lg:px-14">
            <div
              aria-hidden="true"
              className="absolute -right-20 -top-24 size-72 rounded-full bg-primary/20 blur-3xl"
            />
            <div className="relative z-10 grid gap-8 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-8">
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ClipboardCheck aria-hidden="true" className="size-5" />
              </span>
              <div className="max-w-3xl">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
                  Submit your request
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Your submission starts a provider review.
                </h2>
                <p className="mt-4 leading-7 text-white/70">
                  Sending your event details creates a booking request for the
                  provider. It is not an instant confirmed booking: the provider
                  reviews the requirements and may accept or reject the request.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Provider review */}
        <section className="bg-secondary px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Provider review
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                The provider responds to your request.
              </h2>
              <p className="mt-5 leading-7 text-muted-foreground">
                The next step depends on whether the provider can take part in
                the event based on the submitted requirements.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:gap-8">
              <article className="rounded-card border border-border bg-card p-7 shadow-card sm:p-8">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary-strong">
                  <CheckCircle2 aria-hidden="true" className="size-6" />
                </span>
                <p className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-primary-strong">
                  Accepted
                </p>
                <h3 className="mt-2 text-2xl font-bold">Continue to payment</h3>
                <p className="mt-3 leading-7 text-muted-foreground">
                  When the provider accepts, the customer can proceed to the
                  required down-payment step shown for the booking.
                </p>
              </article>

              <article className="rounded-card border border-border bg-card p-7 shadow-card sm:p-8">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary-strong">
                  <ArrowRight aria-hidden="true" className="size-6" />
                </span>

                <p className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-primary-strong">
                  Booking recovery
                </p>

                <h3 className="mt-2 text-2xl font-bold">
                  Keep your event moving
                </h3>

                <p className="mt-3 leading-7 text-muted-foreground">
                  If the selected provider cannot accept your request, FEASTA can open
                  booking recovery so other qualified catering providers may offer their
                  services. You can review available recovery offers and choose a suitable
                  provider without creating a new booking request.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Payment and confirmation */}
        <section className="px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto max-w-[1180px]">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Payment and confirmation
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Complete the required payment step to confirm.
              </h2>
              <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
                After an acceptance, the booking waits for the required down
                payment. Confirmation follows when that payment is successfully
                processed.
              </p>
            </div>

            <ol className="mt-10 grid gap-4 md:grid-cols-3 lg:mt-12">
              <li className="rounded-card border border-border bg-card p-6 shadow-card">
                <span className="text-sm font-bold tracking-[0.14em] text-primary-strong">01</span>
                <h3 className="mt-5 text-xl font-bold">Provider accepts</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The accepted request becomes eligible for its required payment step.
                </p>
              </li>
              <li className="rounded-card border border-border bg-card p-6 shadow-card">
                <span className="text-sm font-bold tracking-[0.14em] text-primary-strong">02</span>
                <h3 className="mt-5 text-xl font-bold">Customer pays</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The customer attempts the requested down payment for the booking.
                </p>
              </li>
              <li className="rounded-card border border-border bg-card p-6 shadow-card">
                <span className="text-sm font-bold tracking-[0.14em] text-primary-strong">03</span>
                <h3 className="mt-5 text-xl font-bold">Booking confirms</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  A successfully processed payment moves the booking to confirmed.
                </p>
              </li>
            </ol>
          </div>
        </section>

        {/* Event day and completion */}
        <section className="bg-foreground px-5 py-20 text-white sm:px-8 lg:py-24">
          <div className="mx-auto grid max-w-[1180px] gap-10 md:grid-cols-[auto_1fr] md:items-start md:gap-8">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <PartyPopper aria-hidden="true" className="size-6" />
            </span>
            <div className="max-w-4xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
                Event day and completion
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Follow the booking through the celebration.
              </h2>
              <p className="mt-5 leading-7 text-white/70">
                Once confirmed, customers can follow booking progress as the
                event approaches, moves into progress, and reaches completion.
                After completion, customers may leave a review where that
                feature is supported.
              </p>
            </div>
          </div>
        </section>

        {/* Journey status */}
        <section className="bg-secondary px-5 py-20 sm:px-8 lg:py-28" aria-labelledby="journey-status-title">
          <div className="mx-auto max-w-[1180px]">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                What customers can expect
              </p>
              <h2 id="journey-status-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Booking progress changes as each action is completed.
              </h2>
              <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
                Human-readable progress labels help show what has happened and
                what action may be needed next.
              </p>
            </div>

            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3">
              {publicStatuses.map((status, index) => (
                <li key={status.label} className="border-l-2 border-primary py-2 pl-5">
                  <span className="text-xs font-bold tracking-[0.14em] text-primary-strong">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-lg font-bold">{status.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {status.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <LandingFooter />
    </>
  );
}
