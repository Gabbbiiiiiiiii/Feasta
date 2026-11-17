import type {PlanningEntry, RecordValue} from "../../../../../../functions/src/customer-event-lists/contract";
import type {CustomerEventListItem, CustomerEventListService} from "./customer-event-list";
import {toWebItem} from "./customer-event-list-cloud-contract";

/** Display-only adapter. The canonical entry is retained separately for commands;
 * this result must never be passed to a save or booking operation. */
export function presentCloudDrawerEntry(entry: PlanningEntry) {
  const projection = toWebItem(entry);
  const services: CustomerEventListService[] = Array.isArray(entry.configuration?.selectedEventServices)
    ? entry.configuration.selectedEventServices.map(row => {
        const service = row as RecordValue;
        return {id: String(service.id), providerId: String(service.providerId),
          providerName: String(service.providerName), name: String(service.name),
          category: typeof service.category === "string" ? service.category : null,
          price: typeof service.price === "number" ? service.price : null};
      }) : [];
  if (projection.status === "supported") return {item: projection.item, services, readOnly: false, canonical: entry};
  const base = {providerId: entry.providerId, providerName: String(entry.providerName),
    price: typeof entry.estimatedPrice === "number" ? entry.estimatedPrice : null,
    imageUrl: typeof entry.imageUrl === "string" ? entry.imageUrl : null};
  const href = typeof entry.href === "string" ? entry.href : "/customer/event-list/review";
  const menu = entry.menu as RecordValue | null;
  const item: CustomerEventListItem = entry.kind === "custom_menu" && menu ? {
    ...base, type: "custom_menu", key: String(menu.key), menuItemId: entry.selectionId,
    menuItemName: String(entry.name), servingOptionId: String(entry.variantId),
    servingOptionName: String(menu.servingOptionName), servingDescription: String(menu.servingDescription),
    servingMinimumGuests: Number(menu.servingMinimumGuests), servingMaximumGuests: Number(menu.servingMaximumGuests),
    price: Number(entry.estimatedPrice), imageUrl: base.imageUrl ?? "", providerHref: href,
  } : {...base, type: "package", packageId: entry.selectionId, packageName: String(entry.name), packageHref: href};
  return {item, services, readOnly: true, canonical: entry};
}
