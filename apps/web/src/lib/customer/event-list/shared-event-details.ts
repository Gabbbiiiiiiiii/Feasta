import type {CustomerEventListItem, CustomerEventListConfiguration} from "./customer-event-list";

/** Event fields only; saved snapshots never authorize availability. */
export function sharedEventDetails(event: CustomerEventListConfiguration["event"]) {
  const {eventType, eventDate, eventTime, eventEndTime, guestCount, eventLocation, eventAddress} = event;
  return {eventType, eventDate, eventTime, eventEndTime, guestCount, eventLocation, eventAddress};
}

export function sharedEventCandidates(items: readonly CustomerEventListItem[], providerId: string) {
  const seen = new Set<string>();
  return items.flatMap(item => {
    if (item.type === "custom_menu" || item.providerId === providerId || !item.configuration) return [];
    const event = sharedEventDetails(item.configuration.event);
    const signature = JSON.stringify(event);
    if (seen.has(signature)) return [];
    seen.add(signature);
    return [{event, signature, providerName: item.providerName}];
  });
}

export function compatibleSharedEvent(event: ReturnType<typeof sharedEventDetails>, options: {
  eventTypes: readonly (string | null | undefined)[]; minimum?: number | null; maximum?: number | null; earliestDate: string;
}) {
  return {
    ...(options.eventTypes.includes(event.eventType) ? {eventType: event.eventType} : {}),
    ...(event.eventDate >= options.earliestDate ? {eventDate: event.eventDate, eventTime: event.eventTime, eventEndTime: event.eventEndTime} : {}),
    ...(event.guestCount >= (options.minimum ?? 1) && event.guestCount <= (options.maximum ?? 10000) ? {guestCount: String(event.guestCount)} : {}),
    eventLocation: event.eventLocation, eventAddress: event.eventAddress,
  };
}
