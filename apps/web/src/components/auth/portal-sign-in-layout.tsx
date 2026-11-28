import Image from "next/image";
import Link from "next/link";
import type {LucideIcon} from "lucide-react";
import type {ReactNode} from "react";

export function PortalSignInLayout({
  eyebrow, portalLabel, introTitle, introDescription, title, description, brandHref, benefits, children,
}: {
  eyebrow: string;
  portalLabel: string;
  introTitle: string;
  introDescription: string;
  title: string;
  description: string;
  brandHref: string;
  benefits: readonly {icon: LucideIcon; title: string; description: string}[];
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
        <section
          className="
            relative hidden overflow-hidden
            bg-feasta-surface-strong text-white
            px-12 py-12
            lg:flex lg:flex-col
            xl:px-20 xl:py-16
          "
        >
          <div
            aria-hidden="true"
            className="
              pointer-events-none absolute inset-0
              feasta-brand-ambient
            "
          />

          <div className="relative z-10 flex h-full flex-col">
            <Link
              href={brandHref}
              aria-label="Feasta home"
              className="
                inline-flex w-fit items-center gap-3
                rounded-[10px]
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-primary
                focus-visible:ring-offset-4
                focus-visible:ring-offset-feasta-surface-strong
              "
            >
              <Image
                src="/images/feasta_logo.svg"
                alt="FEASTA"
                width={586}
                height={202}
                className="h-7 w-auto rounded-md bg-white px-2 py-1 object-contain sm:h-8"
                priority
              />
            </Link>

            <div className="my-auto max-w-[500px] py-14">
              <p className="font-serif text-sm font-semibold uppercase tracking-[0.16em] text-primary-tint">
                {eyebrow}
              </p>

              <p className="mt-5 text-4xl font-black leading-[1.08] tracking-[-0.04em] text-white xl:text-5xl">
                {introTitle}
              </p>

              <p className="mt-5 max-w-[460px] text-base leading-7 text-white/70">
                {introDescription}
              </p>

              <div className="mt-10 space-y-7">
                {benefits.map((benefit) => {
                  const Icon = benefit.icon;

                  return (
                    <div
                      key={benefit.title}
                      className="flex items-start gap-4"
                    >
                      <div
                        className="
                          flex size-11 shrink-0 items-center justify-center
                          rounded-[10px]
                          border border-primary/30
                          bg-primary/10
                        "
                      >
                        <Icon
                          aria-hidden="true"
                          className="size-5 text-primary-tint"
                        />
                      </div>

                      <div>
                        <p className="font-bold text-white">
                          {benefit.title}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-white/65">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs leading-5 text-white/45">
              {portalLabel}
            </p>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-24">

          <div className="w-full max-w-[500px]">
            <Link
              href={brandHref}
              aria-label="Feasta home"
              className="
                mb-10 inline-flex items-center gap-2
                rounded-[10px]
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-ring
                lg:hidden
              "
            >
              <Image
                src="/images/feasta_logo.svg"
                alt="FEASTA"
                width={586}
                height={202}
                className="h-7 w-auto object-contain sm:h-8"
              />
            </Link>

            <div>
              <p className="font-serif text-sm font-semibold uppercase tracking-[0.16em] text-primary-strong">
                {eyebrow}
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
                {title}
              </h1>

              <p className="mt-3 text-base text-muted-foreground">
                {description}
              </p>
            </div>

            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
