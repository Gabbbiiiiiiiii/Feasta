import type { ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CakeSlice,
  CalendarCheck,
  CalendarDays,
  Camera,
  Check,
  Gem,
  Heart,
  MapPin,
  Music2,
  Palette,
  PartyPopper,
  Search,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  Users,
  CircleCheck,
  Plus,
  ReceiptText,
  BadgeCheck,
  Clock3,
  Compass,
  CreditCard,
  Layers3,
  Send,
} from "lucide-react";

import { ProviderCard } from "@/components/customer/providers/provider-card";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { getPublicProviderPage } from "@/lib/customer/providers/provider-discovery-service";

/* ==========================================================================
   FEASTA HOME / EVENT DISCOVERY

   Completed:
   - Phase 1A: Event-first hero
   - Phase 1A: Start Your Event
   - Phase 1B: Celebration discovery
   - Phase 1B: Event services
   - Phase 1C: Recommended local providers

   Upcoming:
   - Build Your Celebration
   - How FEASTA Works
   - Homepage trust / closing experience
   ========================================================================== */

const eventTypes = [
  {
    label: "Birthday",
    description: "Plan a celebration for family, friends, and every milestone.",
    icon: CakeSlice,
  },
  {
    label: "Wedding",
    description: "Bring together the services needed for your special day.",
    icon: Gem,
  },
  {
    label: "Debut",
    description: "Build a memorable celebration around this important milestone.",
    icon: Sparkles,
  },
  {
    label: "Corporate",
    description: "Organize professional events with suitable local services.",
    icon: BriefcaseBusiness,
  },
  {
    label: "Anniversary",
    description: "Create a celebration centered on the moments worth remembering.",
    icon: Heart,
  },
  {
    label: "Other",
    description: "Start planning an event that does not fit a standard category.",
    icon: PartyPopper,
  },
] as const;

const services = [
  {
    title: "Catering",
    description:
      "Discover food packages and catering providers suited to your event and guest count.",
    icon: UtensilsCrossed,
  },
  {
    title: "Photography",
    description:
      "Find event professionals who can help preserve the moments that matter.",
    icon: Camera,
  },
  {
    title: "Event Styling",
    description:
      "Explore services that help shape the visual atmosphere of your celebration.",
    icon: Palette,
  },
  {
    title: "Entertainment",
    description:
      "Discover entertainment services that can add energy and character to your event.",
    icon: Music2,
  },
] as const;

