"use server";
import {getProviderRequestDetail, getProviderRequestPage} from "@/lib/provider/requests/provider-request-service";
import type {ProviderRequestFilters} from "@/lib/provider/requests/provider-request-types";
export async function loadProviderRequestsAction(filters: ProviderRequestFilters) {
  return getProviderRequestPage(filters);
}
export async function loadProviderRequestDetailAction(requestId: string) {
  return getProviderRequestDetail(requestId);
}
