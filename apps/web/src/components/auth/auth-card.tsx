import {
  BriefcaseBusiness,
  CalendarDays,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type {ReactNode} from "react";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  portal?: "customer" | "provider" | "admin";
};

export function AuthCard({
  title,
  description,
  children,
  footer,
  portal = "customer",
}: AuthCardProps) {
  if (portal === "customer") {
    return (
      <main className="flex min-h-screen min-w-0 items-center justify-center overflow-x-clip bg-background px-4 py-6 sm:px-6 lg:py-10">
        <section
          className="relative grid w-full max-w-5xl overflow-hidden rounded-card border border-border bg-card shadow-floating lg:grid-cols-[0.9fr_1.1fr]"
          data-auth-portal="customer"
        >
          <CustomerAuthBrandPanel />

          <div className="relative min-w-0 px-5 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
            <ButtonCloseLink />

            <Link
              href="/"
              className="inline-flex min-h-12 items-center rounded-lg text-2xl font-black tracking-tight text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
              aria-label="FEASTA home"
            >
              FEASTA
            </Link>

            <p className="mt-5 text-sm font-bold uppercase tracking-widest text-primary-strong lg:mt-0">
              Customer account
            </p>

            <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-card-foreground sm:text-4xl">
              {title}
            </h1>

            <p className="mt-3 max-w-xl break-words text-base leading-7 text-muted-foreground">
              {description}
            </p>

            <div className="mt-8 min-w-0">
              {children}
            </div>

            {footer ? (
              <div className="mt-6 border-t border-border pt-5">
                {footer}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  if (portal === "provider") {
    return (
      <main className="flex min-h-screen min-w-0 items-center justify-center overflow-x-clip bg-background px-4 py-5 sm:px-6 sm:py-8 lg:py-10">
        <section
          className="relative grid w-full max-w-[1040px] overflow-hidden rounded-[20px] border border-border bg-card shadow-floating lg:grid-cols-[0.95fr_1.05fr]"
          data-auth-portal="provider"
        >
          <ProviderAuthBrandPanel />

          <div className="relative min-w-0 px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <ButtonCloseLink />

            <Link
              href="/"
              aria-label="FEASTA home"
              className="inline-flex min-h-12 items-center gap-2 rounded-[10px] pr-2 text-xl font-black tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Image
                src="/images/feasta_logo.png"
                alt=""
                width={40}
                height={40}
                priority
                className="size-10 object-contain"
              />
              <span>
                <span className="text-primary">Feasta</span>{" "}
                Provider
              </span>
            </Link>

            <p className="mt-5 text-sm font-bold uppercase tracking-[0.18em] text-primary-strong lg:mt-0">
              Feasta Provider
            </p>

            <h1 className="mt-2 max-w-xl break-words text-3xl font-black tracking-tight text-card-foreground sm:text-4xl lg:text-[2.5rem]">
              {title}
            </h1>

            <p className="mt-3 max-w-xl break-words text-base leading-7 text-muted-foreground">
              {description}
            </p>

            <div className="mt-7 min-w-0 sm:mt-8">
              {children}
            </div>

            {footer ? (
              <div className="mt-7 border-t border-border pt-5 text-sm text-muted-foreground">
                {footer}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen min-w-0 w-full max-w-lg items-center overflow-x-clip px-4 py-8 sm:px-6 sm:py-10">
      <section
        className="min-w-0 w-full rounded-card border border-border border-t-4 border-warning bg-card p-5 shadow-card sm:p-8"
        data-auth-portal="admin"
      >
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-lg text-xl font-black tracking-tight text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="FEASTA home"
        >
          FEASTA
        </Link>

        <p className="mt-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Admin portal
        </p>

        <h1 className="mt-2 break-words text-3xl font-bold text-card-foreground">
          {title}
        </h1>

        <p className="mt-2 break-words leading-7 text-muted-foreground">
          {description}
        </p>

        <div className="mt-8 min-w-0">
          {children}
        </div>

        {footer ? (
          <div className="mt-6 border-t border-border pt-5">
            {footer}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ProviderAuthBrandPanel() {
  return (
    <aside className="relative hidden min-h-[600px] overflow-hidden bg-foreground px-9 py-10 text-white lg:flex lg:flex-col xl:px-11 xl:py-12">
      <div
        aria-hidden="true"
        className="absolute -left-24 -top-24 size-72 rounded-full bg-primary/20 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="absolute -bottom-28 -right-20 size-80 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative">
        <Link
          href="/"
          aria-label="FEASTA home"
          className="inline-flex min-h-12 items-center gap-3 rounded-[10px] pr-2 text-2xl font-black tracking-[-0.04em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Image
            src="/images/feasta_logo.png"
            alt=""
            width={44}
            height={44}
            priority
            className="size-11 object-contain"
          />
          <span>
            <span className="text-primary">Feasta</span>{" "}
            Provider
          </span>
        </Link>

        <p className="mt-10 text-sm font-bold uppercase tracking-[0.2em] text-primary">
          Feasta Provider
        </p>

        <h2 className="mt-3 max-w-sm text-3xl font-black leading-tight tracking-tight">
          Manage your event business with Feasta.
        </h2>

        <p className="mt-4 max-w-md leading-7 text-white/70">
          Access your provider workspace to manage your business profile,
          services, booking opportunities, and account information.
        </p>
      </div>

      <ul className="relative mt-9 space-y-5">
        <ProviderAuthBenefit
          icon={<BriefcaseBusiness aria-hidden="true" />}
          title="Manage your provider profile"
          description="Keep your business and account information organized."
        />
        <ProviderAuthBenefit
          icon={<PackageOpen aria-hidden="true" />}
          title="Maintain services and packages"
          description="Review the offerings connected to your provider workspace."
        />
        <ProviderAuthBenefit
          icon={<ShieldCheck aria-hidden="true" />}
          title="Review onboarding and verification"
          description="Continue setup and check your current provider status."
        />
      </ul>
    </aside>
  );
}

function ProviderAuthBenefit({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-primary/25 bg-primary/10 text-primary [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-bold text-white">{title}</p>
        <p className="mt-1 text-sm leading-6 text-white/65">{description}</p>
      </div>
    </li>
  );
}

function CustomerAuthBrandPanel() {
  return (
    <aside className="relative hidden min-h-[680px] overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
      <div
        aria-hidden="true"
        className="absolute -left-20 -top-24 size-72 rounded-full bg-card/10"
      />

      <div
        aria-hidden="true"
        className="absolute -bottom-24 -right-20 size-80 rounded-full bg-card/10"
      />

      <div className="relative">
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-lg text-3xl font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
          aria-label="FEASTA home"
        >
          FEASTA
        </Link>

        <p className="mt-3 max-w-sm text-base leading-7 text-primary-foreground/90">
          Plan memorable celebrations with trusted catering and event
          providers in Ormoc City.
        </p>
      </div>

      <div className="relative space-y-4">
        <AuthBenefit
          icon={<Sparkles aria-hidden="true" />}
          title="Discover trusted providers"
          description="Compare services and packages for your celebration."
        />

        <AuthBenefit
          icon={<CalendarDays aria-hidden="true" />}
          title="Manage bookings in one place"
          description="Track requests, schedules, and payment progress."
        />

        <AuthBenefit
          icon={<ShieldCheck aria-hidden="true" />}
          title="Book with confidence"
          description="Verified providers and secure payment processing."
        />
      </div>

      <p className="relative text-sm text-primary-foreground/80">
        Catering and event services made easier.
      </p>
    </aside>
  );
}

function AuthBenefit({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 rounded-xl bg-card/10 p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-card/15 [&_svg]:size-5">
        {icon}
      </span>

      <div className="min-w-0">
        <p className="font-bold">
          {title}
        </p>

        <p className="mt-1 text-sm leading-6 text-primary-foreground/85">
          {description}
        </p>
      </div>
    </div>
  );
}

function ButtonCloseLink() {
  return (
    <Link
      href="/"
      aria-label="Close authentication"
      className="absolute right-4 top-4 inline-flex size-12 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X
        aria-hidden="true"
        className="size-5"
      />
    </Link>
  );
}
