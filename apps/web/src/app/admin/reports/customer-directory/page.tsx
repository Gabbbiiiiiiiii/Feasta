import Link from "next/link";

import {CustomerDirectoryPrintButton} from "@/components/admin/reports/customer-directory-print-button";
import {PageHeading} from "@/components/layout/page-heading";
import {Button, buttonVariants} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {customerDirectoryStatuses, getCustomerDirectoryReport} from "@/lib/admin/reports/customer-directory-report";

export default async function CustomerDirectoryPage({searchParams}: {
  searchParams: Promise<{municipality?: string | string[]; status?: string | string[]}>;
}) {
  const params = await searchParams;
  const municipality = typeof params.municipality === "string"
    ? params.municipality.trim().slice(0, 150).toLowerCase()
    : "";
  const status = customerDirectoryStatuses.find((value) => value === params.status);
  const report = await getCustomerDirectoryReport({municipality, status});

  return (
    <div className="grid min-w-0 gap-6" data-admin-report>
      <PageHeading title="Customer Directory" eyebrow="Administration"
        description="Booking totals include submitted events and later cancellations. Drafts are excluded."
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link href="/admin/reports" className={buttonVariants({variant: "secondary"})}>Back to Reports</Link>
            <CustomerDirectoryPrintButton />
          </div>
        } />
      <form method="get" className="flex flex-wrap items-end gap-4 print:hidden" aria-label="Customer directory filters">
        <label className="grid gap-2 text-sm font-semibold">
          Municipality
          <Select name="municipality" defaultValue={municipality}>
            <option value="">All municipalities</option>
            {municipality && !report.municipalities.some(([key]) => key === municipality) && (
              <option value={municipality}>Selected municipality unavailable</option>
            )}
            {report.municipalities.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Account status
          <Select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {customerDirectoryStatuses.map((value) => <option key={value}>{value}</option>)}
          </Select>
        </label>
        <Button type="submit">Apply filters</Button>
      </form>
      <section aria-label="Registered customers" className="grid min-w-0 gap-3">
        <p className="text-sm text-muted-foreground">{report.rows.length.toLocaleString("en-PH")} matching customer accounts</p>
        {report.rows.length ? (
          <div className="overflow-x-auto rounded-card border border-border print:overflow-visible">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {["Full name", "Email / Phone number", "Municipality", "Total bookings made", "Date joined", "Status"].map((label) => (
                    <th key={label} scope="col" className="p-3">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={index} className="border-t border-border">
                    <th scope="row" className="p-3 font-semibold">{row.name}</th>
                    <td className="p-3">{row.email}<br />{row.phone}</td>
                    <td className="p-3">{row.municipality}</td>
                    <td className="p-3 tabular-nums">{row.bookings}</td>
                    <td className="whitespace-nowrap p-3">{row.joined}</td>
                    <td className="p-3">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p role="status">No matching customers.</p>}
      </section>
    </div>
  );
}
