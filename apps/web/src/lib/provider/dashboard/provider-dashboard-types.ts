export type ProviderDashboardActivityPoint = {
  date: string;
  label: string;
  confirmed: number;
};

export type ProviderDashboardSummary = {
  activeRequests: number;
  publishedPackages: number;
  confirmedEvents: number;
};

export type ProviderDashboardData = {
  summary: ProviderDashboardSummary;
  bookingActivity: ProviderDashboardActivityPoint[];
};