const journeySteps = [
  {
    number: "01",
    title: "Discover",
    description:
      "Explore local providers, event services, and packages for your celebration.",
    icon: Compass,
  },
  {
    number: "02",
    title: "Build Your Event",
    description:
      "Choose your event details and bring the services you need around one plan.",
    icon: Layers3,
  },
  {
    number: "03",
    title: "Send Your Request",
    description:
      "Review your event details and submit the booking request to your selected provider.",
    icon: Send,
  },
  {
    number: "04",
    title: "Provider Review",
    description:
      "The provider reviews your request and responds based on the event details and availability.",
    icon: Clock3,
  },
  {
    number: "05",
    title: "Make the Down Payment",
    description:
      "After an accepted request, complete the required down payment to continue securing the booking.",
    icon: CreditCard,
  },
  {
    number: "06",
    title: "Booking Confirmed",
    description:
      "Once payment is successfully completed, your event booking moves into its confirmed state.",
    icon: BadgeCheck,
  },
  {
    number: "07",
    title: "Celebrate",
    description:
      "Follow your booking journey, prepare for the event, and complete the celebration.",
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

type JourneyCardProps = {
  number: string;
  title: string;
  description: string;
  icon: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
    strokeWidth?: number;
  }>;
  emphasized?: boolean;
};

function JourneyCard({
  number,
  title,
  description,
  icon: Icon,
  emphasized = false,
}: JourneyCardProps) {
  return (
    <div
      className={[
        "group rounded-[22px] border p-5 sm:p-6",
        "transition-[transform,border-color,box-shadow,background-color]",
        "duration-normal",
        "hover:-translate-y-0.5",
        "focus-within:border-primary/30",
        "motion-reduce:transform-none",
        emphasized
          ? "border-primary/20 bg-white shadow-[0_10px_30px_rgb(43_33_29/0.065)]"
          : "border-feasta-border-soft bg-white/82 hover:border-primary/20 hover:bg-white hover:shadow-[0_10px_28px_rgb(43_33_29/0.05)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-4">
        <div
          className={[
            "grid size-11 shrink-0 place-items-center rounded-xl",
            "transition-[background-color,color] duration-normal",
            emphasized
              ? "bg-primary text-white"
              : "bg-secondary text-primary-strong group-hover:bg-primary group-hover:text-white",
          ].join(" ")}
        >
          <Icon
            aria-hidden="true"
            className="size-5"
            strokeWidth={2}
          />
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary-strong">
            Step {number}
          </p>

          <h3 className="mt-1.5 text-lg font-extrabold tracking-[-0.025em] text-foreground sm:text-xl">
            {title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const featuredProviders = await getFeaturedProviders();

  const featuredProviderGridClassName =
    featuredProviders.length === 1
      ? "mt-9 grid max-w-[360px]"
      : featuredProviders.length === 2
        ? "mt-9 grid max-w-[760px] gap-4 sm:grid-cols-2"
        : featuredProviders.length === 3
          ? "mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          : "mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4";

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
            className="pointer-events-none absolute -right-40 top-0 size-[34rem] rounded-full bg-[#ffbea3]/20 blur-3xl"
          />

          <div className="feasta-container-wide relative py-10 sm:py-14 lg:py-16 xl:py-20">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.94fr)_minmax(560px,1.06fr)] lg:gap-14 xl:gap-20">
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

                <h1 className="mt-6 max-w-[650px] text-[clamp(3rem,5.4vw,5.75rem)] font-extrabold leading-[0.92] tracking-[-0.058em] text-foreground">
                  Your event,
                  <span className="block text-primary">built in one place.</span>
                </h1>

                <p className="mt-7 max-w-[590px] text-base leading-7 text-feasta-text-secondary sm:text-lg sm:leading-8">
                  Discover trusted local event services, compare your options,
                  and bring everything together around one celebration.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="#start-your-event"
                    className={[
                      "group inline-flex min-h-12 items-center justify-center",
                      "gap-2 rounded-full bg-primary px-6",
                      "text-sm font-bold text-white",
                      "shadow-[0_10px_28px_rgb(255_99_51/0.20)]",
                      "transition-[transform,background-color,box-shadow]",
                      "duration-normal",
                      "hover:-translate-y-0.5 hover:bg-primary-hover",
                      "hover:shadow-[0_14px_32px_rgb(255_99_51/0.25)]",
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
                    href="/services"
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
                    Explore Event Services
                  </Link>
                </div>

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
                  VISUAL EVENT COMPOSITION
                 ============================================================ */}

              <div className="relative mx-auto w-full max-w-[700px] lg:mx-0">
                <div className="relative min-h-[450px] sm:min-h-[540px]">
                  {/* Main celebration image */}
                  <div className="absolute inset-x-0 top-0 ml-auto h-[390px] w-[86%] overflow-hidden rounded-[32px] bg-muted shadow-[0_24px_70px_rgb(43_33_29/0.13)] sm:h-[470px] sm:w-[82%]">
                    <Image
                      src="https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1500&q=88"
                      alt="Elegant event reception prepared for a celebration"
                      fill
                      priority
                      sizes="(min-width: 1024px) 620px, 86vw"
                      className="object-cover"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/32 via-black/0 to-transparent" />

                    <div className="absolute bottom-5 left-5 right-5 sm:bottom-6 sm:left-6 sm:right-auto">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/90 px-3.5 py-2 text-xs font-bold text-foreground shadow-floating backdrop-blur-md">
                        <PartyPopper
                          aria-hidden="true"
                          className="size-4 text-primary"
                        />

                        One celebration. One organized plan.
                      </div>
                    </div>
                  </div>

                  {/* Secondary photo */}
                  <div className="absolute bottom-0 left-0 h-[190px] w-[44%] overflow-hidden rounded-[26px] border-[6px] border-feasta-canvas bg-muted shadow-floating sm:h-[230px]">
                    <Image
                      src="https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=85"
                      alt="Celebration table prepared for guests"
                      fill
                      sizes="(min-width: 1024px) 280px, 42vw"
                      className="object-cover"
                    />
                  </div>

                  {/* Floating planning card */}
                  <div className="absolute bottom-6 right-0 hidden w-[260px] rounded-[22px] border border-feasta-border-soft bg-white/95 p-4 shadow-floating backdrop-blur-xl sm:block">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary-strong">
                      Your event plan
                    </p>

                    <div className="mt-3 space-y-2.5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary-strong">
                          <PartyPopper
                            aria-hidden="true"
                            className="size-4"
                          />
                        </span>

                        <div>
                          <p className="text-xs font-bold text-foreground">
                            Celebration
                          </p>

                          <p className="text-[11px] text-feasta-text-tertiary">
                            Start with your occasion
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary-strong">
                          <Users
                            aria-hidden="true"
                            className="size-4"
                          />
                        </span>

                        <div>
                          <p className="text-xs font-bold text-foreground">
                            Guests
                          </p>

                          <p className="text-[11px] text-feasta-text-tertiary">
                            Plan for your group
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary-strong">
                          <MapPin
                            aria-hidden="true"
                            className="size-4"
                          />
                        </span>

                        <div>
                          <p className="text-xs font-bold text-foreground">
                            Ormoc City
                          </p>

                          <p className="text-[11px] text-feasta-text-tertiary">
                            Discover local services
                          </p>
                        </div>
                      </div>
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

                  {/* Planning entry fields */}
                  <form
                    action="/customer/providers"
                    method="get"
                    className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.15fr_1fr_0.78fr_1fr_auto]"
                  >
                    {/* Event type */}
                    <label className="group">
                      <span className="mb-2 block text-xs font-bold text-feasta-text-secondary">
                        Event type
                      </span>

                      <div className="relative">
                        <PartyPopper
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-feasta-text-tertiary"
                        />

                        <select
                          name="eventType"
                          defaultValue=""
                          className={[
                            "h-12 w-full appearance-none rounded-xl",
                            "border border-feasta-border-soft bg-feasta-canvas",
                            "pl-11 pr-9",
                            "text-sm font-semibold text-foreground",
                            "outline-none",
                            "transition-[border-color,box-shadow,background-color]",
                            "focus:border-primary/60 focus:bg-white",
                            "focus:ring-4 focus:ring-primary/10",
                          ].join(" ")}
                        >
                          <option value="" disabled>
                            Select occasion
                          </option>

                          <option value="birthday">Birthday</option>
                          <option value="wedding">Wedding</option>
                          <option value="debut">Debut</option>
                          <option value="corporate">Corporate</option>
                          <option value="anniversary">Anniversary</option>
                          <option value="other">Other</option>
                        </select>

                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-feasta-text-tertiary"
                        >
                          ▼
                        </span>
                      </div>
                    </label>

                    {/* Date */}
                    <label>
                      <span className="mb-2 block text-xs font-bold text-feasta-text-secondary">
                        Date
                      </span>

                      <div className="relative">
                        <CalendarDays
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-feasta-text-tertiary"
                        />

                        <input
                          type="date"
                          name="eventDate"
                          className={[
                            "h-12 w-full rounded-xl",
                            "border border-feasta-border-soft bg-feasta-canvas",
                            "pl-11 pr-3",
                            "text-sm font-semibold text-foreground",
                            "outline-none",
                            "transition-[border-color,box-shadow,background-color]",
                            "focus:border-primary/60 focus:bg-white",
                            "focus:ring-4 focus:ring-primary/10",
                          ].join(" ")}
                        />
                      </div>
                    </label>

                    {/* Guests */}
                    <label>
                      <span className="mb-2 block text-xs font-bold text-feasta-text-secondary">
                        Guests
                      </span>

                      <div className="relative">
                        <Users
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-feasta-text-tertiary"
                        />

                        <input
                          type="number"
                          name="guests"
                          min="1"
                          inputMode="numeric"
                          placeholder="50"
                          className={[
                            "h-12 w-full rounded-xl",
                            "border border-feasta-border-soft bg-feasta-canvas",
                            "pl-11 pr-3",
                            "text-sm font-semibold text-foreground",
                            "outline-none",
                            "transition-[border-color,box-shadow,background-color]",
                            "placeholder:text-feasta-text-tertiary",
                            "focus:border-primary/60 focus:bg-white",
                            "focus:ring-4 focus:ring-primary/10",
                          ].join(" ")}
                        />
                      </div>
                    </label>

                    {/* Location */}
                    <label>
                      <span className="mb-2 block text-xs font-bold text-feasta-text-secondary">
                        Location
                      </span>

                      <div className="relative">
                        <MapPin
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-feasta-text-tertiary"
                        />

                        <input
                          type="text"
                          name="location"
                          defaultValue="Ormoc City"
                          readOnly
                          className={[
                            "h-12 w-full rounded-xl",
                            "border border-feasta-border-soft bg-feasta-canvas",
                            "pl-11 pr-3",
                            "text-sm font-semibold text-foreground",
                            "outline-none",
                            "focus:border-primary/60 focus:ring-4",
                            "focus:ring-primary/10",
                          ].join(" ")}
                        />
                      </div>
                    </label>

                    {/* CTA */}
                    <div className="sm:col-span-2 xl:col-span-1">
                      <span
                        aria-hidden="true"
                        className="mb-2 hidden text-xs font-bold xl:block"
                      >
                        &nbsp;
                      </span>

                      <button
                        type="submit"
                        className={[
                          "group flex h-12 w-full items-center justify-center",
                          "gap-2 rounded-xl bg-primary px-5",
                          "text-sm font-bold text-white",
                          "shadow-[0_8px_20px_rgb(255_99_51/0.18)]",
                          "transition-[transform,background-color,box-shadow]",
                          "duration-normal",
                          "hover:-translate-y-0.5 hover:bg-primary-hover",
                          "hover:shadow-[0_12px_26px_rgb(255_99_51/0.24)]",
                          "focus-visible:outline-none focus-visible:ring-2",
                          "focus-visible:ring-primary focus-visible:ring-offset-2",
                          "motion-reduce:transform-none",
                        ].join(" ")}
                      >
                        Explore

                        <ArrowRight
                          aria-hidden="true"
                          className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                        />
                      </button>
                    </div>
                  </form>
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
          className="relative overflow-hidden bg-white py-16 sm:py-20 lg:py-24"
        >
          <div className="feasta-container-wide">
            <div className="max-w-3xl">
              <p className="feasta-eyebrow">
                Plan around your celebration
              </p>

              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-4xl lg:text-[52px] lg:leading-[1.02]">
                Start with what you&apos;re celebrating.
              </h2>

              <p className="mt-5 max-w-2xl text-base leading-7 text-feasta-text-secondary sm:text-lg sm:leading-8">
                Every event begins differently. Choose the kind of celebration
                you&apos;re planning and begin discovering services that can help
                bring it together.
              </p>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3">
              {eventTypes.map((eventType) => {
                const Icon = eventType.icon;

                return (
                  <Link
                    key={eventType.label}
                    href="/customer/providers"
                    className={[
                      "group relative overflow-hidden",
                      "rounded-[22px] border border-feasta-border-soft",
                      "bg-feasta-canvas p-5 sm:p-6",
                      "transition-[transform,border-color,background-color,box-shadow]",
                      "duration-normal",
                      "hover:-translate-y-1",
                      "hover:border-primary/25",
                      "hover:bg-white",
                      "hover:shadow-[0_14px_34px_rgb(43_33_29/0.07)]",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary focus-visible:ring-offset-2",
                      "motion-reduce:transform-none",
                    ].join(" ")}
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/[0.045] transition-transform duration-slow group-hover:scale-125 motion-reduce:transform-none"
                    />

                    <div className="relative">
                      <div
                        className={[
                          "grid size-11 place-items-center rounded-xl",
                          "border border-primary/10 bg-secondary",
                          "text-primary-strong",
                          "transition-[background-color,color,transform]",
                          "duration-normal",
                          "group-hover:bg-primary group-hover:text-white",
                          "group-hover:scale-105",
                          "motion-reduce:transform-none",
                        ].join(" ")}
                      >
                        <Icon
                          aria-hidden="true"
                          className="size-5"
                          strokeWidth={2}
                        />
                      </div>

                      <div className="mt-6 flex items-center justify-between gap-4">
                        <h3 className="text-xl font-extrabold tracking-[-0.025em] text-foreground">
                          {eventType.label}
                        </h3>

                        <ArrowRight
                          aria-hidden="true"
                          className="size-4 shrink-0 text-feasta-text-tertiary transition-[color,transform] duration-normal group-hover:translate-x-1 group-hover:text-primary motion-reduce:transform-none"
                        />
                      </div>

                      <p className="mt-2.5 max-w-sm text-sm leading-6 text-feasta-text-secondary">
                        {eventType.description}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ==================================================================
            PHASE 1B — EVENT SERVICES
          ================================================================== */}

        <section
          id="services"
          className="relative overflow-hidden bg-feasta-canvas-warm py-16 sm:py-20 lg:py-24"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-52 top-0 size-[32rem] rounded-full bg-primary/[0.055] blur-3xl"
          />

          <div className="feasta-container-wide relative">
            <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-end lg:gap-16">
              <div className="max-w-xl">
                <p className="feasta-eyebrow">
                  Build your event
                </p>

                <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-4xl lg:text-[52px] lg:leading-[1.02]">
                  Bring the right services together.
                </h2>

                <p className="mt-5 text-base leading-7 text-feasta-text-secondary sm:text-lg sm:leading-8">
                  FEASTA is designed around the event itself. Discover the local
                  services you need and gradually shape them into one organized
                  celebration.
                </p>

                <Link
                  href="/services"
                  className={[
                    "group mt-7 inline-flex min-h-12 items-center justify-center",
                    "gap-2 rounded-full bg-primary px-6",
                    "text-sm font-bold text-white",
                    "shadow-[0_9px_24px_rgb(255_99_51/0.18)]",
                    "transition-[transform,background-color,box-shadow]",
                    "duration-normal",
                    "hover:-translate-y-0.5 hover:bg-primary-hover",
                    "hover:shadow-[0_12px_28px_rgb(255_99_51/0.24)]",
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

              <div className="grid gap-3 sm:grid-cols-2">
                {services.map((service) => {
                  const Icon = service.icon;

                  return (
                    <Link
                      key={service.title}
                      href="/customer/providers"
                      className={[
                        "group flex min-h-[230px] flex-col",
                        "rounded-[22px] border border-feasta-border-soft",
                        "bg-white p-6",
                        "shadow-[0_2px_8px_rgb(43_33_29/0.025)]",
                        "transition-[transform,border-color,box-shadow]",
                        "duration-normal",
                        "hover:-translate-y-1",
                        "hover:border-primary/25",
                        "hover:shadow-[0_14px_34px_rgb(43_33_29/0.075)]",
                        "focus-visible:outline-none focus-visible:ring-2",
                        "focus-visible:ring-primary focus-visible:ring-offset-2",
                        "motion-reduce:transform-none",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-5">
                        <div
                          className={[
                            "grid size-12 place-items-center rounded-[14px]",
                            "bg-secondary text-primary-strong",
                            "transition-[background-color,color,transform]",
                            "duration-normal",
                            "group-hover:scale-105 group-hover:bg-primary",
                            "group-hover:text-white",
                            "motion-reduce:transform-none",
                          ].join(" ")}
                        >
                          <Icon
                            aria-hidden="true"
                            className="size-5"
                            strokeWidth={2}
                          />
                        </div>

                        <ArrowRight
                          aria-hidden="true"
                          className="size-4 text-feasta-text-tertiary transition-[color,transform] duration-normal group-hover:translate-x-1 group-hover:text-primary motion-reduce:transform-none"
                        />
                      </div>

                      <div className="mt-auto pt-8">
                        <h3 className="text-xl font-extrabold tracking-[-0.025em] text-foreground">
                          {service.title}
                        </h3>

                        <p className="mt-2.5 text-sm leading-6 text-feasta-text-secondary">
                          {service.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================================
            PHASE 1E — HOW FEASTA WORKS
          ================================================================== */}

        <section
          id="how-it-works"
          className="relative overflow-hidden bg-feasta-canvas-warm py-16 sm:py-20 lg:py-24"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-48 top-0 size-[34rem] rounded-full bg-primary/[0.045] blur-3xl"
          />

          <div className="feasta-container-wide relative">
            {/* ================================================================
                SECTION INTRO
              ================================================================ */}

            <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:gap-16">
              <div className="max-w-xl">
                <p className="feasta-eyebrow">
                  How Feasta Works
                </p>

                <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.045em] text-foreground sm:text-4xl lg:text-[52px] lg:leading-[1.02]">
                  From an idea to
                  <span className="block text-primary">
                    a confirmed celebration.
                  </span>
                </h2>
              </div>

              <div className="max-w-2xl lg:justify-self-end">
                <p className="text-base leading-7 text-feasta-text-secondary sm:text-lg sm:leading-8">
                  FEASTA keeps the booking journey connected. Start by discovering
                  services, build your event, send your request, and follow each
                  important step toward confirmation.
                </p>

                <Link
                  href="/how-it-works"
                  className={[
                    "group mt-5 inline-flex items-center gap-2",
                    "text-sm font-bold text-primary-strong",
                    "transition-colors duration-fast",
                    "hover:text-primary",
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
            </div>

            {/* ================================================================
                JOURNEY
              ================================================================ */}

            <div className="relative mt-12 lg:mt-16">
              {/* Desktop journey line */}
              <div
                aria-hidden="true"
                className="absolute bottom-8 left-[27px] top-8 hidden w-px bg-gradient-to-b from-primary via-primary/35 to-feasta-border-strong md:block lg:left-1/2 lg:-translate-x-1/2"
              />

              <div className="space-y-4 lg:space-y-5">
                {journeySteps.map((step, index) => {
                  const Icon = step.icon;
                  const isEven = index % 2 === 0;
                  const isLast = index === journeySteps.length - 1;

                  return (
                    <article
                      key={step.number}
                      className={[
                        "relative grid gap-4",
                        "md:grid-cols-[56px_minmax(0,1fr)] md:items-start",
                        "lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)]",
                        "lg:items-center",
                      ].join(" ")}
                    >
                      {/* ========================================================
                          DESKTOP LEFT COLUMN
                        ======================================================== */}

                      <div
                        className={[
                          "hidden lg:block",
                          isEven ? "" : "lg:col-start-1",
                        ].join(" ")}
                      >
                        {isEven ? (
                          <JourneyCard
                            number={step.number}
                            title={step.title}
                            description={step.description}
                            icon={Icon}
                            emphasized={index === 0}
                          />
                        ) : (
                          <div />
                        )}
                      </div>

                      {/* ========================================================
                          TIMELINE MARKER
                        ======================================================== */}

                      <div className="relative z-10 hidden md:flex md:items-start md:justify-center lg:col-start-2 lg:row-start-1 lg:items-center">
                        <div
                          className={[
                            "grid size-14 place-items-center rounded-full",
                            "border-[5px] border-feasta-canvas-warm",
                            "shadow-[0_4px_14px_rgb(43_33_29/0.08)]",
                            isLast
                              ? "bg-primary text-white"
                              : "bg-white text-primary-strong",
                          ].join(" ")}
                        >
                          <Icon
                            aria-hidden="true"
                            className="size-5"
                            strokeWidth={2}
                          />
                        </div>
                      </div>

                      {/* ========================================================
                          DESKTOP RIGHT COLUMN
                        ======================================================== */}

                      <div className="hidden lg:col-start-3 lg:row-start-1 lg:block">
                        {!isEven ? (
                          <JourneyCard
                            number={step.number}
                            title={step.title}
                            description={step.description}
                            icon={Icon}
                            emphasized={isLast}
                          />
                        ) : (
                          <div />
                        )}
                      </div>

                      {/* ========================================================
                          MOBILE / TABLET CARD
                        ======================================================== */}

                      <div className="md:col-start-2 lg:hidden">
                        <JourneyCard
                          number={step.number}
                          title={step.title}
                          description={step.description}
                          icon={Icon}
                          emphasized={index === 0 || isLast}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* ================================================================
                JOURNEY COMPLETION CTA
              ================================================================ */}

            <div className="mt-12 overflow-hidden rounded-[26px] border border-primary/15 bg-white shadow-[0_12px_36px_rgb(43_33_29/0.055)] lg:mt-16">
              <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="flex items-start gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-success-subtle text-success">
                    <BadgeCheck
                      aria-hidden="true"
                      className="size-5"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                      One connected journey
                    </p>

                    <h3 className="mt-2 text-xl font-extrabold tracking-[-0.025em] text-foreground sm:text-2xl">
                      Know what comes next.
                    </h3>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-feasta-text-secondary sm:text-base sm:leading-7">
                      Instead of leaving customers to coordinate every stage
                      separately, FEASTA keeps the important booking steps organized
                      around the same event.
                    </p>
                  </div>
                </div>

                <Link
                  href="/customer/providers"
                  className={[
                    "group inline-flex min-h-12 w-fit items-center justify-center",
                    "gap-2 rounded-full bg-primary px-6",
                    "text-sm font-bold text-white",
                    "shadow-[0_8px_20px_rgb(255_99_51/0.18)]",
                    "transition-[transform,background-color,box-shadow]",
                    "duration-normal",
                    "hover:-translate-y-0.5 hover:bg-primary-hover",
                    "hover:shadow-[0_12px_26px_rgb(255_99_51/0.24)]",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-offset-2",
                    "motion-reduce:transform-none",
                  ].join(" ")}
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

        {/* ==================================================================
            PHASE 1C — RECOMMENDED LOCAL PROVIDERS
          ================================================================== */}

        <section
          id="providers"
          className="relative overflow-hidden bg-white py-16 sm:py-20 lg:py-24"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-48 top-20 size-[30rem] rounded-full bg-primary/[0.035] blur-3xl"
          />

          <div className="feasta-container-wide relative">
            {/* ================================================================
                SECTION INTRO
              ================================================================ */}

            <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="feasta-eyebrow">
                  Recommended local providers
                </p>

                <h2 className="mt-3 max-w-[760px] text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-4xl lg:text-[52px] lg:leading-[1.02]">
                  People who can help bring your event together.
                </h2>

                <p className="mt-5 max-w-2xl text-base leading-7 text-feasta-text-secondary sm:text-lg sm:leading-8">
                  Explore providers available through FEASTA and discover the
                  services that fit your celebration.
                </p>
              </div>

              <Link
                href="/customer/providers"
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
                Explore all providers

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
              <>
                <div className={featuredProviderGridClassName}>
                  {featuredProviders.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                    />
                  ))}
                </div>

                {/* ============================================================
                    MARKETPLACE CONTINUATION
                  ============================================================ */}

                <div className="mt-10 flex flex-col gap-5 rounded-[24px] border border-feasta-border-soft bg-feasta-canvas p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 lg:px-7">
                  <div className="flex items-start gap-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
                      <Search
                        aria-hidden="true"
                        className="size-5"
                      />
                    </div>

                    <div>
                      <h3 className="text-base font-extrabold tracking-[-0.02em] text-foreground sm:text-lg">
                        Looking for something specific?
                      </h3>

                      <p className="mt-1 max-w-2xl text-sm leading-6 text-feasta-text-secondary">
                        Browse the marketplace to compare more providers and find
                        services for your event.
                      </p>
                    </div>
                  </div>

                  <Link
                    href="/customer/providers"
                    className={[
                      "group inline-flex min-h-11 shrink-0 items-center",
                      "justify-center gap-2 rounded-full bg-primary px-5",
                      "text-sm font-bold text-white",
                      "shadow-[0_8px_20px_rgb(255_99_51/0.16)]",
                      "transition-[transform,background-color,box-shadow]",
                      "duration-normal",
                      "hover:-translate-y-0.5 hover:bg-primary-hover",
                      "hover:shadow-[0_11px_24px_rgb(255_99_51/0.22)]",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary focus-visible:ring-offset-2",
                      "motion-reduce:transform-none",
                    ].join(" ")}
                  >
                    Browse marketplace

                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                    />
                  </Link>
                </div>
              </>
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
                    href="/customer/providers"
                    className={[
                      "group inline-flex min-h-12 w-fit items-center",
                      "justify-center gap-2 rounded-full bg-primary px-6",
                      "text-sm font-bold text-white",
                      "shadow-[0_8px_20px_rgb(255_99_51/0.16)]",
                      "transition-[transform,background-color,box-shadow]",
                      "duration-normal",
                      "hover:-translate-y-0.5 hover:bg-primary-hover",
                      "hover:shadow-[0_11px_24px_rgb(255_99_51/0.22)]",
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

        {/* ==================================================================
            PHASE 1D — BUILD YOUR CELEBRATION
          ================================================================== */}

        <section
          id="build-your-celebration"
          className="relative overflow-hidden bg-feasta-surface-strong py-16 text-white sm:py-20 lg:py-24"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 top-0 size-[34rem] rounded-full bg-primary/15 blur-3xl"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-52 bottom-0 size-[30rem] rounded-full bg-primary/[0.08] blur-3xl"
          />

          <div className="feasta-container-wide relative">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16 xl:gap-20">
              {/* ================================================================
                  SECTION MESSAGE
                ================================================================ */}

              <div className="max-w-xl">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
                  Build your celebration
                </p>

                <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.045em] text-white sm:text-4xl lg:text-[54px] lg:leading-[1.02]">
                  One event.
                  <span className="block text-primary">
                    Everything around it.
                  </span>
                </h2>

                <p className="mt-5 text-base leading-7 text-white/68 sm:text-lg sm:leading-8">
                  FEASTA brings your event details, selected providers, and services
                  into one organized planning experience instead of making you manage
                  every part separately.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="flex items-start gap-3">
                    <CircleCheck
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-primary"
                    />

                    <div>
                      <p className="font-bold text-white">
                        Start with your event
                      </p>

                      <p className="mt-1 text-sm leading-6 text-white/58">
                        Define the celebration, date, guest count, and location.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CircleCheck
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-primary"
                    />

                    <div>
                      <p className="font-bold text-white">
                        Add the services you need
                      </p>

                      <p className="mt-1 text-sm leading-6 text-white/58">
                        Discover catering and other supported event services around
                        that same celebration.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CircleCheck
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-primary"
                    />

                    <div>
                      <p className="font-bold text-white">
                        Keep the journey organized
                      </p>

                      <p className="mt-1 text-sm leading-6 text-white/58">
                        Follow booking requests, provider responses, payment, and
                        confirmation through FEASTA.
                      </p>
                    </div>
                  </div>
                </div>

                <Link
                  href="/customer/providers"
                  className={[
                    "group mt-8 inline-flex min-h-12 items-center justify-center",
                    "gap-2 rounded-full bg-primary px-6",
                    "text-sm font-bold text-white",
                    "shadow-[0_10px_28px_rgb(255_99_51/0.22)]",
                    "transition-[transform,background-color,box-shadow]",
                    "duration-normal",
                    "hover:-translate-y-0.5 hover:bg-primary-hover",
                    "hover:shadow-[0_14px_34px_rgb(255_99_51/0.30)]",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-offset-2",
                    "focus-visible:ring-offset-[#2b211d]",
                    "motion-reduce:transform-none",
                  ].join(" ")}
                >
                  Start Building Your Event

                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                  />
                </Link>
              </div>

              {/* ================================================================
                  EVENT PLAN VISUALIZATION
                ================================================================ */}

              <div className="relative mx-auto w-full max-w-[720px]">
                <div className="rounded-[30px] border border-white/10 bg-white/[0.055] p-4 shadow-[0_26px_80px_rgb(0_0_0/0.22)] backdrop-blur-sm sm:p-6">
                  <div className="rounded-[24px] bg-[#fffdfb] p-5 text-foreground shadow-floating sm:p-7">
                    {/* ============================================================
                        EVENT HEADER
                      ============================================================ */}

                    <div className="flex flex-col gap-5 border-b border-feasta-divider pb-6 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary-strong">
                          Your event plan
                        </p>

                        <h3 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground">
                          Birthday Celebration
                        </h3>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-feasta-text-secondary">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays
                              aria-hidden="true"
                              className="size-4 text-primary"
                            />

                            October 17
                          </span>

                          <span className="inline-flex items-center gap-1.5">
                            <Users
                              aria-hidden="true"
                              className="size-4 text-primary"
                            />

                            50 guests
                          </span>

                          <span className="inline-flex items-center gap-1.5">
                            <MapPin
                              aria-hidden="true"
                              className="size-4 text-primary"
                            />

                            Ormoc City
                          </span>
                        </div>
                      </div>

                      <div className="inline-flex w-fit items-center gap-2 rounded-full bg-success-subtle px-3 py-2 text-xs font-bold text-success">
                        <CircleCheck
                          aria-hidden="true"
                          className="size-4"
                        />

                        Event started
                      </div>
                    </div>

                    {/* ============================================================
                        EVENT SERVICES
                      ============================================================ */}

                    <div className="py-6">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-extrabold text-foreground">
                            Event services
                          </p>

                          <p className="mt-1 text-xs text-feasta-text-tertiary">
                            Build the celebration one service at a time.
                          </p>
                        </div>

                        <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary-strong">
                          1 selected
                        </span>
                      </div>

                      <div className="mt-5 space-y-3">
                        {/* Catering selected */}
                        <div className="flex items-center gap-4 rounded-[18px] border border-primary/20 bg-secondary/60 p-4">
                          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-white">
                            <UtensilsCrossed
                              aria-hidden="true"
                              className="size-5"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-extrabold text-foreground">
                                Catering
                              </p>

                              <span className="rounded-full bg-success-subtle px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-success">
                                Selected
                              </span>
                            </div>

                            <p className="mt-1 truncate text-sm text-feasta-text-secondary">
                              Add a catering package for your celebration
                            </p>
                          </div>

                          <CircleCheck
                            aria-hidden="true"
                            className="size-5 shrink-0 text-success"
                          />
                        </div>

                        {/* Photography */}
                        <Link
                          href="/customer/providers"
                          className={[
                            "group flex items-center gap-4",
                            "rounded-[18px] border border-feasta-border-soft",
                            "bg-white p-4",
                            "transition-[border-color,background-color,transform]",
                            "duration-normal",
                            "hover:-translate-y-0.5 hover:border-primary/25",
                            "hover:bg-feasta-surface-soft",
                            "focus-visible:outline-none focus-visible:ring-2",
                            "focus-visible:ring-primary focus-visible:ring-offset-2",
                            "motion-reduce:transform-none",
                          ].join(" ")}
                        >
                          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-feasta-surface-muted text-feasta-text-secondary transition-colors group-hover:bg-secondary group-hover:text-primary-strong">
                            <Camera
                              aria-hidden="true"
                              className="size-5"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground">
                              Photography
                            </p>

                            <p className="mt-1 text-sm text-feasta-text-tertiary">
                              Add photography to your event
                            </p>
                          </div>

                          <Plus
                            aria-hidden="true"
                            className="size-5 shrink-0 text-feasta-text-tertiary transition-colors group-hover:text-primary"
                          />
                        </Link>

                        {/* Event Styling */}
                        <Link
                          href="/customer/providers"
                          className={[
                            "group flex items-center gap-4",
                            "rounded-[18px] border border-feasta-border-soft",
                            "bg-white p-4",
                            "transition-[border-color,background-color,transform]",
                            "duration-normal",
                            "hover:-translate-y-0.5 hover:border-primary/25",
                            "hover:bg-feasta-surface-soft",
                            "focus-visible:outline-none focus-visible:ring-2",
                            "focus-visible:ring-primary focus-visible:ring-offset-2",
                            "motion-reduce:transform-none",
                          ].join(" ")}
                        >
                          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-feasta-surface-muted text-feasta-text-secondary transition-colors group-hover:bg-secondary group-hover:text-primary-strong">
                            <Palette
                              aria-hidden="true"
                              className="size-5"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground">
                              Event Styling
                            </p>

                            <p className="mt-1 text-sm text-feasta-text-tertiary">
                              Add styling services
                            </p>
                          </div>

                          <Plus
                            aria-hidden="true"
                            className="size-5 shrink-0 text-feasta-text-tertiary transition-colors group-hover:text-primary"
                          />
                        </Link>

                        {/* Entertainment */}
                        <Link
                          href="/customer/providers"
                          className={[
                            "group flex items-center gap-4",
                            "rounded-[18px] border border-feasta-border-soft",
                            "bg-white p-4",
                            "transition-[border-color,background-color,transform]",
                            "duration-normal",
                            "hover:-translate-y-0.5 hover:border-primary/25",
                            "hover:bg-feasta-surface-soft",
                            "focus-visible:outline-none focus-visible:ring-2",
                            "focus-visible:ring-primary focus-visible:ring-offset-2",
                            "motion-reduce:transform-none",
                          ].join(" ")}
                        >
                          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-feasta-surface-muted text-feasta-text-secondary transition-colors group-hover:bg-secondary group-hover:text-primary-strong">
                            <Music2
                              aria-hidden="true"
                              className="size-5"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground">
                              Entertainment
                            </p>

                            <p className="mt-1 text-sm text-feasta-text-tertiary">
                              Add entertainment services
                            </p>
                          </div>

                          <Plus
                            aria-hidden="true"
                            className="size-5 shrink-0 text-feasta-text-tertiary transition-colors group-hover:text-primary"
                          />
                        </Link>
                      </div>
                    </div>

                    {/* ============================================================
                        EVENT PLAN SUMMARY
                      ============================================================ */}

                    <div className="border-t border-feasta-divider pt-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary-strong">
                            <ReceiptText
                              aria-hidden="true"
                              className="size-5"
                            />
                          </div>

                          <div>
                            <p className="text-sm font-extrabold text-foreground">
                              Your event grows as you plan
                            </p>

                            <p className="mt-0.5 text-xs text-feasta-text-tertiary">
                              Services stay connected to one celebration.
                            </p>
                          </div>
                        </div>

                        <Link
                          href="/customer/providers"
                          className="group inline-flex items-center gap-2 text-sm font-bold text-primary-strong transition-colors hover:text-primary"
                        >
                          Continue building

                          <ArrowRight
                            aria-hidden="true"
                            className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                          />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating connector label */}
                <div className="absolute -bottom-5 left-1/2 hidden -translate-x-1/2 rounded-full border border-white/10 bg-[#352d29] px-4 py-2 text-xs font-bold text-white/70 shadow-floating lg:inline-flex">
                  One event connects every service
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* ==================================================================
            PHASE 1F — TRUST / HOMEPAGE CLOSING
          ================================================================== */}

        <section
          id="why-feasta"
          className="relative overflow-hidden bg-white py-16 sm:py-20 lg:py-24"
        >
          <div className="feasta-container-wide">
            {/* ================================================================
                INTRO
              ================================================================ */}

            <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-end lg:gap-16">
              <div className="max-w-xl">
                <p className="feasta-eyebrow">
                  Why Feasta
                </p>

                <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.045em] text-foreground sm:text-4xl lg:text-[52px] lg:leading-[1.02]">
                  Planning feels easier when
                  <span className="block text-primary">
                    everything has a place.
                  </span>
                </h2>
              </div>

              <div className="max-w-2xl lg:justify-self-end">
                <p className="text-base leading-7 text-feasta-text-secondary sm:text-lg sm:leading-8">
                  FEASTA is built to make local event planning more organized.
                  Customers can discover providers, understand where their booking
                  stands, and keep important event details connected throughout the
                  planning journey.
                </p>
              </div>
            </div>

            {/* ================================================================
                MAIN TRUST COMPOSITION
              ================================================================ */}

            <div className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-6">
              {/* ==============================================================
                  REAL EVENT PHOTOGRAPHY
                ============================================================== */}

              <div className="group relative min-h-[430px] overflow-hidden rounded-[28px] bg-muted sm:min-h-[520px] lg:min-h-[590px]">
                <Image
                  src="https://images.unsplash.com/photo-1507504031003-b417219a0fde?auto=format&fit=crop&w=1600&q=88"
                  alt="Guests gathered at a thoughtfully prepared celebration"
                  fill
                  sizes="(min-width: 1024px) 56vw, 100vw"
                  className="object-cover transition-transform duration-slow group-hover:scale-[1.015] motion-reduce:transform-none"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-9">
                  <div className="max-w-xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/20 px-3 py-2 backdrop-blur-md">
                      <MapPin
                        aria-hidden="true"
                        className="size-4 text-primary"
                      />

                      <span className="text-xs font-bold text-white">
                        Focused on Ormoc City
                      </span>
                    </div>

                    <h3 className="mt-4 max-w-lg text-2xl font-extrabold tracking-[-0.035em] text-white sm:text-3xl lg:text-[36px] lg:leading-[1.06]">
                      Local event services brought into one planning experience.
                    </h3>

                    <p className="mt-3 max-w-lg text-sm leading-6 text-white/76 sm:text-base sm:leading-7">
                      Discover providers and services relevant to celebrations in
                      the local community without managing every part of the journey
                      separately.
                    </p>
                  </div>
                </div>
              </div>

              {/* ==============================================================
                  TRUST PRINCIPLES
                ============================================================== */}

              <div className="grid gap-4">
                {/* Provider verification */}
                <article className="group rounded-[24px] border border-feasta-border-soft bg-feasta-canvas p-6 transition-[transform,border-color,box-shadow] duration-normal hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_12px_30px_rgb(43_33_29/0.055)] motion-reduce:transform-none sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                      <ShieldCheck
                        aria-hidden="true"
                        className="size-5"
                      />
                    </div>

                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                        Provider verification
                      </p>

                      <h3 className="mt-2 text-xl font-extrabold tracking-[-0.025em] text-foreground">
                        Discover providers through FEASTA.
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                        FEASTA includes a provider verification process before
                        providers participate fully in the platform marketplace.
                      </p>
                    </div>
                  </div>
                </article>

                {/* Booking visibility */}
                <article className="group rounded-[24px] border border-feasta-border-soft bg-feasta-canvas p-6 transition-[transform,border-color,box-shadow] duration-normal hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_12px_30px_rgb(43_33_29/0.055)] motion-reduce:transform-none sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                      <CalendarCheck
                        aria-hidden="true"
                        className="size-5"
                      />
                    </div>

                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                        Clear booking journey
                      </p>

                      <h3 className="mt-2 text-xl font-extrabold tracking-[-0.025em] text-foreground">
                        Know where your booking stands.
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                        Follow important stages such as your booking request,
                        provider response, payment, confirmation, and completion.
                      </p>
                    </div>
                  </div>
                </article>

                {/* Local context */}
                <article className="group rounded-[24px] border border-feasta-border-soft bg-feasta-canvas p-6 transition-[transform,border-color,box-shadow] duration-normal hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_12px_30px_rgb(43_33_29/0.055)] motion-reduce:transform-none sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                      <MapPin
                        aria-hidden="true"
                        className="size-5"
                      />
                    </div>

                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                        Local by design
                      </p>

                      <h3 className="mt-2 text-xl font-extrabold tracking-[-0.025em] text-foreground">
                        Built around celebrations in Ormoc City.
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                        FEASTA focuses its event marketplace on connecting customers
                        with local catering and event service providers.
                      </p>
                    </div>
                  </div>
                </article>
              </div>
            </div>

            {/* ================================================================
                HOME CLOSING
              ================================================================ */}

            <div className="relative mt-12 overflow-hidden rounded-[28px] bg-secondary px-6 py-8 sm:px-8 sm:py-10 lg:mt-16 lg:px-10 lg:py-12">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/[0.08] blur-3xl"
              />

              <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="max-w-2xl">
                  <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-primary-strong">
                    Ready when you are
                  </p>

                  <h3 className="mt-3 text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl lg:text-[38px] lg:leading-[1.05]">
                    Start shaping your next celebration.
                  </h3>

                  <p className="mt-3 max-w-xl text-sm leading-6 text-feasta-text-secondary sm:text-base sm:leading-7">
                    Explore local providers, compare event services, and begin
                    building your event through FEASTA.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/customer/providers"
                    className={[
                      "group inline-flex min-h-12 items-center justify-center",
                      "gap-2 rounded-full bg-primary px-6",
                      "text-sm font-bold text-white",
                      "shadow-[0_8px_20px_rgb(255_99_51/0.18)]",
                      "transition-[transform,background-color,box-shadow]",
                      "duration-normal",
                      "hover:-translate-y-0.5 hover:bg-primary-hover",
                      "hover:shadow-[0_12px_26px_rgb(255_99_51/0.24)]",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary focus-visible:ring-offset-2",
                      "motion-reduce:transform-none",
                    ].join(" ")}
                  >
                    Explore Providers

                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                    />
                  </Link>

                  <Link
                    href="/about"
                    className={[
                      "inline-flex min-h-12 items-center justify-center",
                      "rounded-full border border-primary/20 bg-white px-6",
                      "text-sm font-bold text-primary-strong",
                      "transition-[border-color,background-color]",
                      "duration-fast",
                      "hover:border-primary/35 hover:bg-feasta-canvas",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary focus-visible:ring-offset-2",
                    ].join(" ")}
                  >
                    Learn About Feasta
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}

