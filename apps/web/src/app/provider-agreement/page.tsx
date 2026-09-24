import Link from "next/link";

import {
  PROVIDER_AGREEMENT_VERSION,
} from "@feasta/shared-types";

import {
  PROVIDER_AGREEMENT_FINAL_SECTION,
  PROVIDER_AGREEMENT_SECTIONS,
} from "@/lib/provider/provider-agreement";

export default function ProviderAgreementPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <header className="border-b border-border px-5 py-6 sm:px-8 sm:py-8">
            <p className="text-sm font-semibold text-primary">
              Provider policies
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              FEASTA Provider Agreement
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              These rules explain the responsibilities that apply when a
              business offers catering or event services through FEASTA.
            </p>

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  Effective:
                </span>{" "}
                September 23, 2026
              </p>

              <p>
                <span className="font-medium text-foreground">
                  Version:
                </span>{" "}
                {PROVIDER_AGREEMENT_VERSION}
              </p>
            </div>
          </header>

          <div className="px-5 py-6 sm:px-8 sm:py-8">
            <div className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
              <h2 className="font-semibold text-foreground">
                Before you continue
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Please read this agreement before accepting it during provider
                onboarding. Acceptance applies to the provider responsibilities
                described below and is recorded with the agreement version and
                acceptance time.
              </p>
            </div>

            <div className="mt-8 grid gap-8">
              {PROVIDER_AGREEMENT_SECTIONS.map((section) => (
                <section
                  key={section.title}
                  className="scroll-mt-6"
                >
                  <h2 className="text-lg font-semibold text-foreground">
                    {section.title}
                  </h2>

                  <div className="mt-3 grid gap-3">
                    {section.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="text-sm leading-7 text-muted-foreground sm:text-base"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <section className="mt-8 border-t border-border pt-8">
              <h2 className="text-lg font-semibold text-foreground">
                {PROVIDER_AGREEMENT_FINAL_SECTION.title}
              </h2>

              <div className="mt-3 grid gap-3">
                {PROVIDER_AGREEMENT_FINAL_SECTION.paragraphs.map(
                  (paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-7 text-muted-foreground sm:text-base"
                    >
                      {paragraph}
                    </p>
                  ),
                )}
              </div>
            </section>

            <div className="mt-8 rounded-xl border border-border p-4 sm:p-5">
              <p className="text-sm leading-6 text-muted-foreground">
                This Provider Agreement is provider-specific. Your FEASTA
                account is also subject to the platform-wide Terms of Service
                and Privacy Policy.
              </p>

              <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
                <Link
                  href="/terms"
                  className="text-primary hover:underline"
                >
                  Terms of Service
                </Link>

                <Link
                  href="/privacy"
                  className="text-primary hover:underline"
                >
                  Privacy Policy
                </Link>
              </div>
            </div>

            <p className="mt-6 text-xs leading-5 text-muted-foreground">
              This policy text is prepared for the FEASTA project and should
              receive appropriate legal and privacy review before production
              use with real commercial transactions.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
