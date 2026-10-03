import {notFound, redirect} from "next/navigation";
import {EventCustomizationExperience} from "@/components/customer/bookings/event-customization-experience";
import {getOptionalAccountContext} from "@/lib/auth/session";
import {getPublicPackageDetail} from "@/lib/customer/discovery/package-detail-service";
import {getPublicEventServices} from "@/lib/customer/discovery/event-service-discovery-service";
import {readPublishedProviderSetups} from "@/lib/provider/provider-setup-gallery-service";
import {customerEventContextQuery, parseCustomerEventContext} from "@/lib/customer/planning/event-planning-context";

export default async function CustomerPackagePlanPage({params, searchParams}: {
  params: Promise<{packageId: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{packageId}, query, account] = await Promise.all([params, searchParams, getOptionalAccountContext()]);
  const context = parseCustomerEventContext(query);
  const contextQuery = customerEventContextQuery(context);
  if (account?.role === "customer") {
    redirect(`/customer/packages/${encodeURIComponent(packageId)}/book${contextQuery ? `?${contextQuery}` : ""}`);
  }
  const detail = await getPublicPackageDetail(packageId);
  if (!detail) notFound();
  const [services, publishedSetups] = await Promise.all([
    getPublicEventServices(detail.provider.id),
    readPublishedProviderSetups(detail.provider.id),
  ]);
  return <EventCustomizationExperience key={`${packageId}:${contextQuery}`} detail={detail}
    eventServices={services.services} initialEventContext={context} draftOwner="guest" planningOnly
    publishedSetups={publishedSetups} />;
}
