import {PageHeading} from "@/components/layout/page-heading";

export default function CustomerMessagesLoading() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true">
      <PageHeading
        eyebrow="Your events"
        title="Messages"
        description="Communicate with providers connected to your FEASTA events."
      />
      <p className="sr-only" role="status">Loading customer messages</p>
      <div
        aria-hidden="true"
        className="grid min-h-[36rem] overflow-hidden rounded-card border border-border bg-card shadow-card lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]"
      >
        <div className="animate-pulse border-b border-border p-5 motion-reduce:animate-none lg:border-b-0 lg:border-r">
          <div className="h-6 w-40 rounded bg-muted" />
          <div className="mt-6 grid gap-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-24 rounded-xl bg-muted" />
            ))}
          </div>
        </div>
        <div className="animate-pulse p-6 motion-reduce:animate-none">
          <div className="h-14 rounded-xl bg-muted" />
          <div className="mt-8 h-80 rounded-xl bg-muted" />
          <div className="mt-6 h-20 rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
