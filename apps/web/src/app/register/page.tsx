"use client";

import {Suspense} from "react";
import Link from "next/link";
import Image from "next/image";
import {useSearchParams} from "next/navigation";
import {CustomerRegistrationForm} from "@/components/auth/customer-registration-form";

export default function CustomerRegistrationPage() {
  return (
    <Suspense
      fallback={
        <RegistrationFallback />
      }
    >
      <CustomerRegistrationScreen />
    </Suspense>
  );
}

function CustomerRegistrationScreen() {
  const searchParams = useSearchParams();
  return (
    <main className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(420px,0.9fr)_minmax(560px,1.1fr)]">
        {/* LEFT BRAND PANEL */}
        <section className="relative hidden overflow-hidden bg-[#2b211d] px-12 py-12 lg:flex lg:flex-col xl:px-20 xl:py-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 feasta-brand-ambient"
          />

          <div className="relative z-10 flex h-full flex-col">
            <Link
              href="/"
              aria-label="FEASTA home"
              className="inline-flex w-fit items-center rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-[#2b211d]"
            >
              <Image
                src="/images/feasta_logo.svg"
                alt="Feasta"
                width={586}
                height={202}
                priority
                className="h-9 w-auto object-contain"
              />
            </Link>

            <div className="my-auto max-w-[500px] py-14">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
                FEASTA CUSTOMER
              </p>

              <h1 className="mt-5 text-4xl font-black leading-[1.06] tracking-[-0.04em] text-white xl:text-5xl">
                Plan your celebration in one place.
              </h1>

              <p className="mt-5 max-w-[460px] text-base leading-7 text-white/70">
                Create your FEASTA account to discover local event services,
                manage booking requests, save Providers, and keep your event
                planning organized.
              </p>

              <div className="mt-10 space-y-6">
                {[
                  {
                    title: "Discover trusted Providers",
                    description:
                      "Explore local event services, packages, and Providers for your celebration.",
                  },
                  {
                    title: "Manage your booking journey",
                    description:
                      "Track requests, Provider responses, booking progress, and important event details.",
                  },
                  {
                    title: "Stay connected",
                    description:
                      "Keep your selected Providers and important conversations tied to your event journey.",
                  },
                ].map((benefit) => (
                  <div key={benefit.title} className="flex items-start gap-4">
                    <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
                      ✓
                    </span>

                    <div>
                      <p className="font-bold text-white">
                        {benefit.title}
                      </p>

                      <p className="mt-1 text-sm leading-6 text-white/65">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs leading-5 text-white/45">
              FEASTA Customer Portal
            </p>
          </div>
        </section>

        {/* RIGHT REGISTRATION PANEL */}
        <section className="relative flex min-h-screen items-center justify-center px-6 py-10 sm:px-10 lg:px-14 xl:px-16">
          <div className="w-full max-w-[600px]">
            {/* MOBILE BRAND */}
            <Link
              href="/"
              aria-label="FEASTA home"
              className="mb-8 inline-flex items-center rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Image
                src="/images/feasta_logo.svg"
                alt="Feasta"
                width={586}
                height={202}
                priority
                className="h-8 w-auto object-contain"
              />
            </Link>

            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary-strong">
                CUSTOMER ACCOUNT
              </p>

              <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
                Create your account
              </h2>

              <p className="mt-3 text-base leading-7 text-muted-foreground">
                Register to manage bookings, save your favorite Providers, and
                keep your event planning organized.
              </p>
            </div>

            <div className="mt-8">
              <CustomerRegistrationForm returnTo={searchParams.get("next")} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function RegistrationFallback() {
  return (
    <main className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(440px,0.88fr)_minmax(620px,1.12fr)]">
        <div className="hidden bg-[#2b211d] lg:block" />

        <section className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
          <div
            className="grid w-full max-w-[520px] gap-4"
            aria-label="Loading customer registration"
            aria-busy="true"
          >
            <div className="h-8 w-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="h-12 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="h-12 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="h-12 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="h-12 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          </div>
        </section>
      </div>
    </main>
  );
}
