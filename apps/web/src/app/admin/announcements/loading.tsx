import {SummaryCard} from "@/components/data/summary-card";
import {TableLoadingSkeleton} from "@/components/feedback/application-states";
import {LoadingSkeleton} from "@/components/feedback/loading";
import {PageHeading} from "@/components/layout/page-heading";

export default function AdminAnnouncementsLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Announcements"
        description="Create, review, publish, and archive official FEASTA announcements."
      />
      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading announcement statistics"
      >
        <SummaryCard label="All announcements" loading />
        <SummaryCard label="Drafts" loading />
        <SummaryCard label="Published" loading />
        <SummaryCard label="Archived" loading />
      </section>
      <LoadingSkeleton
        className="h-44 w-full rounded-card"
        label="Loading announcement filters"
      />
      <TableLoadingSkeleton caption="Loading announcements" />
    </div>
  );
}
