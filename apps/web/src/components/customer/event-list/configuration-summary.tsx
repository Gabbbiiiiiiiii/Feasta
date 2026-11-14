"use client";
import {useEffect, useState} from "react";
import {loadEventListPackageLabels} from "@/app/customer/packages/event-list-labels";
import {configurationOptionLabels} from "@/lib/customer/event-list/configuration-edit";
import type {CustomerPackageEventListItem} from "@/lib/customer/event-list/customer-event-list";
import {cateringPackageServiceTierLabel} from "@/lib/catering/catering-service-tier";
import {formatCustomerEventDate, formatCustomerEventTime} from "@/lib/customer/planning/event-planning-context";

export function ConfigurationSummary({item}: {item: CustomerPackageEventListItem}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadEventListPackageLabels>>>(null);
  useEffect(() => {
    if (!open || !item.configuration) return;
    let active = true;
    void loadEventListPackageLabels(item.providerId, item.packageId).then(value => {
      if (active) setDetail(value);
    }).catch(() => {if (active) setDetail(null);});
    return () => {active = false;};
  }, [open, item.providerId, item.packageId, item.configuration]);
  const config = item.configuration;
  if (!config) return <p>Needs customization</p>;
  const labels = configurationOptionLabels(config, detail);
  return <div className="mt-2 text-sm">
    <p className="font-semibold">Configured — revalidation required</p>
    <p>{formatCustomerEventDate(config.event.eventDate)} · {formatCustomerEventTime(config.event.eventTime)}–{formatCustomerEventTime(config.event.eventEndTime)} · {config.event.guestCount} guests</p>
    <p>{config.event.eventLocation}</p>
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer">Configuration details</summary>
      <dl className="grid gap-2 py-2">
        <div><dt>Address</dt><dd>{config.event.eventAddress}</dd></div>
        <div><dt>Service level</dt><dd>{config.serviceTier ? cateringPackageServiceTierLabel(config.serviceTier) : "No service level selected"}</dd></div>
        <div><dt>Food selections</dt><dd>{labels.foods.join(", ") || "None selected"}</dd></div>
        <div><dt>Theme</dt><dd>{labels.theme ?? "None selected"}</dd></div>
        {config.themeInspiration?.notes ? <div><dt>Theme inspiration</dt><dd>{config.themeInspiration.notes}</dd></div> : null}
        {config.themeInspiration?.referenceSetupId ? <div><dt>Setup inspiration</dt><dd>{detail?.setupLabels?.find(setup => setup.id === config.themeInspiration?.referenceSetupId)?.title ?? "Saved setup inspiration currently unavailable"}</dd></div> : null}
        <div><dt>Decorations</dt><dd>{config.selectedDecorations.join(", ") || "None selected"}</dd></div>
        <div><dt>Furniture</dt><dd>{config.selectedFurniture.join(", ") || "None selected"}</dd></div>
        <div><dt>Event services</dt><dd>{config.selectedEventServices.map(service => `${service.name} — ${service.providerName}`).join(", ") || "None selected"}</dd></div>
        {config.willArrangeOwnAddOns ? <div><dt>Customer-arranged services</dt><dd>{config.customerArrangedAddOnsNote || "Arranging own services"}</dd></div> : null}
        <div><dt>Special requests</dt><dd>{config.event.specialRequest || "None"}</dd></div>
        <div><dt>Saved estimate</dt><dd>{config.estimatedTotal === null ? "Unknown" : new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(config.estimatedTotal)}</dd></div>
      </dl>
      <p>Planning snapshot only. Prices and availability must be checked again.</p>
    </details>
  </div>;
}
