import {getProviderRequestPage, getProviderRequestDetail, normalizeRequestFilters} from "@/lib/provider/requests/provider-request-service";
import {ProviderRequestsClient} from "./provider-requests-client";
export default async function ProviderRequestsPage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const values = await searchParams;
  const filters = normalizeRequestFilters({status: values.dashboard === "new" ? "new" : typeof values.status === "string" ? values.status as "all" : "all", search: typeof values.search === "string" ? values.search : ""});
  const [page, detail] = await Promise.all([getProviderRequestPage(filters), typeof values.request === "string" ? getProviderRequestDetail(values.request) : Promise.resolve(null)]);
  return <ProviderRequestsClient key={`${filters.status}:${filters.search}:${typeof values.request === "string" ? values.request : "list"}`}
    initialPage={page} initialFilters={filters} initialDetail={detail} initialRequestId={typeof values.request === "string" ? values.request : undefined} />;
}
