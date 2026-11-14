import {describe, expect, it} from "vitest";

import type {ProviderOnboardingDraft} from "@/lib/provider/onboarding";
import {providerProfileCompletedSteps} from "@/lib/provider/onboarding-readiness";
import type {ServiceCategoryOption} from "@/lib/service-categories/service-category-types";

const categories = [
  {
    code: "catering_service",
    name: "Catering",
    serviceType: "catering",
    status: "active",
    capacityCapabilities: {
      requiresGuestCapacity: true,
      usesStaffCapacity: true,
      usesEquipmentCapacity: false,
    },
  },
  {
    code: "event_styling",
    name: "Event Styling",
    serviceType: "addon",
    status: "active",
    capacityCapabilities: {
      requiresGuestCapacity: false,
      usesStaffCapacity: false,
      usesEquipmentCapacity: false,
    },
  },
] as ServiceCategoryOption[];

const profile = {
  ownerFirstName: "Test",
  ownerLastName: "Provider",
  ownerEmail: "provider@example.com",
  ownerPhone: "+639171234567",
  businessName: "Sample Catering",
  businessEmail: "business@example.com",
  businessPhone: "+639171234567",
  businessRegistrationType: "individual",
  description: "A sample catering provider for events.",
  providerServiceType: "catering",
  serviceCategories: ["catering_service"],
  eventTypesSupported: ["wedding"],
  address: "Ormoc City, Leyte",
  city: "Ormoc",
  province: "Leyte",
  serviceAreas: ["Ormoc"],
  locationCoordinates: {
    latitude: 11.006,
    longitude: 124.607,
  },
  minGuestsPerEvent: 20,
  maxGuestsPerEvent: 200,
  availableStaffCount: 5,
  availableEquipmentCount: 0,
  maxEventsPerDay: 1,
  acceptsMultipleEventsPerDay: false,
  operatingDays: ["monday"],
  bookingLeadTimeDays: 7,
  providerAgreementAccepted: true,
  providerAgreementVersion: "2026-09-27",
  completedSteps: [],
} as ProviderOnboardingDraft;

describe("provider onboarding readiness", () => {
  it("marks a valid saved profile complete", () => {
    expect(providerProfileCompletedSteps(profile, categories))
      .toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("does not mark missing owner information complete", () => {
    expect(providerProfileCompletedSteps({
      ...profile,
      ownerFirstName: "",
    }, categories)).not.toContain(1);
  });

  it("does not mark missing location coordinates complete", () => {
    expect(providerProfileCompletedSteps({
      ...profile,
      locationCoordinates: null,
    }, categories)).not.toContain(4);
  });

  it("rejects invalid guest capacity for catering", () => {
    expect(providerProfileCompletedSteps({
      ...profile,
      maxGuestsPerEvent: 0,
    }, categories)).not.toContain(5);
  });

  it("supports add-on services without guest capacity", () => {
    const addon = {
      ...profile,
      providerServiceType: "addon",
      serviceCategories: ["event_styling"],
      minGuestsPerEvent: 0,
      maxGuestsPerEvent: 0,
    } as ProviderOnboardingDraft;

    expect(providerProfileCompletedSteps(addon, categories))
      .toContain(5);
  });

  it("does not mark an unaccepted agreement complete", () => {
    expect(providerProfileCompletedSteps({
      ...profile,
      providerAgreementAccepted: false,
    }, categories)).not.toContain(6);
  });

  it("rejects discontinued service categories", () => {
    const discontinued = categories.map((category) =>
      category.code === "catering_service"
        ? {...category, status: "discontinued" as const}
        : category,
    );

    expect(providerProfileCompletedSteps(profile, discontinued))
      .not.toContain(3);
  });
});