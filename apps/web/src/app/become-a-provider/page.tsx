import type {Metadata} from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  ClipboardCheck,
  MailCheck,
  Package,
  Store,
  UserRound,
  Users,
} from "lucide-react";

import {LandingFooter} from "@/components/landing/landing-footer";
import {LandingHeader} from "@/components/landing/landing-header";

export const metadata: Metadata = {
  title: "Become a Provider",
  description:
    "Join FEASTA as an event-service provider and learn how provider onboarding, verification, and approval work.",
};

const providerBenefits = [
  {
    title: "Reach event customers",
    description:
      "Present your services to customers exploring options for their celebrations.",
    icon: Users,
  },
  {
    title: "Showcase your business",
    description:
      "Build your provider presence with your business information, services, and packages.",
    icon: Store,
  },
  {
    title: "Manage booking opportunities",
    description:
      "Review customer event requests and manage your participation through one provider workspace.",
    icon: BriefcaseBusiness,
  },
];

const providerTypes = [
  {
    eyebrow: "Catering",
    title: "Catering Providers",
    description:
      "Businesses offering catering packages and food or service options for supported events.",
    icon: Store,
  },
  {
    eyebrow: "Event Services",
    title: "Event Service Providers",
    description:
      "Providers offering supported add-on and event services that customers can explore for their celebrations.",
    icon: Package,
  },
  {
    eyebrow: "Combined Services",
    title: "Combined Providers",
    description:
      "Businesses that provide both catering and supported additional event services through FEASTA.",
    icon: Building2,
  },
];

const onboardingSteps = [
  {
    title: "Create your provider account",
    description:
      "Create the provider owner's FEASTA account to begin the provider onboarding journey.",
    icon: UserRound,
  },
  {
    title: "Verify your email",
    description:
      "Complete email verification so FEASTA can continue securely with your provider account.",
    icon: MailCheck,
  },
  {
    title: "Complete your business profile",
    description:
      "Provide the business and service information required by the existing provider onboarding process.",
    icon: Building2,
  },
  {
    title: "Submit verification requirements",
    description:
      "Complete the provider verification information requested during onboarding before your business can be reviewed.",
    icon: ClipboardCheck,
  },
  {
    title: "FEASTA reviews your application",
    description:
      "Your submitted provider information goes through FEASTA's verification and review process.",
    icon: BadgeCheck,
  },
  {
    title: "Access your provider workspace",
    description:
      "Once approved, continue managing your business and supported provider activities through the FEASTA provider workspace.",
    icon: BriefcaseBusiness,
  },
];

const preparationItems = [
  "Provider owner's information",
  "Business information",
  "Business contact details",
  "Service or package information",
  "Verification information requested during onboarding",
];

