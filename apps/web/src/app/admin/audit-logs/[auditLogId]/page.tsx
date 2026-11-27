import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {notFound} from "next/navigation";

import {
  DetailFieldItem,
  DetailFieldList,
} from "@/components/data/detail-field-list";
import {PageHeading} from "@/components/layout/page-heading";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
  classifyAuditCategory,
  formatAuditAction,
  formatAuditCategory,
  formatAuditRecordType,
} from "@/lib/admin/audit-logs/admin-audit-log-normalization";
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

  const previewSections = [
    {title: "Before", fields: auditLog.beforePreview},
    {title: "After", fields: auditLog.afterPreview},
    {title: "Additional details", fields: auditLog.metadataPreview},
  ].filter((section) => section.fields.length > 0);

  const category =
    auditLog.category ??
    classifyAuditCategory({
      action: auditLog.action,
      actorRole: auditLog.actorRole,
      targetCollection: auditLog.targetCollection,
    });

  const actorDisplay = auditLog.actorName
    ? `${auditLog.actorName} (${humanize(auditLog.actorRole)})`
    : humanize(auditLog.actorRole);

  const showSeparateDescription =
    Boolean(auditLog.description) &&
    auditLog.description !== auditLog.summary;

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Activity details"
        description="Review who performed this activity and what changed."
      />
      <Button asChild variant="secondary" size="compact" className="w-fit">
        <Link href="/admin/audit-logs">
          <ArrowLeft aria-hidden="true" />
          Back to activity logs
        </Link>
      </Button>
      <section
        className="rounded-card border border-border bg-card p-6 shadow-card"
        aria-labelledby="audit-summary-heading"
      >
        <h2 id="audit-summary-heading" className="text-xl font-bold">
          {formatAuditAction(auditLog.action)}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="info">{formatAuditCategory(category)}</Badge>
          <Badge tone="neutral">{humanize(auditLog.actorRole)}</Badge>
          {auditLog.outcome ? (
            <Badge tone={outcomeTone(auditLog.outcome)}>
              {humanize(auditLog.outcome)}
            </Badge>
          ) : null}
        </div>
        <DetailFieldList className="mt-4">
          <AuditField
            label="Date and time"
            value={formatDate(auditLog.createdAt)}
          />
          <AuditField label="Action" value={formatAuditAction(auditLog.action)} />
          <AuditField
            label="Performed by"
            value={actorDisplay}
          />
          <AuditField
            label="Affected record"
            value={formatAuditRecordType(auditLog.targetCollection)}
          />
          {auditLog.outcome ? (
            <AuditField
              label="Result"
              value={humanize(auditLog.outcome)}
            />
          ) : null}
          <AuditField label="Summary" value={auditLog.summary} wide />
          {showSeparateDescription && auditLog.description ? (
            <AuditField
              label="Description"
              value={auditLog.description}
              wide
            />
          ) : null}
        </DetailFieldList>
        <details className="mt-6 rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-semibold">Technical references</summary>
          <DetailFieldList className="mt-4">
            <AuditField label="Actor ID" value={auditLog.actorId} />
            <AuditField
              label="Target record"
              value={`${formatAuditRecordType(auditLog.targetCollection)} / ${auditLog.targetId}`}
            />
            {auditLog.source !== "Not recorded" ? (
              <AuditField label="Source" value={humanize(auditLog.source)} />
            ) : null}
            {auditLog.correlationId ? (
              <AuditField
                label="Correlation ID"
                value={auditLog.correlationId}
              />
            ) : null}
            {auditLog.reasonCode ? (
              <AuditField
                label="Reason code"
                value={humanize(auditLog.reasonCode)}
              />
            ) : null}
          </DetailFieldList>
        </details>
      </section>

      {previewSections.length > 0 ? (
        <div
          className={
            previewSections.length === 1
              ? "grid gap-6"
              : previewSections.length === 2
                ? "grid gap-6 xl:grid-cols-2"
                : "grid gap-6 xl:grid-cols-3"
          }
        >
          {previewSections.map((section) => (
            <PreviewSection
              key={section.title}
              title={section.title}
              fields={section.fields}
            />
          ))}
        </div>
      ) : null}
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
  return <DetailFieldItem label={label} value={value} wide={wide} />;
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
        <DetailFieldList columns={1} className="mt-4">
          {fields.map((field) => (
            <DetailFieldItem
              key={field.key}
              label={humanize(field.key)}
              value={
                field.redacted
                  ? "Sensitive value redacted"
                  : formatPreviewValue(field.value)
              }
              muted={field.redacted ? true : undefined}
            />
          ))}
        </DetailFieldList>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No safe preview is available.
        </p>
      )}
    </section>
  );
}

function formatPreviewValue(value: string): string {
  if (value === "true") return "Yes";
  if (value === "false") return "No";
  if (value === "null") return "None";
  return value;
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
