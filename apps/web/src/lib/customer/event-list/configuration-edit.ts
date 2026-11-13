import type {PublicPackageDetail} from "@/lib/customer/discovery/marketplace-types";
import type {CustomizationDraft} from "@/lib/customer/bookings/customization-draft";
import type {CustomerEventListConfiguration, CustomerPackageEventListItem} from "./customer-event-list";

export function eventListConfigurationDraft(config: CustomerEventListConfiguration): CustomizationDraft {
  return {
    event: {...config.event, guestCount: String(config.event.guestCount)},
    customization: {selectedFoods: [...config.selectedFoods], selectedDecorations: [...config.selectedDecorations],
      selectedFurniture: [...config.selectedFurniture], foodChoiceSelections: config.foodChoiceSelections?.map(row =>
        ({groupId: row.groupId, optionIds: [...row.optionIds]})) ?? []},
    addonIds: config.selectedEventServices.map(service => service.id),
    serviceTier: config.serviceTier, packageThemeId: config.packageThemeId,
    themeInspiration: config.themeInspiration, ownAddons: config.willArrangeOwnAddOns,
    ownAddonsNote: config.customerArrangedAddOnsNote,
  };
}

export function eventListPackageEditHref(item: CustomerPackageEventListItem): string {
  const path = `/customer/packages/${encodeURIComponent(item.packageId)}/plan`;
  return item.configuration ? `${path}?${new URLSearchParams({eventListProvider: item.providerId})}` : path;
}

export function configurationOptionLabels(config: CustomerEventListConfiguration, detail: PublicPackageDetail | null) {
  const groups = detail?.packageRecord.foodChoiceGroups ?? [];
  return {
    foods: [...config.selectedFoods, ...(config.foodChoiceSelections ?? []).flatMap(row => row.optionIds.map(id =>
      groups.find(group => group.id === row.groupId)?.options.find(option => option.id === id)?.name ?? "Saved dish currently unavailable"))],
    theme: config.packageThemeId ? detail?.packageRecord.themeOptions?.find(theme => theme.id === config.packageThemeId)?.name
      ?? "Saved theme currently unavailable" : null,
  };
}
