import type { ProviderServiceType } from "./enums.js";
export declare const SERVICE_CATEGORY_STATUSES: readonly ["active", "discontinued"];
export type ServiceCategoryStatus = (typeof SERVICE_CATEGORY_STATUSES)[number];
export type ServiceCategoryCode = string;
export declare const SERVICE_CATEGORY_CODE_PATTERN: RegExp;
export declare function isServiceCategoryCode(value: unknown): value is ServiceCategoryCode;
export declare function normalizeServiceCategoryCode(value: string): ServiceCategoryCode;
export interface ServiceCategoryCapacityCapabilities {
    requiresGuestCapacity: boolean;
    usesStaffCapacity: boolean;
    usesEquipmentCapacity: boolean;
}
export interface ServiceCategoryDefinition {
    code: ServiceCategoryCode;
    name: string;
    serviceType: Exclude<ProviderServiceType, "both">;
    capacityCapabilities?: ServiceCategoryCapacityCapabilities;
}
export interface ServiceCategoryRecord extends ServiceCategoryDefinition {
    status: ServiceCategoryStatus;
    sortName: string;
}
export declare const DEFAULT_SERVICE_CATEGORY_DEFINITIONS: readonly [{
    readonly code: "catering_service";
    readonly name: "Catering Service";
    readonly serviceType: "catering";
}, {
    readonly code: "food_trays_packed_meals";
    readonly name: "Food Trays & Packed Meals";
    readonly serviceType: "catering";
}, {
    readonly code: "catering_event_styling";
    readonly name: "Catering & Event Styling";
    readonly serviceType: "catering";
}, {
    readonly code: "photographer";
    readonly name: "Photography";
    readonly serviceType: "addon";
}, {
    readonly code: "videographer";
    readonly name: "Videography";
    readonly serviceType: "addon";
}, {
    readonly code: "photo_booth";
    readonly name: "Photo Booth";
    readonly serviceType: "addon";
}, {
    readonly code: "event_coordinator";
    readonly name: "Event Coordinator";
    readonly serviceType: "addon";
}, {
    readonly code: "event_host_emcee";
    readonly name: "Event Host / Emcee";
    readonly serviceType: "addon";
}, {
    readonly code: "sound_system";
    readonly name: "Sound System";
    readonly serviceType: "addon";
}, {
    readonly code: "lights_and_sounds";
    readonly name: "Lights & Sounds";
    readonly serviceType: "addon";
}, {
    readonly code: "singer_band";
    readonly name: "Singer / Band";
    readonly serviceType: "addon";
}, {
    readonly code: "dancer_performer";
    readonly name: "Dancer / Performer";
    readonly serviceType: "addon";
}, {
    readonly code: "decorator_event_stylist";
    readonly name: "Decorator / Event Stylist";
    readonly serviceType: "addon";
}, {
    readonly code: "florist";
    readonly name: "Florist";
    readonly serviceType: "addon";
}, {
    readonly code: "cake_provider";
    readonly name: "Cake Provider";
    readonly serviceType: "addon";
}, {
    readonly code: "gown_suit_rental";
    readonly name: "Gown & Suit Rental";
    readonly serviceType: "addon";
}, {
    readonly code: "car_rental";
    readonly name: "Car Rental";
    readonly serviceType: "addon";
}, {
    readonly code: "venue_provider";
    readonly name: "Venue Provider";
    readonly serviceType: "addon";
}, {
    readonly code: "tables_chairs_rental";
    readonly name: "Tables & Chairs Rental";
    readonly serviceType: "addon";
}, {
    readonly code: "other_event_service";
    readonly name: "Other Event Service";
    readonly serviceType: "addon";
}];
//# sourceMappingURL=service-category.d.ts.map