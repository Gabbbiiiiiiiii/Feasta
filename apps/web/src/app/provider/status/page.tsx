import Link from "next/link";
import {redirect} from "next/navigation";

import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {
  loadOwnedProviderVerification,
  requireProvider,
} from "@/lib/auth/session";
import {providerStatusPresentation} from "@/lib/provider/status";

export default async function ProviderStatusPage() {
  const account = await requireProvider();
  if (!account.provider) redirect("/provider/onboarding");
  const status = account.provider.verificationStatus;
  const verification = await loadOwnedProviderVerification(account);
  const presentation = providerStatusPresentation(status);
  const reason = presentation.visibleReason && verification
    ? verification[presentation.visibleReason]
    : null;

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
        {presentation.actionHref && presentation.actionLabel ? (
          <Button asChild className="mt-5 w-full sm:w-auto">
            <Link href={presentation.actionHref}>
              {presentation.actionLabel}
            </Link>
          </Button>
        ) : null}
      </section>
      <section
        className="rounded-card border border-border bg-card p-6 shadow-card"
        aria-labelledby="provider-verification-history-title"
      >
        <h2
          id="provider-verification-history-title"
          className="text-xl font-bold"
        >
          Verification timeline
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Current and previous review decisions, document replacements, and
          permitted FEASTA remarks.
        </p>
        {verification?.history.length ? (
          <ol className="mt-5 grid gap-3">
            {verification.history.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-bold">{historyLabel(entry.eventType)}</h3>
                  <time className="text-sm text-muted-foreground">
                    {entry.createdAt}
                  </time>
                </div>
                {entry.fromStatus || entry.toStatus ? (
                  <p className="mt-2 text-sm">
                    {entry.fromStatus
                      ? historyLabel(entry.fromStatus)
                      : "Initial state"}
                    {" → "}
                    {entry.toStatus
                      ? historyLabel(entry.toStatus)
                      : "No status change"}
                  </p>
                ) : null}
                {entry.documentType ? (
                  <p className="mt-2 text-sm">
                    Document: {historyLabel(entry.documentType)}
                  </p>
                ) : null}
                {entry.remarks ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    FEASTA remarks: {entry.remarks}
                  </p>
                ) : null}
                {entry.auditLogId ? (
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    Audit reference: {entry.auditLogId}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            No structured history is available for this legacy application.
          </p>
        )}
      </section>
    </div>
  );
}

function historyLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) =>
    letter.toUpperCase()
  );
}
