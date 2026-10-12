import {SummaryCard} from "@/components/data";
import {ListLoadingSkeleton} from "@/components/feedback/application-states";
import {PageHeading} from "@/components/layout/page-heading";
export default function ProviderDashboardLoading() {
  return <div className="grid min-w-0 gap-6" aria-busy="true" aria-label="Loading provider dashboard">
    <PageHeading title="Dashboard" description="Your booking requests and upcoming events at a glance." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{["New Requests", "Upcoming Events", "Waiting for Payment", "Completed Events"].map(label => <SummaryCard key={label} label={label} loading />)}</div>
    <div className="grid gap-6 lg:grid-cols-2"><ListLoadingSkeleton count={3} /><ListLoadingSkeleton count={3} /></div>
  </div>;
}
