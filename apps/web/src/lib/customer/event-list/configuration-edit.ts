import type {PublicPackageDetail} from "@/lib/customer/discovery/marketplace-types";
import type {CustomizationDraft} from "@/lib/customer/bookings/customization-draft";
import type {CustomerEventListConfiguration, CustomerPackageEventListItem} from "./customer-event-list";
import {normalizeConfiguration} from "./customer-event-list";
import type {PlanningEntry} from "../../../../../../functions/src/customer-event-lists/contract";
import {toWebItem, type WebProjection} from "./customer-event-list-cloud-contract";

/** Booking projection is separate from the lossless write adapter. Never save this projection. */
export function projectCanonicalBookingReview(entry: PlanningEntry): WebProjection {
  const native = toWebItem(entry);
  if (native.status === "supported" || entry.kind !== "catering_package" || !entry.configuration) return native;
  const c = entry.configuration;
  const blocked = (reason: string): WebProjection => ({status: "read_only", reason, preserved: entry});
  if (entry.expectedRevision !== (c.expectedPackageRevision ?? null)) return blocked("The saved package revision requires reconciliation.");
  if (Array.isArray(c.selectedAddOns) && c.selectedAddOns.length) return blocked("Saved Mobile add-ons require coordinated review on Mobile before booking.");
  const theme = c.themeInspiration as Record<string, unknown> | undefined;
  const notes = typeof c.customTheme === "string" && c.customTheme ? c.customTheme : theme?.notes ?? "";
  if (theme?.notes && c.customTheme && theme.notes !== c.customTheme) return blocked("Saved theme instructions conflict. Review the theme on Mobile before booking.");
  const event = c.event as Record<string, unknown>;
  const instructions = typeof c.specialRequest === "string" ? c.specialRequest.trim() : "";
  const eventRequest = typeof event.specialRequest === "string" ? event.specialRequest : "";
  const specialRequest = instructions && !eventRequest.includes(instructions) ? [eventRequest, instructions].filter(Boolean).join("\n\n") : eventRequest;
  const configuration = normalizeConfiguration({...c,
    event: {...event, specialRequest},
    themeInspiration: {notes, referenceSetupId: theme?.referenceSetupId ?? null},
    selectedEventServices: c.selectedEventServices ?? [],
  });
  if (!configuration) return blocked("Saved event or theme details exceed the supported booking format. Review them before booking.");
  return {status: "supported", item: {type: "package", providerId: entry.providerId, packageId: entry.selectionId,
    providerName: String(entry.providerName), packageName: String(entry.name),
    price: typeof entry.estimatedPrice === "number" ? entry.estimatedPrice : null,
    imageUrl: typeof entry.imageUrl === "string" ? entry.imageUrl : null,
    packageHref: `/customer/packages/${encodeURIComponent(entry.selectionId)}`, configuration}};
}

/** Editing projection only. Keep the canonical entry for saving and booking restrictions. */
export function canonicalConfigurationDraft(entry: PlanningEntry): CustomizationDraft {
  if (entry.kind !== "catering_package" || !entry.configuration) throw new Error("Configuration unavailable");
  const configuration = normalizeConfiguration({
    ...entry.configuration,
    selectedEventServices: entry.configuration.selectedEventServices ?? [],
    themeInspiration: entry.configuration.themeInspiration ?? {
      notes: entry.configuration.customTheme ?? "", referenceSetupId: null,
    },
  });
  if (!configuration) throw new Error("Saved configuration requires a compatible editor.");
  return eventListConfigurationDraft(configuration);
}

export function canonicalPackageEditHref(entry: PlanningEntry): string {
  return `/customer/packages/${encodeURIComponent(entry.selectionId)}/book?${new URLSearchParams({eventListProvider: entry.providerId})}`;
}

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
