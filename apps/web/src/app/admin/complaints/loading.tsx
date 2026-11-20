import {
  PageHeading,
} from "@/components/layout/page-heading";

export default function AdminComplaintsLoading() {
  return (
    <div
      className="grid min-w-0 gap-6"
      aria-busy="true"
      aria-label="Loading complaints"
    >
      <PageHeading
        eyebrow="Administration"
        title="Complaints"
        description="Review, investigate, resolve, and audit customer and provider complaints."
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading complaint statistics"
      >
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-card border border-border bg-card shadow-card"
          />
        ))}
      </section>

      <div className="h-40 animate-pulse rounded-card border border-border bg-card shadow-card" />

      <div className="h-96 animate-pulse rounded-card border border-border bg-card shadow-card" />
    </div>
  );
}