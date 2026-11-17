import {notFound} from "next/navigation";
import {requireAdmin} from "@/lib/auth/session";
import {DedicatedReports} from "@/components/admin/reports/dedicated-reports";
import {getServiceCategoryOptions} from "@/lib/service-categories/service-category-service";
import {REPORT_TITLES, type DedicatedReportType} from "@/lib/admin/reports/dedicated-report-types";

export default async function AdminReportModulePage({params}: {params: Promise<{report: string}>}) {
  await requireAdmin();
  const {report} = await params;
  if (!Object.hasOwn(REPORT_TITLES,report)) notFound();
  const type = report as DedicatedReportType;
  const categories = await getServiceCategoryOptions();
  return <div className="grid gap-6">
    <div><h1 className="text-3xl font-bold">{REPORT_TITLES[type]}</h1><p className="mt-2 text-muted-foreground">Choose filters to preview results and download a PDF.</p></div>
    <DedicatedReports key={type} reportType={type} categories={categories.map(({code,name}) => ({code,name}))} />
  </div>;
}
