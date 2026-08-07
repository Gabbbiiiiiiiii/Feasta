import {PageHeading} from "@/components/layout/page-heading";

export default function CustomerProvidersLoading() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true" aria-label="Loading providers">
      <PageHeading eyebrow="Discovery" title="Find event providers" description="Loading approved FEASTA providers." />
      <div className="h-56 animate-pulse rounded-card border border-border bg-card shadow-card motion-reduce:animate-none" />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading provider results">
        {Array.from({length: 6}, (_, index) => <div key={index} className="h-96 animate-pulse rounded-card border border-border bg-card shadow-card motion-reduce:animate-none" />)}
      </section>
    </div>
  );
}
