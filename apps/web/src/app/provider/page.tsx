import {ClipboardCheck, PackageOpen, WalletCards} from "lucide-react";
import Link from "next/link";

import {ChartContainer, SummaryCard} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {requireRole} from "@/lib/auth/session";

export default async function ProviderPage() {
  await requireRole(["provider"]);
  return (
    <div className="grid gap-6">
      <PageHeading eyebrow="Provider overview" title="Business dashboard" description="Monitor your FEASTA business using bounded, server-provided reporting data." actions={<Button asChild variant="secondary"><Link href="/provider/verification">View verification</Link></Button>} />
      <div className="flex flex-wrap items-center gap-2" aria-label="Provider status"><span className="font-semibold">Verification:</span><StatusBadge status="draft" /></div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Business summary">
        <SummaryCard label="Active requests" value="—" icon={<ClipboardCheck className="size-6" />} />
        <SummaryCard label="Published packages" value="—" icon={<PackageOpen className="size-6" />} />
        <SummaryCard label="Available balance" value="—" icon={<WalletCards className="size-6" />} />
      </section>
      <ChartContainer title="Booking activity" description="Confirmed bookings for the selected server-provided reporting range." empty fallbackSummary="No booking activity is available for this reporting range." />
    </div>
  );
}
