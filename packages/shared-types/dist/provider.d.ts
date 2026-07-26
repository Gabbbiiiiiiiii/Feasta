import { type ProviderServiceType, type ProviderVerificationStatus, type VerificationDocumentStatus, type VerificationDocumentType } from "./enums.js";
export declare const REQUIRED_VERIFICATION_DOCUMENT_TYPES: readonly ["business_permit", "valid_id"];
export declare const UNVERSIONED_POLICY_VERSION: "unversioned";
export declare const PROVIDER_SERVICE_CATEGORIES: readonly ["catering_service", "food_trays_packed_meals", "catering_event_styling", "photographer", "videographer", "photo_booth", "event_coordinator", "event_host_emcee", "sound_system", "lights_and_sounds", "singer_band", "dancer_performer", "decorator_event_stylist", "florist", "cake_provider", "gown_suit_rental", "car_rental", "venue_provider", "tables_chairs_rental", "other_event_service"];
export type ProviderServiceCategory = (typeof PROVIDER_SERVICE_CATEGORIES)[number];
export declare const CATERING_SERVICE_CATEGORIES: readonly ["catering_service", "food_trays_packed_meals", "catering_event_styling"];
export declare const ADDON_SERVICE_CATEGORIES: readonly ProviderServiceCategory[];
export declare const PROVIDER_EVENT_TYPES: readonly ["birthday", "wedding", "anniversary", "reunion", "corporate", "baptism", "graduation", "other"];
export type ProviderEventType = (typeof PROVIDER_EVENT_TYPES)[number];
export declare const PROVIDER_OPERATING_DAYS: readonly ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export type ProviderOperatingDay = (typeof PROVIDER_OPERATING_DAYS)[number];
export declare const PROVIDER_OWNER_IDENTITY_CLIENT_FIELDS: readonly ["firstName", "lastName", "email", "phone", "acceptedTerms", "acceptedPrivacy", "termsPolicyVersion", "privacyPolicyVersion"];
export declare const PROVIDER_VERIFICATION_DOCUMENT_DEFINITIONS: readonly [{
    readonly type: "business_permit";
    readonly label: "Business permit";
    readonly required: true;
}, {
    readonly type: "dti_registration";
    readonly label: "DTI registration";
    readonly required: false;
}, {
    readonly type: "bir_registration";
    readonly label: "BIR registration";
    readonly required: false;
}, {
    readonly type: "valid_id";
    readonly label: "Valid ID";
    readonly required: true;
}, {
    readonly type: "sanitary_permit";
    readonly label: "Sanitary permit";
    readonly required: false;
}, {
    readonly type: "mayors_permit";
    readonly label: "Mayor's permit";
    readonly required: false;
}, {
    readonly type: "other";
    readonly label: "Other";
    readonly required: false;
}];
export declare const PROVIDER_ONBOARDING_CLIENT_FIELDS: readonly ["ownerFirstName", "ownerLastName", "businessName", "businessEmail", "businessPhone", "description", "address", "city", "province", "locationCoordinates", "providerServiceType", "providerCategory", "serviceCategories", "serviceAreas", "maxServiceDistanceKm", "eventTypesSupported", "minGuestsPerEvent", "maxGuestsPerEvent", "guestCapacity", "acceptsMultipleEventsPerDay", "maxEventsPerDay", "availableStaffCount", "availableEquipmentCount", "operatingDays", "bookingLeadTimeDays", "unavailableDates", "logoStoragePath", "coverStoragePath", "idempotencyKey"];
export declare const PROVIDER_SERVER_OWNED_FIELDS: readonly ["ownerId", "ownerEmail", "ownerPhone", "verificationStatus", "isActive", "isFeatured", "isSuspended", "suspendedAt", "suspendedBy", "approvedAt", "approvedBy", "reviewedAt", "reviewedBy", "rejectionReason", "resubmissionReason", "suspensionReason", "searchTokens", "ratingAverage", "reviewCount", "totalCompletedBookings", "totalViews", "favoriteCount", "createdAt", "updatedAt", "deletedAt", "deletedBy"];
export type ProviderTimestamp = Date | string | number | {
    seconds: number;
    nanoseconds: number;
} | {
    toDate(): Date;
};
export interface ProviderOwnerIdentityInput {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
    termsPolicyVersion: string;
    privacyPolicyVersion: string;
}
export interface ProviderLocationCoordinates {
    latitude: number;
    longitude: number;
}
export interface ProviderOwnerProfile {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    termsPolicyVersion: string;
    privacyPolicyVersion: string;
    termsAcceptedAt: ProviderTimestamp | null;
    privacyAcceptedAt: ProviderTimestamp | null;
}
export interface ProviderOnboardingInput {
    ownerFirstName: string;
    ownerLastName: string;
    businessName: string;
    businessEmail: string;
    businessPhone: string;
    description: string;
    providerServiceType: ProviderServiceType;
    providerCategory: string;
    serviceCategories: readonly ProviderServiceCategory[];
    address: string;
    city: string;
    province: string;
    locationCoordinates: ProviderLocationCoordinates | null;
    serviceAreas: readonly string[];
    maxServiceDistanceKm: number | null;
    eventTypesSupported: readonly ProviderEventType[];
    minGuestsPerEvent: number;
    maxGuestsPerEvent: number;
    acceptsMultipleEventsPerDay: boolean;
    maxEventsPerDay: number;
    availableStaffCount: number;
    availableEquipmentCount: number;
    operatingDays: readonly ProviderOperatingDay[];
    bookingLeadTimeDays: number;
    unavailableDates: readonly string[];
    logoStoragePath: string | null;
    coverStoragePath: string | null;
}
export interface ProviderProfile extends ProviderOnboardingInput {
    id: string;
    ownerId: string;
    ownerEmail: string | null;
    ownerPhone: string | null;
    verificationStatus: ProviderVerificationStatus;
    isActive: boolean;
    isFeatured: boolean;
    isSuspended: boolean;
    isDeleted: boolean;
    createdAt: ProviderTimestamp;
    updatedAt: ProviderTimestamp;
}
export interface ProviderVerification {
    id: string;
    providerId: string;
    ownerId: string;
    businessName: string;
    providerServiceType: ProviderServiceType;
    status: ProviderVerificationStatus;
    remarks: string | null;
    rejectionReason: string | null;
    resubmissionReason: string | null;
    suspensionReason: string | null;
    submittedAt: ProviderTimestamp | null;
    reviewedAt: ProviderTimestamp | null;
    reviewedBy: string | null;
    approvedAt: ProviderTimestamp | null;
    rejectedAt: ProviderTimestamp | null;
    suspendedAt: ProviderTimestamp | null;
    createdAt: ProviderTimestamp;
    updatedAt: ProviderTimestamp;
}
export interface ProviderVerificationDocument {
    id: string;
    verificationId: string;
    providerId: string;
    ownerId: string;
    documentType: VerificationDocumentType;
    displayName: string;
    isRequired: boolean;
    storagePath: string;
    originalFileName: string;
    contentType: string;
    fileSize: number;
    status: VerificationDocumentStatus;
    rejectionReason: string | null;
    verifiedAt: ProviderTimestamp | null;
    verifiedBy: string | null;
    createdAt: ProviderTimestamp;
    updatedAt: ProviderTimestamp;
}
export interface ProviderVerificationHistoryEntry {
    actorId: string;
    actorRole: "provider" | "admin" | "system";
    action: string;
    fromStatus: ProviderVerificationStatus | null;
    toStatus: ProviderVerificationStatus;
    remarks: string | null;
    createdAt: ProviderTimestamp;
}
export interface ProviderValidationIssue {
    field: string;
    code: "required" | "invalid" | "too_short" | "too_long" | "unknown";
}
export type ProviderOnboardingValidationResult = {
    success: true;
    value: ProviderOnboardingInput;
} | {
    success: false;
    issues: readonly ProviderValidationIssue[];
};
export type ProviderOwnerIdentityValidationResult = {
    success: true;
    value: ProviderOwnerIdentityInput;
} | {
    success: false;
    issues: readonly ProviderValidationIssue[];
};
export declare function validateProviderOwnerIdentityInput(input: unknown): ProviderOwnerIdentityValidationResult;
export declare function parseProviderServiceType(value: unknown): ProviderServiceType | null;
export declare function normalizeProviderEmail(value: unknown): string | null;
/**
 * Accepts common Philippine local and country-code forms without relying on
 * carrier-prefix lists. The canonical value is E.164-like `+63...`.
 */
export declare function normalizePhilippinePhone(value: unknown): string | null;
export declare function parseVerificationDocumentType(value: unknown): VerificationDocumentType | null;
export declare function parseVerificationDocumentStatus(value: unknown): VerificationDocumentStatus | null;
export declare function parseProviderVerificationStatusStrict(value: unknown): ProviderVerificationStatus | null;
/**
 * Validates the client-writable onboarding fields only. Trusted ownership,
 * lifecycle, activation, review, aggregate, and audit fields are deliberately
 * absent from the returned value.
 *
 * Compatibility: `guestCapacity` is accepted as a legacy alias for
 * `maxGuestsPerEvent`; omitted capacity and schedule fields use the existing
 * provider-registration defaults.
 */
export declare function validateProviderOnboardingInput(input: unknown): ProviderOnboardingValidationResult;
export declare function serviceCategoryMatchesProviderType(category: ProviderServiceCategory, providerServiceType: ProviderServiceType): boolean;
//# sourceMappingURL=provider.d.ts.map