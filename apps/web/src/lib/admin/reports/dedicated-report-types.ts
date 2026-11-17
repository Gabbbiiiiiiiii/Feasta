export const REPORT_TITLES = {
  sales: "Vendor Sales & Commission Report",
  quality: "Vendor Ratings & Complaints Report",
  demand: "Peak Event Types & Demand Report",
  directory: "Customer & Vendor Directory Reports",
} as const;
export type DedicatedReportType = keyof typeof REPORT_TITLES;
export type ReportFilters = {
  type: DedicatedReportType;
  startDate: string;
  endDate: string;
  category: string;
  municipality: string;
  rating: "all" | "below_3";
  complaintStatus: string;
  directory: "providers" | "customers";
  status: string;
};
export type DedicatedReport = {
  title: string;
  generatedAt: string;
  generatedBy: string;
  period: string;
  headers: string[];
  rows: (string | number)[][];
  note: string;
  summary?: string[];
};
