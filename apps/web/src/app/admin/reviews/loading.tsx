import {SummaryCard} from "@/components/data/summary-card";
import {
  TableLoadingSkeleton,
} from "@/components/feedback/application-states";
import {LoadingSkeleton} from "@/components/feedback/loading";
import {PageHeading} from "@/components/layout/page-heading";

export default function AdminReviewsLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Review Management"
        description="Monitor verified customer feedback, provider replies, reports, and moderation decisions."
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Loading review statistics"
      >
        <SummaryCard label="Total Reviews" loading />
        <SummaryCard label="Published" loading />
        <SummaryCard label="Reported" loading />
        <SummaryCard label="Hidden" loading />
        <SummaryCard label="Average Rating" loading />
      </section>

      <LoadingSkeleton
        className="h-52 w-full rounded-card"
        label="Loading review filters"
      />

      <TableLoadingSkeleton caption="Loading review moderation records" />
    </div>
  );
}