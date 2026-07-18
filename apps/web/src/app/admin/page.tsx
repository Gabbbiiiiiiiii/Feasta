import {ClipboardList, ShieldCheck, Store, Users} from "lucide-react";
import Link from "next/link";

import {ChartContainer, SummaryCard} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {requireRole} from "@/lib/auth/session";

export default async function AdminPage() {
  await requireRole(["admin"]);
  return (
    <div className="grid gap-6">
      <PageHeading eyebrow="Administration" title="Platform overview" description="Review FEASTA operational activity from trusted, server-authorized data sources." actions={<Button asChild><Link href="/admin/providers"><ShieldCheck aria-hidden="true" />Review providers</Link></Button>} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform summary">
        <SummaryCard label="Customers" value="—" icon={<Users className="size-6" />} />
        <SummaryCard label="Providers" value="—" icon={<Store className="size-6" />} />
        <SummaryCard label="Verification queue" value="—" icon={<ShieldCheck className="size-6" />} />
        <SummaryCard label="Open complaints" value="—" icon={<ClipboardList className="size-6" />} />
      </section>
      <ChartContainer title="Platform activity" description="Operational activity for the selected server-provided reporting range." empty fallbackSummary="No platform activity is available for this reporting range." />
    </div>
  );
}
