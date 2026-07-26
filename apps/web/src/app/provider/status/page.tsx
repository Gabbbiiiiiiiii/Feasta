import {redirect} from "next/navigation";
import {
  authenticationGatePresentation,
  type AuthenticationGateKind,
} from "@feasta/shared-types";

import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {
  loadOwnedProviderVerification,
  requireProvider,
} from "@/lib/auth/session";

export default async function ProviderStatusPage() {
  const account = await requireProvider();
  if (!account.provider) redirect("/provider/onboarding");
  const status = account.provider.verificationStatus;
  if (status === "approved" && account.provider.isActive && !account.provider.isSuspended) {
    redirect("/provider");
  }
  if (status === "draft" || status === "resubmission_required") {
    redirect("/provider/verification");
  }
  const verification = await loadOwnedProviderVerification(account);
  const presentation = statusCopy(status);
  const reason = status === "rejected"
    ? verification?.rejectionReason
    : status === "suspended"
      ? verification?.suspensionReason
      : verification?.remarks;

  return (
    <div className="grid gap-6">
      <PageHeading eyebrow="Provider account status" title={presentation.title} description={presentation.description} actions={<StatusBadge status={status} />} />
      <section className="rounded-card border border-border bg-card p-6 shadow-card" aria-labelledby="provider-next-steps-title">
        <h2 id="provider-next-steps-title" className="text-xl font-bold">What happens next</h2>
        <p className="mt-3 leading-7 text-muted-foreground">{presentation.next}</p>
        {reason ? (
          <div className="mt-5 rounded-lg border border-border bg-muted p-4">
            <h3 className="font-bold">FEASTA review note</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm">{reason}</p>
          </div>
        ) : null}
        {status === "rejected" || status === "suspended" ? (
          <p className="mt-5 text-sm text-muted-foreground">Contact FEASTA support using the established support channel. No public appeal workflow is currently configured.</p>
        ) : null}
      </section>
    </div>
  );
}

function statusCopy(status: string) {
  const gateKind = providerGateKind(status);
  const canonical = authenticationGatePresentation(gateKind);
  switch (status) {
    case "submitted":
      return {title: canonical.label, description: canonical.message, next: "You can review your account status while business operations remain unavailable."};
    case "under_review":
      return {title: canonical.label, description: canonical.message, next: "No action is required unless FEASTA requests new documents."};
    case "rejected":
      return {title: canonical.label, description: canonical.message, next: "Review the administrator note below. Approved-provider operations remain disabled."};
    case "suspended":
      return {title: canonical.label, description: canonical.message, next: "Review the suspension reason and contact support through the established channel."};
    default:
      return {title: canonical.label, description: canonical.message, next: "Contact FEASTA support for assistance."};
  }
}

function providerGateKind(status: string): AuthenticationGateKind {
  switch (status) {
    case "submitted":
      return "providerVerificationSubmitted";
    case "under_review":
      return "providerUnderReview";
    case "rejected":
      return "providerRejected";
    case "suspended":
      return "providerSuspended";
    default:
      return "invalidAccountState";
  }
}
