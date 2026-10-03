import {PageHeading} from "@/components/layout/page-heading";

export default function AdminAuditLogsLoading() {
  return (
    <div
      className="grid min-w-0 gap-6"
      aria-busy="true"
      aria-label="Loading audit logs"
    >
      <PageHeading
        eyebrow="Security and audit"
        title="Audit Logs"
        description="Review immutable administrative, account, provider, and system activity."
      />
      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading latest audit event window"
      >
        {Array.from({length: 4}).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-card border border-border bg-card shadow-card"
          />
        ))}
      </section>
      <div className="h-52 animate-pulse rounded-card border border-border bg-card shadow-card" />
      <div className="h-96 animate-pulse rounded-card border border-border bg-card shadow-card" />
    </div>
  );
}
