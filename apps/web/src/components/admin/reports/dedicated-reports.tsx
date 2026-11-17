"use client";

import {useState} from "react";
import {COMPLAINT_STATUSES} from "@feasta/shared-types";
import {loadDedicatedReport} from "@/app/admin/reports/dedicated-actions";
import {REPORT_TITLES, type DedicatedReport, type DedicatedReportType, type ReportFilters} from "@/lib/admin/reports/dedicated-report-types";
import {exportDedicatedReport} from "@/lib/admin/reports/dedicated-report-export";
import {Select} from "@/components/ui/select";
import {Button} from "@/components/ui/button";

type Category = {code: string; name: string};
const localDay = (date: Date) => new Date(date.getTime()+8*3600000).toISOString().slice(0,10);
export function DedicatedReports({categories = [], reportType = "sales"}: {categories?: Category[]; reportType?: DedicatedReportType}) {
  const [filters, setFilters] = useState<ReportFilters>(() => ({type:reportType, startDate:localDay(new Date(Date.now()-29*86400000)),endDate:localDay(new Date()),category:"all",municipality:"all",rating:"all",complaintStatus:"all",directory:"providers",status:"all"}));
  const [report, setReport] = useState<DedicatedReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const directory = filters.type === "directory";
  const dated = filters.type === "sales" || filters.type === "demand";
  function update(patch: Partial<ReportFilters>) {setFilters((previous) => ({...previous,...patch})); setReport(null); setPage(1); setError("");}
  async function generate() {
    setBusy(true); setError(""); setReport(null);
    try {setReport(await loadDedicatedReport(filters)); setPage(1);}
    catch (cause) {setError(cause instanceof Error ? cause.message : "Report unavailable. Please try again.");}
    finally {setBusy(false);}
  }
  async function download() {
    if (!report) return;
    setBusy(true); setError("");
    try {await exportDedicatedReport(report, "pdf", `${navigator.userAgent}; language=${navigator.language}; viewport=${window.innerWidth}x${window.innerHeight}; timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}`);}
    catch {setError("PDF export failed. Please try again.");}
    finally {setBusy(false);}
  }
  return <div className="grid gap-5">
    <section className="grid gap-4 rounded-card border bg-card p-5" aria-label="Report filters">
      <h2 className="text-xl font-bold">{REPORT_TITLES[filters.type]}</h2>
      {directory && <div className="flex flex-wrap gap-2" aria-label="Directory type">{(["providers","customers"] as const).map((value) => <Button key={value} disabled={busy} aria-pressed={filters.directory===value} variant={filters.directory===value?"primary":"secondary"} onClick={() => update({directory:value,category:"all",status:"all"})}>{value==="providers"?"Registered Vendors":"Registered Customers"}</Button>)}</div>}
      <fieldset disabled={busy} className="flex min-w-0 flex-wrap items-end gap-3">
        {filters.type==="demand" && <label className="grid gap-2 text-sm">Select month<input type="month" className="h-12 rounded-xl border bg-background px-3" onChange={(event) => {
          const value=event.target.value;
          if (!/^\d{4}-\d{2}$/.test(value)) return;
          const [year,month]=value.split("-").map(Number);
          update({startDate:`${value}-01`,endDate:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)});
        }} /></label>}
        {dated && <><label className="grid gap-2 text-sm">From<input type="date" className="h-12 rounded-xl border bg-background px-3" value={filters.startDate} max={filters.endDate} onChange={(event) => update({startDate:event.target.value})} /></label><label className="grid gap-2 text-sm">To<input type="date" className="h-12 rounded-xl border bg-background px-3" value={filters.endDate} min={filters.startDate} onChange={(event) => update({endDate:event.target.value})} /></label></>}
        {filters.type!=="demand" && !(directory && filters.directory==="customers") && <label className="grid gap-2 text-sm">Service category<Select value={filters.category} onChange={(event) => update({category:event.target.value})}><option value="all">All categories</option>{categories.map((category) => <option key={category.code} value={category.code}>{category.name}</option>)}</Select></label>}
        {filters.type!=="quality" && <label className="grid gap-2 text-sm">Municipality<Select value={filters.municipality} onChange={(event) => update({municipality:event.target.value})}><option value="all">All recorded municipalities</option><option>Ormoc City</option></Select></label>}
        {filters.type==="quality" && <><label className="grid gap-2 text-sm">Rating threshold<Select value={filters.rating} onChange={(event) => update({rating:event.target.value as ReportFilters["rating"]})}><option value="all">All ratings</option><option value="below_3">Below 3.0 stars</option></Select></label><label className="grid gap-2 text-sm">Complaint status<Select value={filters.complaintStatus} onChange={(event) => update({complaintStatus:event.target.value})}><option value="all">All complaint statuses</option>{COMPLAINT_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}</Select></label></>}
        {directory && <label className="grid gap-2 text-sm">Account status<Select value={filters.status} onChange={(event) => update({status:event.target.value})}><option value="all">All statuses</option>{["Active","Inactive","Blocked",...(filters.directory==="providers"?["Suspended","Under Review","Draft","Submitted","Rejected","Resubmission Required","Deleted"]:[]),"Pending Deletion","Unknown"].map((status) => <option key={status}>{status}</option>)}</Select></label>}
        <Button onClick={() => void generate()}>{busy?"Working...":"Generate report"}</Button>
        <Button variant="secondary" disabled={!report} onClick={() => void download()}>Download PDF</Button>
      </fieldset>
    </section>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!report && !busy && !error && <p className="text-sm text-muted-foreground">Choose filters, then generate a report to preview and download it.</p>}
    {report && <section className="grid gap-4 rounded-card border bg-card p-5" aria-label="Generated report">
      <h2 className="text-xl font-bold">{report.title}</h2>
      <p className="text-sm text-muted-foreground">{report.period}</p>
      <p className="text-sm text-muted-foreground">Generated by {report.generatedBy} | {new Date(report.generatedAt).toLocaleString("en-PH", {timeZone:"Asia/Manila"})} (Philippine Standard Time, UTC+08:00)</p>
      <p className="text-sm text-muted-foreground">{report.note}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-muted"><tr>{report.headers.map((heading) => <th key={heading} scope="col" className={/PHP|Share/.test(heading) ? "p-3 text-right" : "p-3"}>{heading}</th>)}</tr></thead><tbody>{report.rows.slice((page-1)*10,page*10).map((row,index) => <tr key={index} className="border-b">{row.map((cell,column) => <td key={column} className={/PHP|Share/.test(report.headers[column]) ? "p-3 text-right tabular-nums" : "p-3"}>{cell}</td>)}</tr>)}</tbody></table></div>
      {!report.rows.length && <p role="status">No matching records.</p>}
      {!!report.summary?.length && <div className="flex flex-wrap gap-5 border-t pt-4 font-semibold">{report.summary.map((value) => <p key={value}>{value}</p>)}</div>}
      {report.rows.length>10 ? <nav aria-label="Report pages" className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Showing {(page-1)*10+1}-{Math.min(page*10,report.rows.length)} of {report.rows.length} results</span><div className="flex items-center gap-3"><Button variant="secondary" disabled={page===1 || busy} onClick={() => setPage(page-1)}>Previous</Button><span>Page {page} of {Math.ceil(report.rows.length/10)}</span><Button variant="secondary" disabled={page*10>=report.rows.length || busy} onClick={() => setPage(page+1)}>Next</Button></div></nav> : <p className="text-sm text-muted-foreground">Showing all {report.rows.length} results</p>}
    </section>}
  </div>;
}
