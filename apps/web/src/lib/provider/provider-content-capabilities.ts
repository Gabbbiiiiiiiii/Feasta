import {FOOD_SERVICE_CATEGORIES} from "@feasta/shared-types";

export function providerContentCapabilities(serviceType: unknown, categories: readonly string[] = []) {
  const catering = serviceType === "catering" || serviceType === "both" ||
    categories.some((category) => (FOOD_SERVICE_CATEGORIES as readonly string[]).includes(category));
  return {
    catering,
    // Packages have an existing catering-only persistence/booking contract.
    packages: serviceType === "catering" || serviceType === "both",
    decorations: catering || categories.some((category) => ["decorator_event_stylist", "florist"].includes(category)),
    furniture: catering || categories.some((category) => ["tables_chairs_rental", "venue_provider"].includes(category)),
  };
}
