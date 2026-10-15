export type ProviderDashboardView = "new" | "upcoming" | "payment" | "completed";
export type ProviderDashboardItem = {id: string; customer: string; event: string; packageName: string | null; eventAt: string | null; status: string};
export type ProviderDashboardData = {summary: Record<ProviderDashboardView, number>; upcomingEvents: ProviderDashboardItem[]; recentRequests: ProviderDashboardItem[]};