export default function BecomeAProviderPage() {
  return (
    <>
      <LandingHeader />

      <main className="overflow-hidden bg-background pt-[72px] text-foreground">
        {/* Hero */}
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
              Become a Provider
            </p>

            <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-bold leading-tight tracking-[-0.035em] sm:text-5xl lg:text-6xl">
              Grow your event business with Feasta.
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Present your services, connect with customers planning
              celebrations, and manage booking opportunities through one
              organized provider experience.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/provider-register"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-pill bg-primary px-7 font-bold text-white shadow-card transition-all hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none sm:w-auto"
                >
                {/* Wrap text and sr-only together so it counts as a single flex item */}
                <span>
                    Register Business
                    <span className="sr-only"> (opens in a new tab)</span>
                </span>
                
                <ArrowRight
                    aria-hidden="true"
                    className="size-5 transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
                />
                </Link>
            </div>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
              Creating an account begins provider onboarding. Business
              activation remains subject to FEASTA verification and approval.
            </p>
          </div>
        </section>

        {/* Why join */}
        <section className="px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-[1180px]">
            <div className="grid items-end gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div className="max-w-3xl">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Why join Feasta
                </p>

                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Put your event services where customers can discover them.
                </h2>
            </div>

            <p className="max-w-xl leading-7 text-muted-foreground lg:justify-self-end">
                FEASTA gives providers a focused place to present their business,
                receive event opportunities, and manage their participation in the
                booking journey.
            </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3 lg:mt-14">
            {providerBenefits.map((benefit, index) => {
                const Icon = benefit.icon;

                return (
                <article
                    key={benefit.title}
                    className="group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card p-6 shadow-card transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-floating focus-within:border-primary/40 motion-reduce:transform-none motion-reduce:transition-none sm:p-7"
                >
                    <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-primary transition-transform duration-200 group-hover:scale-x-100 motion-reduce:transition-none"
                    />

                    <div className="flex items-start justify-between gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-card">
                        <Icon aria-hidden="true" className="size-5" />
                    </span>

                    <span className="text-sm font-bold tracking-[0.14em] text-primary-strong">
                        {String(index + 1).padStart(2, "0")}
                    </span>
                    </div>

                    <h3 className="mt-6 text-xl font-bold">
                    {benefit.title}
                    </h3>

                    <p className="mt-3 leading-7 text-muted-foreground">
                    {benefit.description}
                    </p>

                    <div className="mt-auto pt-6">
                    <span
                        aria-hidden="true"
                        className="block h-px w-full bg-border"
                    />
                    </div>
                </article>
                );
            })}
            </div>
        </div>
        </section>
        

        {/* Provider types */}
        <section className="bg-secondary px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Who can join
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Built for providers supporting memorable events.
            </h2>

            <p className="mx-auto mt-5 max-w-2xl leading-7 text-muted-foreground">
                FEASTA supports catering businesses, supported event-service
                providers, and businesses offering both types of services.
            </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3 lg:mt-14">
            {providerTypes.map((provider, index) => {
                const Icon = provider.icon;

                return (
                <article
                    key={provider.title}
                    className="group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card p-6 shadow-card transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-floating motion-reduce:transform-none motion-reduce:transition-none sm:p-7"
                >
                    <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-1 bg-primary"
                    />

                    <div className="flex items-start justify-between gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary-strong">
                        <Icon aria-hidden="true" className="size-5" />
                    </span>

                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-primary-strong">
                        {String(index + 1).padStart(2, "0")}
                    </span>
                    </div>

                    <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-primary-strong">
                    {provider.eyebrow}
                    </p>

                    <h3 className="mt-2 text-xl font-bold">
                    {provider.title}
                    </h3>

                    <p className="mt-3 leading-7 text-muted-foreground">
                    {provider.description}
                    </p>

                    <div className="mt-auto pt-6">
                    <span
                        aria-hidden="true"
                        className="block h-px w-full bg-border"
                    />
                    </div>
                </article>
                );
            })}
            </div>
        </div>
        </section>

       {/* Onboarding */}
        <section className="px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-[1180px]">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-16">
            <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Provider onboarding
                </p>

                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                From registration to becoming ready for customers.
                </h2>
            </div>

            <p className="max-w-xl leading-7 text-muted-foreground lg:justify-self-end">
                Create your provider account, complete your business information,
                submit the required verification details, and prepare your services
                before becoming active on FEASTA.
            </p>
            </div>

            <div className="relative mt-12 lg:mt-16">
            {/* Desktop journey line */}
            <div
                aria-hidden="true"
                className="absolute bottom-0 left-[31px] top-0 hidden w-px bg-border lg:block"
            />

            <div className="space-y-5 lg:space-y-6">
                {onboardingSteps.map((step, index) => {
                const Icon = step.icon;
                const stepNumber = String(index + 1).padStart(2, "0");

                return (
                    <article
                    key={step.title}
                    className="group relative grid gap-5 rounded-card border border-border bg-card p-5 shadow-card transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-floating motion-reduce:transform-none motion-reduce:transition-none sm:p-6 lg:grid-cols-[64px_1fr_auto] lg:items-center lg:gap-7 lg:p-7"
                    >
                    <div className="relative z-10">
                        <span className="flex size-16 items-center justify-center rounded-full border-4 border-background bg-primary text-white shadow-card">
                        <Icon
                            aria-hidden="true"
                            className="size-6"
                        />
                        </span>
                    </div>

                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-strong">
                            Step {stepNumber}
                        </span>

                        {index === onboardingSteps.length - 1 && (
                            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary-strong">
                            Final onboarding stage
                            </span>
                        )}
                        </div>

                        <h3 className="mt-2 text-xl font-bold sm:text-2xl">
                        {step.title}
                        </h3>

                        <p className="mt-2 max-w-3xl leading-7 text-muted-foreground">
                        {step.description}
                        </p>
                    </div>

                    <div
                        aria-hidden="true"
                        className="hidden min-w-14 justify-end text-3xl font-bold tracking-tight text-primary/20 lg:flex"
                    >
                        {stepNumber}
                    </div>
                    </article>
                );
                })}
            </div>
            </div>
        </div>
        </section>

        {/* Preparation */}
        <section className="bg-secondary px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-[1180px]">
            <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <div className="max-w-xl">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Prepare before you start
                </p>

                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                Have the right information ready before onboarding.
                </h2>

                <p className="mt-5 leading-7 text-muted-foreground">
                Preparing your business details in advance can make the provider
                onboarding process easier to complete.
                </p>

                <div className="mt-8 rounded-card border border-primary/15 bg-card p-5 shadow-card sm:p-6">
                <div className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                    <ClipboardCheck
                        aria-hidden="true"
                        className="size-5"
                    />
                    </span>

                    <div>
                    <h3 className="font-bold">
                        Verification comes later in the journey
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Additional verification information may be requested during
                        onboarding as part of FEASTA&apos;s provider review process.
                    </p>
                    </div>
                </div>
                </div>
            </div>

            <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary-strong">
                Provider readiness checklist
                </p>

                <ul className="mt-5 overflow-hidden rounded-card border border-border bg-card shadow-card">
                {preparationItems.map((item, index) => (
                    <li
                    key={item}
                    className="group flex items-center gap-4 border-b border-border px-5 py-5 last:border-b-0 transition-colors hover:bg-secondary/60 sm:px-7"
                    >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary-strong">
                        <Check
                        aria-hidden="true"
                        className="size-4"
                        />
                    </span>

                    <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-primary-strong">
                        Item {String(index + 1).padStart(2, "0")}
                        </span>

                        <p className="mt-1 font-semibold leading-7 text-foreground">
                        {item}
                        </p>
                    </div>
                    </li>
                ))}
                </ul>

                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Exact information requested may depend on the provider onboarding
                and verification steps available to your account.
                </p>
            </div>
            </div>
        </div>
        </section>

        {/* Verification */}
        <section className="px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-[1180px]">
            <div className="grid overflow-hidden rounded-dialog border border-border bg-card shadow-floating lg:grid-cols-[0.82fr_1.18fr]">
            <div className="relative flex min-h-72 items-center justify-center overflow-hidden bg-foreground px-8 py-14 text-white sm:min-h-80">
                <div
                aria-hidden="true"
                className="absolute -left-16 -top-16 size-56 rounded-full bg-primary/20 blur-3xl"
                />
                <div
                aria-hidden="true"
                className="absolute -bottom-24 -right-16 size-64 rounded-full bg-primary/10 blur-3xl"
                />

                <div className="relative text-center">
                <span className="mx-auto flex size-20 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-card">
                    <BadgeCheck
                    aria-hidden="true"
                    className="size-10 text-primary"
                    />
                </span>

                <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-primary">
                    Provider Verification
                </p>

                <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-white/70">
                    Provider accounts move through FEASTA&apos;s review process before
                    business activation.
                </p>
                </div>
            </div>

            <div className="px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
                Before activation
                </p>

                <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                Provider activation follows FEASTA verification.
                </h2>

                <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
                Creating a provider account is only the beginning of the onboarding
                journey. It does not automatically activate your business on FEASTA.
                </p>

                <div className="mt-7 grid gap-4">
                <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary-strong">
                    <Check
                        aria-hidden="true"
                        className="size-4"
                    />
                    </span>

                    <div>
                    <h3 className="font-bold">
                        Complete onboarding information
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Provide the business and verification information required by
                        the existing provider onboarding process.
                    </p>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary-strong">
                    <Check
                        aria-hidden="true"
                        className="size-4"
                    />
                    </span>

                    <div>
                    <h3 className="font-bold">
                        FEASTA reviews the application
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Submitted provider information goes through the platform&apos;s
                        verification and review process.
                    </p>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary-strong">
                    <Check
                        aria-hidden="true"
                        className="size-4"
                    />
                    </span>

                    <div>
                    <h3 className="font-bold">
                        Approval enables the provider experience
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Once approved, the provider can continue with the provider
                        workspace and supported business-management features.
                    </p>
                    </div>
                </div>
                </div>

                <div className="mt-8 rounded-card border border-primary/15 bg-secondary px-5 py-4">
                <p className="text-sm leading-6 text-muted-foreground">
                    Approval is not automatic and depends on completion of the required
                    provider onboarding and verification process.
                </p>
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
