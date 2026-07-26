export const FUNCTION_REGION =
  "asia-southeast1" as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const USER_ROLES = {
  customer: "customer",
  provider: "provider",
  admin: "admin",
} as const;

export type UserRole =
  (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ACCOUNT_STATUSES = [
  "active",
  "blocked",
  "disabled",
  "pending_deletion",
] as const;

export type AccountStatus =
  (typeof ACCOUNT_STATUSES)[number];

export const PROVIDER_VERIFICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "resubmission_required",
  "approved",
  "rejected",
  "suspended",
] as const;

export type ProviderVerificationStatus =
  (typeof PROVIDER_VERIFICATION_STATUSES)[number];

export function parseUserRole(value: unknown): UserRole | null {
  const normalized = normalizeStatusValue(value);
  return Object.values(USER_ROLES).includes(normalized as UserRole) ?
    normalized as UserRole :
    null;
}

export function parseAccountStatus(value: unknown): AccountStatus | null {
  const normalized = normalizeStatusValue(value, {
    pendingdeletion: "pending_deletion",
  });
  return ACCOUNT_STATUSES.includes(normalized as AccountStatus) ?
    normalized as AccountStatus :
    null;
}

export function parseProviderVerificationStatus(
  value: unknown,
): ProviderVerificationStatus | null {
  const normalized = normalizeStatusValue(value, {
    underreview: "under_review",
    resubmissionrequired: "resubmission_required",
  });
  return PROVIDER_VERIFICATION_STATUSES.includes(
    normalized as ProviderVerificationStatus,
  ) ? normalized as ProviderVerificationStatus : null;
}

export const PROVIDER_VERIFICATION_TRANSITIONS = {
  draft: ["submitted"],
  submitted: ["under_review"],
  under_review: [
    "approved",
    "rejected",
    "resubmission_required",
  ],
  resubmission_required: ["submitted"],
  approved: ["suspended"],
  rejected: [],
  suspended: [],
} as const satisfies Record<
  ProviderVerificationStatus,
  readonly ProviderVerificationStatus[]
>;

export function isProviderVerificationTransitionAllowed(
  from: ProviderVerificationStatus,
  to: ProviderVerificationStatus,
): boolean {
  return (PROVIDER_VERIFICATION_TRANSITIONS[from] as readonly string[])
    .includes(to);
}

export const VERIFICATION_DOCUMENT_TYPES = [
  "business_permit",
  "dti_registration",
  "bir_registration",
  "valid_id",
  "sanitary_permit",
  "mayors_permit",
  "other",
] as const;

export type VerificationDocumentType =
  (typeof VERIFICATION_DOCUMENT_TYPES)[number];

export function parseVerificationDocumentType(
  value: unknown,
): VerificationDocumentType | null {
  const normalized = normalizeStatusValue(value, {
    mayor_permit: "mayors_permit",
    validid: "valid_id",
  });
  return VERIFICATION_DOCUMENT_TYPES.includes(
    normalized as VerificationDocumentType,
  ) ? normalized as VerificationDocumentType : null;
}

export const VERIFICATION_DOCUMENT_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "expired",
] as const;

export type VerificationDocumentStatus =
  (typeof VERIFICATION_DOCUMENT_STATUSES)[number];

export function parseVerificationDocumentStatus(
  value: unknown,
): VerificationDocumentStatus | null {
  const normalized = normalizeStatusValue(value);
  return VERIFICATION_DOCUMENT_STATUSES.includes(
    normalized as VerificationDocumentStatus,
  ) ? normalized as VerificationDocumentStatus : null;
}

export const PROVIDER_SERVICE_TYPES = [
  "catering",
  "addon",
  "both",
] as const;

export type ProviderServiceType =
  (typeof PROVIDER_SERVICE_TYPES)[number];

export const PROVIDER_SERVICE_CATEGORIES = [
  "catering_service",
  "food_trays_packed_meals",
  "catering_event_styling",
  "photographer",
  "videographer",
  "photo_booth",
  "event_coordinator",
  "event_host_emcee",
  "sound_system",
  "lights_and_sounds",
  "singer_band",
  "dancer_performer",
  "decorator_event_stylist",
  "florist",
  "cake_provider",
  "gown_suit_rental",
  "car_rental",
  "venue_provider",
  "tables_chairs_rental",
  "other_event_service",
] as const;

export type ProviderServiceCategory =
  (typeof PROVIDER_SERVICE_CATEGORIES)[number];

export const CATERING_SERVICE_CATEGORIES = [
  "catering_service",
  "food_trays_packed_meals",
  "catering_event_styling",
] as const satisfies readonly ProviderServiceCategory[];

export const PROVIDER_EVENT_TYPES = [
  "birthday",
  "wedding",
  "anniversary",
  "reunion",
  "corporate",
  "baptism",
  "graduation",
  "other",
] as const;

export const PROVIDER_OPERATING_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export function serviceCategoryMatchesProviderType(
  category: ProviderServiceCategory,
  providerServiceType: ProviderServiceType,
): boolean {
  const catering = (CATERING_SERVICE_CATEGORIES as readonly string[])
    .includes(category);
  return providerServiceType === "both" ||
    (providerServiceType === "catering" ? catering : !catering);
}

export function parseProviderServiceType(
  value: unknown,
): ProviderServiceType | null {
  const normalized = normalizeStatusValue(value, {
    add_on: "addon",
    addons: "addon",
  });
  return PROVIDER_SERVICE_TYPES.includes(
    normalized as ProviderServiceType,
  ) ? normalized as ProviderServiceType : null;
}

/**
 * FEASTA's minimum provider-verification policy. This is deliberately
 * server-owned; callable input cannot mark a document required or optional.
 */
export const REQUIRED_VERIFICATION_DOCUMENT_TYPES = [
  "business_permit",
  "valid_id",
] as const satisfies readonly VerificationDocumentType[];

export const VERIFICATION_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_VERIFICATION_DOCUMENT_SIZE_BYTES =
  10 * 1024 * 1024;

export function isRequiredVerificationDocumentType(
  type: VerificationDocumentType,
): boolean {
  return (REQUIRED_VERIFICATION_DOCUMENT_TYPES as readonly string[])
    .includes(type);
}

function normalizeStatusValue(
  value: unknown,
  aliases: Readonly<Record<string, string>> = {},
): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  return aliases[normalized] ?? normalized;
}

export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "paid",
  "failed",
  "expired",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_TRANSITIONS = {
  pending: ["processing", "paid", "failed", "expired"],
  processing: ["paid", "failed", "expired"],
  paid: ["refunded"],
  failed: ["processing"],
  expired: ["processing"],
  refunded: [],
} as const satisfies Record<PaymentStatus, readonly PaymentStatus[]>;

export function isPaymentStatusTransitionAllowed(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return (PAYMENT_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}

export const PAYMENT_CURRENCY = "PHP" as const;
