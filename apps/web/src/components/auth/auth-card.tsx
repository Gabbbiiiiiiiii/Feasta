import {
  CalendarDays,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
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

  const portalLabel = {
    provider: "Provider portal",
    admin: "Admin portal",
  }[portal];

  const portalClass = {
    provider: "border-info",
    admin: "border-warning",
  }[portal];

  return (
    <main className="mx-auto flex min-h-screen min-w-0 w-full max-w-lg items-center overflow-x-clip px-4 py-8 sm:px-6 sm:py-10">
      <section
        className={`min-w-0 w-full rounded-card border border-border border-t-4 ${portalClass} bg-card p-5 shadow-card sm:p-8`}
        data-auth-portal={portal}
      >
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-lg text-xl font-black tracking-tight text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="FEASTA home"
        >
          FEASTA
        </Link>

        <p className="mt-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {portalLabel}
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
      aria-label="Close customer authentication"
      className="absolute right-4 top-4 inline-flex size-12 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X aria-hidden="true" className="size-5" />
    </Link>
  );
}