import {CalendarCheck2, ClipboardCheck, CircleDollarSign, CheckCircle2} from "lucide-react";
import Link from "next/link";
import {LimitedProviderDashboard} from "@/components/provider/limited-provider-dashboard";
import {SummaryCard} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {requireProvider, requireProviderIdentityAccess} from "@/lib/auth/session";
import {getProviderDashboardData} from "@/lib/provider/dashboard/provider-dashboard-service";
import {getLimitedProviderDashboardData} from "@/lib/provider/dashboard/limited-provider-dashboard-service";
import type {ProviderDashboardItem} from "@/lib/provider/dashboard/provider-dashboard-types";

export default async function ProviderPage() {
  const account = requireProviderIdentityAccess(await requireProvider());
  if (!account.emailVerified) return <LimitedProviderDashboard dashboard={await getLimitedProviderDashboardData()} />;
  const dashboard = await getProviderDashboardData();
  const cards = [
    {key: "new", label: "New Requests", href: "/provider/requests?dashboard=new", icon: ClipboardCheck},
    {key: "upcoming", label: "Upcoming Events", href: "/provider/bookings?status=upcoming&dashboard=upcoming", icon: CalendarCheck2},
    {key: "payment", label: "Waiting for Payment", href: "/provider/bookings?status=accepted&dashboard=payment", icon: CircleDollarSign},
    {key: "completed", label: "Completed Events", href: "/provider/bookings?status=completed&dashboard=completed", icon: CheckCircle2},
  ] as const;
  return <div className="grid min-w-0 gap-6">
    <PageHeading title="Dashboard" description="Your booking requests and upcoming events at a glance." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Booking overview">
      {cards.map(({key, label, href, icon: Icon}) => <Link key={key} href={href} className="rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <SummaryCard label={label} value={dashboard.summary[key]} icon={<Icon className="size-5" aria-hidden="true" />} />
      </Link>)}
    </section>
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <DashboardList title="Upcoming Events" items={dashboard.upcomingEvents} empty="No upcoming events" description="Confirmed future events will appear here." bookings />
      <DashboardList title="Recent Booking Requests" items={dashboard.recentRequests} empty="No booking requests yet" description="New requests and their latest status will appear here." />
    </div>
  </div>;
}
function DashboardList({title, items, empty, description, bookings = false}: {
  title: string; items: ProviderDashboardItem[]; empty: string; description: string; bookings?: boolean;
}) {
  return <section className="min-w-0 rounded-card border border-border bg-card p-4 shadow-card sm:p-5" aria-label={title}>
    <h2 className="text-xl font-bold">{title}</h2>
    {items.length === 0 ? <div className="py-8 text-sm"><p className="font-semibold">{empty}</p><p className="mt-2 text-muted-foreground">{description}</p></div> :
      <ul className="mt-4 divide-y divide-border">{items.map(item => <li key={item.id}>
        <Link href={`/provider/${bookings ? "bookings" : "requests"}?request=${encodeURIComponent(item.id)}`} className="grid gap-2 rounded-lg py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex flex-wrap items-start justify-between gap-2"><span className="min-w-0 break-words font-semibold">{item.customer}</span><StatusBadge status={item.status} label={item.status === "pending" ? "New request" : item.status === "rejected" ? "Declined" : undefined} /></div>
          <span className="break-words text-sm capitalize">{item.event}{item.packageName ? ` / ${item.packageName}` : ""}</span>
          <span className="text-sm text-muted-foreground">{item.eventAt ? new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"}).format(new Date(item.eventAt)) : "Event date not available"}</span>
        </Link>
      </li>)}</ul>}
  </section>;
}
