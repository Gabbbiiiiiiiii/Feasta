import {FileCheck2, FileText, ShieldCheck} from "lucide-react";

import {ApplicationEmptyState} from "@/components/feedback/application-states";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {requireRole} from "@/lib/auth/session";

const steps = [
  {title: "Business profile", description: "Confirm the provider details associated with this account.", complete: true},
  {title: "Required documents", description: "Upload a business permit and valid ID through the trusted verification workflow.", complete: false},
  {title: "Submit for review", description: "Submission becomes available after the required documents are registered.", complete: false},
] as const;

export default async function ProviderVerificationPage() {
  await requireRole(["provider"]);

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Provider verification"
        title="Verification checklist"
        description="Track the trusted verification lifecycle without exposing review controls to provider accounts."
        actions={<StatusBadge status="draft" />}
      />
      <ol className="grid gap-4" aria-label="Verification progress">
        {steps.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-card border border-border bg-card p-5 shadow-card">
            <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
              {step.complete ? <FileCheck2 className="size-5" /> : index === 1 ? <FileText className="size-5" /> : <ShieldCheck className="size-5" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold">{index + 1}. {step.title}</h2>
                <StatusBadge status={step.complete ? "completed" : "pending"} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <section className="rounded-card border border-border bg-card" aria-labelledby="verification-documents-title">
        <h2 id="verification-documents-title" className="px-6 pt-6 text-xl font-bold">Registered documents</h2>
        <ApplicationEmptyState kind="verification-submissions" />
      </section>
      <div className="flex justify-end">
        <Button disabled aria-describedby="verification-submit-help">Submit for review</Button>
      </div>
      <p id="verification-submit-help" className="text-right text-sm text-muted-foreground">Register all required documents before submitting.</p>
    </div>
  );
}
