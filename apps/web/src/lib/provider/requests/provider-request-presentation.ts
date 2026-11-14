import type {ProviderRequestListItem} from "./provider-request-types";
export function requestStatusLabel(status: string): string {
  return ({pending: "New", accepted: "Accepted", rejected: "Declined", cancelled: "Cancelled", expired: "Expired",
    waiting_for_down_payment: "Waiting for Payment", payment_processing: "Payment being confirmed", confirmed: "Confirmed", in_progress: "Event in progress", completed: "Completed"} as Record<string, string>)[status] ?? "Status unavailable";
}
export function matchesRequestSearch(request: ProviderRequestListItem, search: string): boolean {
  const term = search.trim().toLocaleLowerCase("en-PH");
  return !term || [request.customer.name, request.bookingReference, request.id, request.mainEventId,
    request.event.eventType.replaceAll("_", " "), request.event.eventType, request.package?.name,
    ...request.services.map(service => service.name)].some(value => value?.toLocaleLowerCase("en-PH").includes(term));
}
