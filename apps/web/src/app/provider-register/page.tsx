import Image from "next/image";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarCheck2,
  UsersRound,
} from "lucide-react";

import {ProviderPhoneRegistrationForm} from "./provider-phone-registration-form";

const providerBenefits = [
  {
    title: "Reach more customers",
    description:
      "Showcase your catering or event services to customers planning celebrations in Ormoc City.",
    icon: UsersRound,
  },
  {
    title: "Manage your services",
    description:
      "Maintain your business profile, packages, availability, and provider information from one workspace.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Receive booking opportunities",
    description:
      "Review customer booking requests and manage upcoming confirmed events through FEASTA.",
    icon: CalendarCheck2,
  },
] as const;

const providerJourney = [
  "Verify mobile number",
  "Add account details and link email",
  "Verify email",
  "Complete business profile",
  "Submit required verification information",
  "FEASTA reviews the provider application",
  "Approved provider becomes available for appropriate platform use",
] as const;

export default function ProviderRegistrationPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="relative z-30 border-b border-border bg-card">
        <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between px-4 sm:px-8 lg:px-10">
          <Link
            href="/"
            aria-label="FEASTA home"
            className="inline-flex items-center gap-2 rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Image
              src="/images/feasta_logo.png"
              alt=""
              width={42}
              height={42}
              priority
              className="size-10 object-contain"
            />
            <span className="text-xl font-black tracking-[-0.03em] sm:text-2xl">
              <span className="text-primary">Feasta</span>{" "}
              <span className="text-foreground">Provider</span>
            </span>
          </Link>
          <Link
            href="/provider-login"
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Login
          </Link>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-foreground">
        <Image
          src="https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=2200&q=90"
          alt="Catering team preparing an elegant event venue"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/55 to-black/35 lg:from-black/45 lg:via-black/55 lg:to-black/75"
        />

        <div className="relative z-10 mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-8 sm:px-8 sm:py-10 lg:min-h-[760px] lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:px-10 lg:py-14 xl:gap-24">
          <section
            aria-label="Provider mobile registration"
            className="order-2 w-full rounded-[14px] border border-white/20 bg-card p-5 shadow-modal sm:p-7 lg:order-1"
          >
            <ProviderPhoneRegistrationForm />
            <p className="mt-5 text-center text-sm text-muted-foreground">
              Already have a provider account?{" "}
              <Link
                href="/provider-login"
                className="font-bold text-primary-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Log in
              </Link>
            </p>
          </section>

          <div className="order-1 max-w-2xl text-white lg:order-2">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">
              Become a FEASTA provider
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.06] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Grow your event business with FEASTA.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
              Connect with customers looking for trusted catering and event
              services in Ormoc City.
            </p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">
              Secure your provider account by verifying your mobile number
              before adding account and business details.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-card px-4 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-strong">
              Provider benefits
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              Grow your event business with FEASTA
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {providerBenefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <article
                  key={benefit.title}
                  className="rounded-[14px] border border-border bg-background p-6 shadow-card"
                >
                  <span className="flex size-12 items-center justify-center rounded-[10px] bg-secondary text-primary-strong">
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  <h3 className="mt-5 text-base font-black uppercase tracking-[0.08em]">
                    {benefit.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {benefit.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-secondary px-4 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-strong">
              Provider journey
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              From mobile verification to FEASTA review
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Provider approval is not automatic. Each business completes
              onboarding and submits the required information for FEASTA review.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {providerJourney.map((step, index) => (
              <li
                key={step}
                className="flex min-w-0 items-start gap-4 rounded-[14px] border border-border bg-card p-5 shadow-card"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-sm font-black text-primary-foreground">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm font-bold leading-6">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
