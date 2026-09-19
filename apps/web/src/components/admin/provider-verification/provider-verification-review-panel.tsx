"use client";

import {
  CheckCircle2,
  Download,
  ExternalLink,
  PauseCircle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useRef, useState} from "react";

import {feastaToast} from "@/components/feedback/toast";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {
  type ProviderReviewAction,
  reviewProviderVerification,
} from "@/lib/admin/provider-verification/provider-verification-client";
import type {
  ProviderVerificationReviewDetail,
} from "@/lib/admin/provider-verification/provider-verification-types";

type PendingDecision = {
  action: ProviderReviewAction;
  label: string;
  title: string;
  description: string;
  destructive: boolean;
} | null;

function ProviderVerificationReviewPanel({
  application,
}: {
  application: ProviderVerificationReviewDetail;
}) {
  const router = useRouter();
  const [remarks, setRemarks] = useState("");
  const [pendingDecision, setPendingDecision] =
    useState<PendingDecision>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decisionKeys = useRef(new Map<ProviderReviewAction, string>());

  const decide = async () => {
    if (!pendingDecision || submitting) return;
    if (
      ["reject", "require_resubmission", "suspend"].includes(
        pendingDecision.action,
      ) &&
      remarks.trim().length < 10
    ) {
      setError("Enter meaningful remarks with at least 10 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const idempotencyKey = decisionKeys.current.get(pendingDecision.action) ??
      createDecisionKey(application.id, pendingDecision.action);
    decisionKeys.current.set(pendingDecision.action, idempotencyKey);
    try {
      const result = await reviewProviderVerification({
        verificationId: application.id,
        action: pendingDecision.action,
        remarks: remarks.trim() || undefined,
        idempotencyKey,
      });
      decisionKeys.current.delete(pendingDecision.action);
      setPendingDecision(null);
      setRemarks("");
      feastaToast.success(
        result.idempotentReplay
          ? "This decision was already saved."
          : `Provider status updated to ${humanize(result.status)}.`,
      );
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error
        ? caught.message
        : "The review decision could not be saved.";
      setError(message);
      feastaToast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const requiresMeaningfulRemarks = pendingDecision != null &&
    ["reject", "require_resubmission", "suspend"].includes(
      pendingDecision.action,
    );
  const remarksValid = !requiresMeaningfulRemarks ||
    remarks.trim().length >= 10;
  const selectDecision = (decision: Exclude<PendingDecision, null>) => {
    if (
      ["reject", "require_resubmission", "suspend"].includes(
        decision.action,
      ) &&
      remarks.trim().length < 10
    ) {
      setError("Enter meaningful remarks with at least 10 characters.");
      return;
    }
    setError(null);
    setPendingDecision(decision);
  };

  return (
    <div className="grid min-w-0 gap-6">
      <section aria-labelledby="review-status-heading" className="rounded-card border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="review-status-heading" className="text-lg font-bold">
            Review status
          </h3>
          <StatusBadge status={application.status} />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="Submitted" value={application.submittedAt} />
          <Detail label="Last reviewed" value={application.reviewedAt} />
          <Detail
            label="Reviewer ID"
            value={application.reviewedBy ?? "Not assigned"}
          />
          <Detail
            label="Policy consent"
            value={[
              application.termsPolicyVersion
                ? `Terms ${application.termsPolicyVersion}`
                : "Terms version unavailable",
              application.privacyPolicyVersion
                ? `Privacy ${application.privacyPolicyVersion}`
                : "Privacy version unavailable",
            ].join(" · ")}
          />
        </dl>
        <ExistingRemarks application={application} />
      </section>

      <section aria-labelledby="owner-heading" className="rounded-card border border-border bg-card p-4 shadow-card">
        <h3 id="owner-heading" className="text-lg font-bold">
          Owner profile
        </h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Detail label="Name" value={application.owner.name} />
          <Detail label="Email" value={application.owner.email} />
          <Detail label="Phone" value={application.owner.phone} />
        </dl>
      </section>

      <section aria-labelledby="business-heading" className="rounded-card border border-border bg-card p-4 shadow-card">
        <h3 id="business-heading" className="text-lg font-bold">
          Business information
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <MediaPreview
            label="Business logo"
            path={application.media.logoUrl}
            aspect="square"
          />

          <MediaPreview
            label="Cover photo"
            path={application.media.coverImageUrl}
            aspect="wide"
          />
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Detail label="Business name" value={application.business.name} />
          <Detail label="Service type" value={application.business.serviceType} />
          <Detail label="Business email" value={application.business.email} />
          <Detail label="Business phone" value={application.business.phone} />
          <Detail
            label="Address"
            value={[
              application.business.address,
              application.business.city,
              application.business.province,
            ].join(", ")}
          />
          <Detail
            label="Description"
            value={application.business.description}
            wide
          />
        </dl>
      </section>

      <section aria-labelledby="operations-heading" className="rounded-card border border-border bg-card p-4 shadow-card">
        <h3 id="operations-heading" className="text-lg font-bold">
          Services and operations
        </h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Detail
            label="Service categories"
            value={listLabel(application.operations.serviceCategories)}
          />
          <Detail
            label="Event types"
            value={listLabel(application.operations.eventTypes)}
          />
          <Detail
            label="Coverage areas"
            value={listLabel(application.operations.serviceAreas)}
          />
          <Detail
            label="Maximum service distance"
            value={application.operations.maximumServiceDistance}
          />
          <Detail
            label="Guest capacity"
            value={application.operations.guestCapacity}
          />
          <Detail
            label="Events per day"
            value={application.operations.eventsPerDay}
          />
          <Detail label="Staff" value={application.operations.staffCount} />
          <Detail
            label="Equipment"
            value={application.operations.equipmentCount}
          />
          <Detail
            label="Operating days"
            value={listLabel(application.operations.operatingDays)}
          />
          <Detail
            label="Booking lead time"
            value={application.operations.bookingLeadTime}
          />
          <Detail
            label="Unavailable dates"
            value={listLabel(application.operations.unavailableDates)}
            wide
          />
        </dl>
      </section>

      <section aria-labelledby="documents-heading" className="rounded-card border border-border bg-card p-4 shadow-card">
        <h3 id="documents-heading" className="text-lg font-bold">
          Verification documents
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Files open through an admin-authorized, non-cacheable server route.
        </p>
        {application.documents.length === 0 ? (
          <p className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
            No verification documents are registered.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {application.documents.map((document) => (
              <li
                key={document.id}
                className="grid gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      {document.title}
                      {document.isRequired ? " (required)" : ""}
                    </p>
                    <p className="mt-1 break-all text-sm text-muted-foreground">
                      {document.fileName} · {document.fileSize} ·{" "}
                      {document.contentType}
                    </p>
                  </div>
                  <StatusBadge status={document.status} />
                </div>
                {document.reviewNote ? (
                  <p className="text-sm text-destructive">
                    Review note: {document.reviewNote}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild variant="secondary" size="compact">
                    <a
                      href={document.viewPath}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink aria-hidden="true" />
                      Securely view
                    </a>
                  </Button>
                  <Button asChild variant="secondary" size="compact">
                    <a href={document.downloadPath}>
                      <Download aria-hidden="true" />
                      Download
                    </a>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decision-heading" className="rounded-card border border-border bg-card p-4 shadow-card">
        <h3 id="decision-heading" className="text-lg font-bold">
          Administrative decision
        </h3>
        <label
          htmlFor="provider-review-remarks"
          className="mt-4 grid gap-2 text-sm font-semibold"
        >
          Admin remarks
          <Textarea
            id="provider-review-remarks"
            value={remarks}
            maxLength={2000}
            disabled={submitting}
            onChange={(event) => setRemarks(event.currentTarget.value)}
            placeholder="Add review context. Rejection, resubmission, and suspension require at least 10 characters."
          />
        </label>
        <p className="mt-2 text-sm text-muted-foreground">
          Remarks are included in the immutable audit trail and the provider
          notification when supplied.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        <DecisionActions
          status={application.status}
          disabled={submitting}
          hasDocuments={application.documents.length > 0}
          onSelect={selectDecision}
        />
      </section>

      <section
        aria-labelledby="history-heading"
        className="rounded-card border border-border bg-card p-4 shadow-card"
      >
        <h3 id="history-heading" className="text-lg font-bold">
          Verification history
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Immutable status, document, and decision events with audit references.
        </p>
        {application.history.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No structured history is available for this legacy application.
          </p>
        ) : (
          <ol className="mt-4 grid gap-3">
            {application.history.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">{humanize(entry.eventType)}</p>
                  <time className="text-sm text-muted-foreground">
                    {entry.createdAt}
                  </time>
                </div>
                {entry.fromStatus || entry.toStatus ? (
                  <p className="mt-2 text-sm">
                    {entry.fromStatus
                      ? humanize(entry.fromStatus)
                      : "Initial state"}
                    {" → "}
                    {entry.toStatus
                      ? humanize(entry.toStatus)
                      : "No status change"}
                  </p>
                ) : null}
                {entry.documentType ? (
                  <p className="mt-2 text-sm">
                    Document: {humanize(entry.documentType)}
                    {entry.documentStatus
                      ? ` · ${humanize(entry.documentStatus)}`
                      : ""}
                  </p>
                ) : null}
                {entry.remarks ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    Remarks: {entry.remarks}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  Actor: {humanize(entry.actorRole)} · {entry.actorId}
                </p>
                {entry.auditLogId !== "Unavailable" ? (
                  <Link
                    className="mt-2 inline-flex min-h-12 items-center text-sm font-semibold text-primary-strong underline underline-offset-4"
                    href={`/admin/audit-logs/${entry.auditLogId}`}
                  >
                    View audit log {entry.auditLogId}
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmationDialog
        open={pendingDecision != null}
        onOpenChange={(open) => {
          if (!open) setPendingDecision(null);
        }}
        title={pendingDecision?.title ?? "Confirm provider review"}
        description={pendingDecision?.description ?? ""}
        confirmLabel={pendingDecision?.label ?? "Confirm"}
        destructive={pendingDecision?.destructive}
        loading={submitting}
        onConfirm={decide}
      />
      {requiresMeaningfulRemarks && !remarksValid ? (
        <p role="status" className="text-sm text-warning">
          Enter at least 10 characters before confirming this action.
        </p>
      ) : null}
    </div>
  );
}

function DecisionActions({
  status,
  disabled,
  hasDocuments,
  onSelect,
}: {
  status: ProviderVerificationReviewDetail["status"];
  disabled: boolean;
  hasDocuments: boolean;
  onSelect: (decision: Exclude<PendingDecision, null>) => void;
}) {
  const actions: Exclude<PendingDecision, null>[] = status === "submitted"
    ? [{
        action: "start_review",
        label: "Start review",
        title: "Start reviewing this provider?",
        description:
          "This locks the application in under-review status until an " +
          "authorized administrator records a decision.",
        destructive: false,
      }]
    : status === "under_review"
      ? [
          {
            action: "approve",
            label: "Approve provider",
            title: "Approve this provider?",
            description:
              "The server will revalidate every required document and Storage " +
              "object before activating public-provider eligibility.",
            destructive: false,
          },
          {
            action: "require_resubmission",
            label: "Request resubmission",
            title: "Request document resubmission?",
            description:
              "The provider becomes inactive and may replace verification " +
              "documents. Meaningful remarks are required.",
            destructive: false,
          },
          {
            action: "reject",
            label: "Reject provider",
            title: "Reject this provider?",
            description:
              "The provider remains inactive. Meaningful rejection remarks " +
              "are required.",
            destructive: true,
          },
        ]
      : status === "approved"
        ? [{
            action: "suspend",
            label: "Suspend provider",
            title: "Suspend this approved provider?",
            description:
              "The provider will immediately lose public and operational " +
              "eligibility. A meaningful reason is required.",
            destructive: true,
          }]
        : [];

  if (actions.length === 0) {
    return (
      <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        No administrative transition is available from this status.
      </p>
    );
  }
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {actions.map((action) => (
        <Button
          key={action.action}
          variant={action.destructive ? "destructive" : "primary"}
          disabled={disabled || (action.action === "approve" && !hasDocuments)}
          onClick={() => onSelect(action)}
        >
          {action.action === "approve" ? <CheckCircle2 aria-hidden="true" /> : null}
          {action.action === "reject" ? <XCircle aria-hidden="true" /> : null}
          {action.action === "require_resubmission"
            ? <RotateCcw aria-hidden="true" />
            : null}
          {action.action === "suspend" ? <PauseCircle aria-hidden="true" /> : null}
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function Detail({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function MediaPreview({
  label,
  path,
  aspect,
}: {
  label: string;
  path: string | null;
  aspect: "square" | "wide";
}) {
  return (
    <figure>
      <div className={[
        "relative overflow-hidden rounded-lg border border-border bg-muted",
        aspect === "square" ? "aspect-square max-w-40" : "aspect-[16/9]",
      ].join(" ")}>
        {path ? (
          <Image
            src={path}
            alt={label}
            fill
            unoptimized
            className="object-cover"
            sizes={aspect === "square" ? "160px" : "(max-width: 640px) 100vw, 240px"}
          />
        ) : (
          <span className="grid size-full place-items-center p-4 text-center text-sm text-muted-foreground">
            No image uploaded
          </span>
        )}
      </div>
      <figcaption className="mt-2 text-sm font-semibold">{label}</figcaption>
    </figure>
  );
}

function ExistingRemarks({
  application,
}: {
  application: ProviderVerificationReviewDetail;
}) {
  const entries = [
    ["Remarks", application.remarks],
    ["Rejection reason", application.rejectionReason],
    ["Resubmission reason", application.resubmissionReason],
    ["Suspension reason", application.suspensionReason],
  ].filter((entry): entry is [string, string] => entry[1] != null);
  return entries.length > 0 ? (
    <dl className="mt-4 grid gap-3 rounded-lg bg-muted p-3">
      {entries.map(([label, value]) => (
        <Detail key={label} label={label} value={value} />
      ))}
    </dl>
  ) : null;
}

function listLabel(values: readonly string[]): string {
  return values.length > 0
    ? values.map(humanize).join(", ")
    : "Not configured";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) =>
    letter.toUpperCase()
  );
}

function createDecisionKey(
  verificationId: string,
  action: ProviderReviewAction,
): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${verificationId}:${action}:${random}`;
}

export {ProviderVerificationReviewPanel};
