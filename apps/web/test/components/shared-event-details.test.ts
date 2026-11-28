import {describe, expect, it} from "vitest";
import {compatibleSharedEvent, sharedEventCandidates, sharedEventDetails} from "@/lib/customer/event-list/shared-event-details";
import type {CustomerPackageEventListItem} from "@/lib/customer/event-list/customer-event-list";

const event = {eventType: "wedding", eventDate: "2030-06-20", eventTime: "10:00", eventEndTime: "12:00", guestCount: 100,
  eventLocation: "Ormoc City", eventAddress: "Event hall", specialRequest: "Provider-specific request"};
const item = {providerId: "provider-a", providerName: "A", packageId: "package-a", configuration: {event}} as CustomerPackageEventListItem;

describe("shared event compatibility", () => {
  it("copies only the seven shared fields", () => {
    expect(Object.keys(sharedEventDetails(event))).toHaveLength(7);
    expect(sharedEventDetails(event)).not.toHaveProperty("specialRequest");
  });
  it("excludes the destination and unconfigured entries, deduplicates matching plans", () => {
    expect(sharedEventCandidates([item], "provider-a")).toEqual([]);
    expect(sharedEventCandidates([{...item, configuration: null}], "provider-b")).toEqual([]);
    expect(sharedEventCandidates([item, {...item, packageId: "another"}], "provider-b")).toHaveLength(1);
  });
  it("retains every conflicting detail set for explicit selection", () => {
    expect(sharedEventCandidates([item, {...item, configuration: {...item.configuration!, event: {...event, eventAddress: "Other hall"}}}], "provider-b")).toHaveLength(2);
  });
  it("omits unsupported event types, guest counts and stale schedules without clamping", () => {
    const values = compatibleSharedEvent(event, {eventTypes: ["birthday"], maximum: 50, earliestDate: "2031-01-01"});
    expect(values).toEqual({eventLocation: "Ormoc City", eventAddress: "Event hall"});
  });
  it("keeps valid supported values editable as form data", () => {
    expect(compatibleSharedEvent(event, {eventTypes: ["wedding"], minimum: 50, maximum: 150, earliestDate: "2030-01-01"}))
      .toEqual({...sharedEventDetails(event), guestCount: "100"});
  });
});
