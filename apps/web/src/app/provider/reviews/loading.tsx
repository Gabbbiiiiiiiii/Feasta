import {PageHeading} from "@/components/layout/page-heading";

export default function ProviderReviewsLoading() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true">
      <PageHeading
        eyebrow="Customer feedback"
        title="Reviews"
        description="View customer feedback and ratings from completed FEASTA events."
      />

      <p className="sr-only" role="status">Loading provider reviews</p>

      <section
        className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]"
        aria-hidden="true"
      >
        {["Average rating", "Rating distribution"].map((label) => (
          <div
            key={label}
            className="min-h-52 animate-pulse rounded-card border border-border bg-card p-6 shadow-card motion-reduce:animate-none"
          >
            <div className="h-4 w-36 rounded bg-muted" />
            <div className="mt-5 h-24 w-full rounded bg-muted" />
          </div>
        ))}
      </section>

      <section
        className="min-h-80 animate-pulse rounded-card border border-border bg-card p-5 shadow-card motion-reduce:animate-none"
        aria-hidden="true"
      >
        <div className="h-10 w-full rounded bg-muted" />
        <div className="mt-4 h-60 w-full rounded bg-muted" />
      </section>
    </div>
  );
}
