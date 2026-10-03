import {
  PackageSearch,
  Sparkles,
} from "lucide-react";
import type {ReactNode} from "react";

export function PackageDirectoryShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="-mx-4 -my-6 min-h-[calc(100dvh-4rem)] bg-feasta-canvas px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto w-full max-w-[1320px] min-w-0">
        <section className="relative overflow-hidden rounded-[28px] border border-feasta-border-soft bg-white px-5 py-7 shadow-[0_10px_34px_rgb(43_33_29/0.045)] sm:px-7 sm:py-8 lg:px-9 lg:py-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-primary/[0.055] blur-3xl"
          />

          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-secondary px-3 py-2">
                <Sparkles
                  aria-hidden="true"
                  className="size-4 text-primary-strong"
                />

                <span className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                  FEASTA Marketplace
                </span>
              </div>

              <h1 className="mt-5 max-w-[760px] text-3xl font-extrabold tracking-[-0.045em] text-foreground sm:text-4xl lg:text-[48px] lg:leading-[1.03]">
                Start with a package.
                <span className="block text-primary">
                  Make the celebration yours.
                </span>
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-feasta-text-secondary sm:text-lg sm:leading-8">
                Explore published event packages from verified providers and
                compare the details that matter for your celebration.
              </p>
            </div>

            <div className="hidden lg:flex">
              <div className="flex items-center gap-3 rounded-[18px] border border-feasta-border-soft bg-feasta-canvas px-4 py-3">
                <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary-strong">
                  <PackageSearch
                    aria-hidden="true"
                    className="size-5"
                  />
                </div>

                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary-strong">
                    Compare
                  </p>

                  <p className="mt-0.5 text-sm font-semibold text-feasta-text-secondary">
                    Packages for your event
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid min-w-0 gap-5 sm:mt-7 sm:gap-6">
          {children}
        </div>
      </div>
    </div>
  );
}