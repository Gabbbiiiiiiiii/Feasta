import {PageHeading} from "@/components/layout/page-heading";

export default function ProviderBusinessProfileLoading() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true">
      <PageHeading
        eyebrow="Business"
        title="Business Profile"
        description="Manage the public business information customers use when evaluating your services."
      />
      <p className="sr-only" role="status">Loading business profile</p>
      <div className="grid min-w-0 gap-6" aria-hidden="true">
        <div className="min-h-72 animate-pulse rounded-card border border-border bg-muted shadow-card motion-reduce:animate-none" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-h-56 animate-pulse rounded-card border border-border bg-card shadow-card motion-reduce:animate-none" />
          <div className="min-h-56 animate-pulse rounded-card border border-border bg-card shadow-card motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
