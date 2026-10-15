import {
  getCurrentLegalAgreement,
  type LegalPurpose,
} from "@/lib/documents/current-legal-agreement";

export async function LegalAgreementPage({purpose}: {purpose: LegalPurpose}) {
  const agreement = await getCurrentLegalAgreement(purpose);
  const title = purpose === "platform_terms" ? "Terms of Service" : "Privacy Policy";
  return (
    <main className="min-h-screen bg-background">
      <article className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <header className="border-b border-border px-5 py-6 sm:px-8 sm:py-8">
            <p className="text-sm font-semibold text-primary">{title}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {agreement?.name ?? title}
            </h1>
            {agreement?.summary ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground sm:text-base">{agreement.summary}</p>
            ) : null}
            {agreement ? (
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                <p>Version {agreement.version}</p>
                <p>Effective date: {agreement.effectiveDate}</p>
              </div>
            ) : null}
          </header>
          <div className="grid gap-8 px-5 py-6 sm:px-8 sm:py-8">
            {agreement ? agreement.sections.map((section, index) => (
              <section key={index}>
                <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
                <div className="mt-3 grid gap-3">
                  {section.paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground sm:text-base">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            )) : (
              <p role="status" className="text-sm leading-7 text-muted-foreground">
                {purpose === "platform_terms"
                  ? "Terms of Service are currently unavailable."
                  : "Privacy Policy is currently unavailable."}
              </p>
            )}
          </div>
        </div>
      </article>
    </main>
  );
}
