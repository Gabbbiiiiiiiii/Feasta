import {notFound} from "next/navigation";

import {PageHeading} from "@/components/layout/page-heading";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const safeId = /^[A-Za-z0-9_-]{1,150}$/u;

export default async function AdminAuditLogPage({
  params,
}: {
  params: Promise<{auditLogId: string}>;
}) {
  await requireAdmin();
  const {auditLogId} = await params;
  if (!safeId.test(auditLogId)) notFound();
  const snapshot = await adminDb.collection("adminLogs").doc(auditLogId).get();
  if (!snapshot.exists) notFound();
  const data = snapshot.data() ?? {};

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Security and audit"
        title="Audit log detail"
        description="Immutable structured evidence for an administrative or provider lifecycle event."
      />
      <section
        className="rounded-card border border-border bg-card p-6 shadow-card"
        aria-labelledby="audit-summary-heading"
      >
        <h2 id="audit-summary-heading" className="text-xl font-bold">
          Event summary
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <AuditField label="Audit ID" value={snapshot.id} />
          <AuditField label="Action" value={stringValue(data.action)} />
          <AuditField label="Actor role" value={stringValue(data.actorRole)} />
          <AuditField label="Actor ID" value={stringValue(data.actorId)} />
          <AuditField
            label="Target"
            value={`${stringValue(data.targetCollection)}/${stringValue(data.targetId)}`}
          />
          <AuditField label="Source" value={stringValue(data.source)} />
          <AuditField label="Reason" value={stringValue(data.reason)} wide />
        </dl>
      </section>
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
      <dd className="mt-1 break-all">{value}</dd>
    </div>
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value
    : "Not recorded";
}
