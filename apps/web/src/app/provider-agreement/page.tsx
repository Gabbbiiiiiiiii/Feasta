import Link from "next/link";

import {ProviderAgreementAcceptanceSection} from "@/components/provider/provider-agreement-acceptance";
import {Button} from "@/components/ui/button";
import {getOptionalAccountContext} from "@/lib/auth/session";
import {getProviderOnboardingAgreement} from "@/lib/documents/document-catalog-service";
import {loadProviderAgreementAcceptanceSummary} from "@/lib/provider/provider-agreement-download";

export default async function ProviderAgreementPage() {
  const account = await getOptionalAccountContext({checkRevoked: true});
  const [agreement, acceptance] = await Promise.all([
    getProviderOnboardingAgreement(),
    account?.role === "provider"
      ? loadProviderAgreementAcceptanceSummary({
          uid: account.uid,
          providerId: account.providerId,
        })
      : Promise.resolve(null),
  ]);
  const acceptedCopyAvailable = Boolean(acceptance?.snapshot);
  const downloadLabel = acceptedCopyAvailable
    ? "Download Accepted Copy"
    : "Download PDF";
  const downloadHref = acceptedCopyAvailable
    ? "/api/provider/agreement/pdf?copy=accepted"
    : "/api/provider/agreement/pdf";
  const acceptedCurrentVersion = Boolean(
    agreement &&
    acceptance?.snapshot &&
    acceptance.snapshot.version === agreement.version,
  );

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <header className="border-b border-border px-5 py-6 sm:px-8 sm:py-8">
            <p className="text-sm font-semibold text-primary">
              Provider policies
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {agreement?.name ?? "Provider agreement"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {agreement?.summary ||
                "The current provider agreement will appear here after an administrator publishes it."}
            </p>
            {agreement ? (
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Effective:</span>{" "}
                  {agreement.effectiveDate}
                </p>
                <p>
                  <span className="font-medium text-foreground">Version:</span>{" "}
                  {agreement.version}
                </p>
                {account?.role === "provider" ? (
                  <Button variant="secondary" size="compact" asChild className="w-fit">
                    <a href={downloadHref}>{downloadLabel}</a>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </header>
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {agreement ? (
              <div className="grid gap-8">
                {agreement.sections.map((section, index) => (
                  <section key={`${index}-${section.title}`}>
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
            ) : (
              <p className="text-sm leading-6 text-muted-foreground" role="status">
                FEASTA has not published a provider agreement yet.
              </p>
            )}
            {agreement && acceptance ? (
              <div className="mt-8 border-t border-border pt-6">
                <ProviderAgreementAcceptanceSection
                  businessName={acceptance.businessName}
                  representativeName={acceptance.representativeName}
                  agreementName={agreement.name}
                  version={agreement.version}
                  effectiveDate={agreement.effectiveDate}
                  accepted={acceptedCurrentVersion}
                />
              </div>
            ) : null}
            <div className="mt-8 rounded-xl border border-border p-4 sm:p-5">
              <p className="text-sm leading-6 text-muted-foreground">
                This agreement is provider-specific. Your FEASTA account is also
                subject to the platform-wide Terms of Service and Privacy Policy.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Terms of Service
                </Link>
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
