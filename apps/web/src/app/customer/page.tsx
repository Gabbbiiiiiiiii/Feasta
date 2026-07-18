import {CalendarDays, Search, WalletCards} from "lucide-react";
import Link from "next/link";

import {SummaryCard} from "@/components/data";
import {ApplicationEmptyState} from "@/components/feedback/application-states";
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {requireRole} from "@/lib/auth/session";

export default async function CustomerPage() {
  const user = await requireRole(["customer"]);
  return (
    <div className="grid gap-6">
      <PageHeading eyebrow="Customer overview" title="Plan your next event" description={`Welcome back${user.email ? `, ${user.email}` : ""}. Discover providers and keep track of your event activity.`} actions={<Button asChild><Link href="/customer/providers"><Search aria-hidden="true" />Find providers</Link></Button>} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Account summary">
        <SummaryCard label="Upcoming bookings" value="—" icon={<CalendarDays className="size-6" />} />
        <SummaryCard label="Saved providers" value="—" icon={<Search className="size-6" />} />
        <SummaryCard label="Pending payments" value="—" icon={<WalletCards className="size-6" />} />
      </section>
      <section className="rounded-card border border-border bg-card shadow-card" aria-labelledby="recent-bookings-title">
        <h2 id="recent-bookings-title" className="px-6 pt-6 text-xl font-bold">Recent bookings</h2>
        <ApplicationEmptyState kind="bookings" />
      </section>
    </div>
  );
}
