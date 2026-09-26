import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {notFound} from "next/navigation";

import {PageHeading} from "@/components/layout/page-heading";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {getAdminAuditLogDetail} from "@/lib/admin/audit-logs/admin-audit-log-service";
import type {AdminAuditLogPreviewField} from "@/lib/admin/audit-logs/admin-audit-log-types";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminAuditLogPage({
  params,
}: {
  params: Promise<{auditLogId: string}>;
}) {
  await requireAdmin();
  const {auditLogId} = await params;
  const auditLog = await getAdminAuditLogDetail(auditLogId);
  if (!auditLog) notFound();

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Security and audit"
        title="Audit log detail"
        description="Immutable structured evidence for an administrative or provider lifecycle event."
      />
      <Button asChild variant="secondary" size="compact" className="w-fit">
        <Link href="/admin/audit-logs">
          <ArrowLeft aria-hidden="true" />
          Back to audit logs
        </Link>
      </Button>
      <section
        className="rounded-card border border-border bg-card p-6 shadow-card"
        aria-labelledby="audit-summary-heading"
      >
        <h2 id="audit-summary-heading" className="text-xl font-bold">
          Event summary
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="info">{humanize(auditLog.action)}</Badge>
          {auditLog.outcome ? (
            <Badge tone={outcomeTone(auditLog.outcome)}>
              {humanize(auditLog.outcome)}
            </Badge>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <AuditField label="Audit ID" value={auditLog.id} />
          <AuditField
            label="Timestamp"
            value={formatDate(auditLog.createdAt)}
          />
          <AuditField label="Action" value={humanize(auditLog.action)} />
          <AuditField
            label="Actor role"
            value={humanize(auditLog.actorRole)}
          />
          <AuditField label="Actor ID" value={auditLog.actorId} />
          <AuditField
            label="Target"
            value={`${auditLog.targetCollection}/${auditLog.targetId}`}
          />
          <AuditField label="Source" value={humanize(auditLog.source)} />
          <AuditField
            label="Correlation ID"
            value={auditLog.correlationId ?? "Not recorded"}
          />
          <AuditField
            label="Reason code"
            value={
              auditLog.reasonCode
                ? humanize(auditLog.reasonCode)
                : "Not recorded"
            }
          />
          <AuditField label="Summary" value={auditLog.summary} wide />
          {auditLog.description ? (
            <AuditField
              label="Description"
              value={auditLog.description}
              wide
            />
          ) : null}
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <PreviewSection title="Before" fields={auditLog.beforePreview} />
        <PreviewSection title="After" fields={auditLog.afterPreview} />
        <PreviewSection title="Metadata" fields={auditLog.metadataPreview} />
      </div>
    </div>
  );
}

function AuditField({
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

function PreviewSection({
  title,
  fields,
}: {
  title: string;
  fields: AdminAuditLogPreviewField[];
}) {
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">{title}</h2>
      {fields.length > 0 ? (
        <dl className="mt-4 divide-y divide-border">
          {fields.map((field) => (
            <div key={field.key} className="grid gap-1 py-3">
              <dt className="break-words text-sm font-semibold text-muted-foreground">
                {humanize(field.key)}
              </dt>
              <dd className="break-words text-sm">
                {field.redacted
                  ? "Sensitive value redacted"
                  : field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No safe preview is available.
        </p>
      )}
    </section>
  );
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

function outcomeTone(
  outcome: string,
): "success" | "destructive" | "warning" | "neutral" {
  const normalized = outcome.toLocaleLowerCase("en-PH");
  if (
    ["success", "succeeded", "successful", "completed"].includes(normalized)
  ) {
    return "success";
  }
  if (["failed", "failure", "error", "denied"].includes(normalized)) {
    return "destructive";
  }
  if (normalized === "rejected") return "warning";
  return "neutral";
}
