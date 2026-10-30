import {TableLoadingSkeleton} from "@/components/feedback/application-states";
import {PageHeading} from "@/components/layout/page-heading";
export default function ProviderRequestsLoading() {
  return <div className="grid min-w-0 gap-6" aria-busy="true"><PageHeading title="Booking Requests" description="Review and respond to customer booking requests." /><TableLoadingSkeleton caption="Booking request results" /></div>;
}
