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
  const portalLabel = {
    customer: "Customer account",
    provider: "Provider portal",
    admin: "Admin portal",
  }[portal];
  const portalClass = {
    customer: "border-primary",
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
        <h1 className="mt-2 break-words text-3xl font-bold text-card-foreground">{title}</h1>
        <p className="mt-2 break-words leading-7 text-muted-foreground">{description}</p>
        <div className="mt-8 min-w-0">{children}</div>
        {footer ? <div className="mt-6 border-t border-border pt-5">{footer}</div> : null}
      </section>
    </main>
  );
}
