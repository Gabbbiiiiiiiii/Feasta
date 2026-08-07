import {
  PROVIDER_SERVICE_TYPES,
  PROVIDER_VERIFICATION_STATUSES,
  VERIFICATION_DOCUMENT_STATUSES,
  VERIFICATION_DOCUMENT_TYPES,
  type ProviderServiceType,
  type ProviderVerificationStatus,
  type VerificationDocumentStatus,
  type VerificationDocumentType,
} from "./enums.js";

export const REQUIRED_VERIFICATION_DOCUMENT_TYPES = [
  "business_permit",
  "dti_registration",
  "bir_registration",
  "valid_id",
] as const satisfies readonly VerificationDocumentType[];

export const FOOD_SERVICE_CATEGORIES = [
  "catering_service",
  "food_trays_packed_meals",
  "catering_event_styling",
  "cake_provider",
] as const satisfies readonly ProviderServiceCategory[];

export const FOOD_PERMIT_ALTERNATIVES = [
  "sanitary_permit",
  "mayors_permit",
] as const satisfies readonly VerificationDocumentType[];

export interface ProviderVerificationDocumentPolicy {
  requiredAll: readonly VerificationDocumentType[];
  requiredOneOf: readonly (readonly VerificationDocumentType[])[];
}

export const UNVERSIONED_POLICY_VERSION = "unversioned" as const;

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

export const ADDON_SERVICE_CATEGORIES = PROVIDER_SERVICE_CATEGORIES.filter(
  (category) =>
    !(CATERING_SERVICE_CATEGORIES as readonly string[]).includes(category),
) as readonly ProviderServiceCategory[];

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

export type ProviderEventType = (typeof PROVIDER_EVENT_TYPES)[number];

export const PROVIDER_OPERATING_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type ProviderOperatingDay = (typeof PROVIDER_OPERATING_DAYS)[number];

export const PROVIDER_OWNER_IDENTITY_CLIENT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "acceptedTerms",
  "acceptedPrivacy",
  "termsPolicyVersion",
  "privacyPolicyVersion",
] as const;

export const PROVIDER_VERIFICATION_DOCUMENT_DEFINITIONS = [
  {type: "business_permit", label: "Business permit", required: true},
  {
    type: "dti_registration",
    label: "DTI or SEC registration",
    required: true,
  },
  {type: "bir_registration", label: "BIR documentation", required: true},
  {type: "valid_id", label: "Valid government ID", required: true},
  {type: "sanitary_permit", label: "Sanitary permit", required: false},
  {type: "mayors_permit", label: "Mayor's permit", required: false},
  {type: "other", label: "Other supporting document", required: false},
] as const satisfies readonly {
  type: VerificationDocumentType;
  label: string;
  required: boolean;
}[];

export const PROVIDER_ONBOARDING_CLIENT_FIELDS = [
  "ownerFirstName",
  "ownerLastName",
  "businessName",
  "businessEmail",
  "businessPhone",
  "description",
  "address",
  "city",
  "province",
  "locationCoordinates",
  "providerServiceType",
  "providerCategory",
  "serviceCategories",
  "serviceAreas",
  "maxServiceDistanceKm",
  "eventTypesSupported",
  "minGuestsPerEvent",
  "maxGuestsPerEvent",
  "guestCapacity",
  "acceptsMultipleEventsPerDay",
  "maxEventsPerDay",
  "availableStaffCount",
  "availableEquipmentCount",
  "operatingDays",
  "bookingLeadTimeDays",
  "unavailableDates",
  "logoUrl",
  "logoPublicId",
  "coverImageUrl",
  "coverPublicId",
  "idempotencyKey",
] as const;

export const PROVIDER_SERVER_OWNED_FIELDS = [
  "ownerId",
  "ownerEmail",
  "ownerPhone",
  "verificationStatus",
  "isActive",
  "isFeatured",
  "isSuspended",
  "suspendedAt",
  "suspendedBy",
  "approvedAt",
  "approvedBy",
  "reviewedAt",
  "reviewedBy",
  "rejectionReason",
  "resubmissionReason",
  "suspensionReason",
  "searchTokens",
  "ratingAverage",
  "reviewCount",
  "totalCompletedBookings",
  "totalViews",
  "favoriteCount",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "deletedBy",
] as const;

export type ProviderTimestamp =
  | Date
  | string
  | number
  | {seconds: number; nanoseconds: number}
  | {toDate(): Date};

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
  logoUrl: string | null;
  logoPublicId: string | null;
  coverImageUrl: string | null;
  coverPublicId: string | null;
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
  termsPolicyVersion: string;
  privacyPolicyVersion: string;
  termsAcceptedAt: ProviderTimestamp | null;
  privacyAcceptedAt: ProviderTimestamp | null;
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
  requirement: "required" | "one_of" | "optional";
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

export function providerVerificationDocumentPolicy(input: {
  providerServiceType: ProviderServiceType;
  serviceCategories?: readonly string[];
}): ProviderVerificationDocumentPolicy {
  const categories = input.serviceCategories ?? [];
  const requiresFoodPermit =
    input.providerServiceType === "catering" ||
    input.providerServiceType === "both" ||
    categories.some((category) =>
      (FOOD_SERVICE_CATEGORIES as readonly string[]).includes(category)
    );
  const requiresMayorsPermit = categories.includes("venue_provider");
  return {
    requiredAll: [
      ...REQUIRED_VERIFICATION_DOCUMENT_TYPES,
      ...(requiresMayorsPermit ? ["mayors_permit" as const] : []),
    ],
    requiredOneOf: requiresFoodPermit && !requiresMayorsPermit
      ? [FOOD_PERMIT_ALTERNATIVES]
      : [],
  };
}

export function verificationDocumentRequirement(
  documentType: VerificationDocumentType,
  policy: ProviderVerificationDocumentPolicy,
): "required" | "one_of" | "optional" {
  if (policy.requiredAll.includes(documentType)) return "required";
  if (policy.requiredOneOf.some((group) => group.includes(documentType))) {
    return "one_of";
  }
  return "optional";
}

export function verificationDocumentsSatisfyPolicy(
  documentTypes: ReadonlySet<string>,
  policy: ProviderVerificationDocumentPolicy,
): boolean {
  return policy.requiredAll.every((type) => documentTypes.has(type)) &&
    policy.requiredOneOf.every((group) =>
      group.some((type) => documentTypes.has(type))
    );
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

export type ProviderOnboardingValidationResult =
  | {success: true; value: ProviderOnboardingInput}
  | {success: false; issues: readonly ProviderValidationIssue[]};

export type ProviderOwnerIdentityValidationResult =
  | {success: true; value: ProviderOwnerIdentityInput}
  | {success: false; issues: readonly ProviderValidationIssue[]};

export function validateProviderOwnerIdentityInput(
  input: unknown,
): ProviderOwnerIdentityValidationResult {
  if (!isRecord(input)) {
    return {success: false, issues: [{field: "data", code: "invalid"}]};
  }
  const issues: ProviderValidationIssue[] = [];
  const value = {
    firstName: identityText(input, "firstName", 1, 80, issues),
    lastName: identityText(input, "lastName", 1, 80, issues),
    email: identityText(input, "email", 3, 160, issues).toLowerCase(),
    phone: identityText(input, "phone", 7, 30, issues),
    acceptedTerms: input.acceptedTerms === true,
    acceptedPrivacy: input.acceptedPrivacy === true,
    termsPolicyVersion: identityText(
      input,
      "termsPolicyVersion",
      1,
      80,
      issues,
    ),
    privacyPolicyVersion: identityText(
      input,
      "privacyPolicyVersion",
      1,
      80,
      issues,
    ),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.email)) {
    issues.push({field: "email", code: "invalid"});
  }
  if (!value.acceptedTerms) {
    issues.push({field: "acceptedTerms", code: "required"});
  }
  if (!value.acceptedPrivacy) {
    issues.push({field: "acceptedPrivacy", code: "required"});
  }
  const known = new Set<string>(PROVIDER_OWNER_IDENTITY_CLIENT_FIELDS);
  for (const field of Object.keys(input)) {
    if (!known.has(field)) issues.push({field, code: "unknown"});
  }
  return issues.length > 0
    ? {success: false, issues}
    : {success: true, value};
}

export function parseProviderServiceType(
  value: unknown,
): ProviderServiceType | null {
  const normalized = normalize(value, {
    "add-on": "addon",
    add_on: "addon",
    addons: "addon",
  });
  return PROVIDER_SERVICE_TYPES.includes(normalized as ProviderServiceType)
    ? normalized as ProviderServiceType
    : null;
}

export function normalizeProviderEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
    ? normalized
    : null;
}

/**
 * Accepts common Philippine local and country-code forms without relying on
 * carrier-prefix lists. The canonical value is E.164-like `+63...`.
 */
export function normalizePhilippinePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/[\s().-]/gu, "");
  const normalized = compact.startsWith("+63")
    ? compact
    : compact.startsWith("63")
      ? `+${compact}`
      : compact.startsWith("0")
        ? `+63${compact.slice(1)}`
        : "";
  return /^\+63\d{8,10}$/u.test(normalized) ? normalized : null;
}

export function parseVerificationDocumentType(
  value: unknown,
): VerificationDocumentType | null {
  const normalized = normalize(value, {
    mayor_permit: "mayors_permit",
    validid: "valid_id",
  });
  return VERIFICATION_DOCUMENT_TYPES.includes(
    normalized as VerificationDocumentType,
  )
    ? normalized as VerificationDocumentType
    : null;
}

export function parseVerificationDocumentStatus(
  value: unknown,
): VerificationDocumentStatus | null {
  const normalized = normalize(value);
  return VERIFICATION_DOCUMENT_STATUSES.includes(
    normalized as VerificationDocumentStatus,
  )
    ? normalized as VerificationDocumentStatus
    : null;
}

export function parseProviderVerificationStatusStrict(
  value: unknown,
): ProviderVerificationStatus | null {
  const normalized = normalize(value, {
    underreview: "under_review",
    resubmissionrequired: "resubmission_required",
  });
  return PROVIDER_VERIFICATION_STATUSES.includes(
    normalized as ProviderVerificationStatus,
  )
    ? normalized as ProviderVerificationStatus
    : null;
}

/**
 * Validates the client-writable onboarding fields only. Trusted ownership,
 * lifecycle, activation, review, aggregate, and audit fields are deliberately
 * absent from the returned value.
 *
 * Compatibility: `guestCapacity` is accepted as a legacy alias for
 * `maxGuestsPerEvent`; omitted capacity and schedule fields use the existing
 * provider-registration defaults.
 */
export function validateProviderOnboardingInput(
  input: unknown,
): ProviderOnboardingValidationResult {
  if (!isRecord(input)) {
    return {success: false, issues: [{field: "data", code: "invalid"}]};
  }

  const issues: ProviderValidationIssue[] = [];
  const text = (
    field: string,
    minimum: number,
    maximum: number,
    transform: (value: string) => string = (value) => value,
  ): string => {
    const raw = input[field];
    if (typeof raw !== "string") {
      issues.push({field, code: "required"});
      return "";
    }
    const value = transform(raw.trim());
    if (value.length < minimum) issues.push({field, code: "too_short"});
    if (value.length > maximum) issues.push({field, code: "too_long"});
    return value;
  };

  const ownerFirstName = text("ownerFirstName", 1, 80);
  const ownerLastName = text("ownerLastName", 1, 80);
  const businessName = text("businessName", 2, 120);
  const rawBusinessEmail = text("businessEmail", 3, 160);
  const businessEmail = normalizeProviderEmail(rawBusinessEmail) ?? "";
  if (!businessEmail) {
    issues.push({field: "businessEmail", code: "invalid"});
  }
  const rawBusinessPhone = text("businessPhone", 7, 30);
  const businessPhone = normalizePhilippinePhone(rawBusinessPhone) ?? "";
  if (!businessPhone) {
    issues.push({field: "businessPhone", code: "invalid"});
  }
  const description = text("description", 20, 2000);
  const providerCategory = text("providerCategory", 2, 100);
  const address = text("address", 3, 250);
  const city = text("city", 2, 100);
  const province = text("province", 2, 100);
  const providerServiceType = parseProviderServiceType(
    input.providerServiceType,
  );
  if (!providerServiceType) {
    issues.push({field: "providerServiceType", code: "invalid"});
  }

  const locationCoordinates = optionalCoordinates(
    input.locationCoordinates,
    issues,
  );
  const serviceAreas = stringList(input.serviceAreas, "serviceAreas", issues);
  const serviceCategories = serviceCategoryList(
    input.serviceCategories,
    providerCategory,
    providerServiceType,
    issues,
  );
  const maxServiceDistanceKm = optionalNumber(
    input.maxServiceDistanceKm,
    "maxServiceDistanceKm",
    1,
    1000,
    issues,
  );
  const eventTypesSupported = (
    input.serviceCategories === undefined
      ? compatibilityEventTypeList(
          input.eventTypesSupported,
          "eventTypesSupported",
          issues,
        )
      : enumList(
          input.eventTypesSupported,
          "eventTypesSupported",
          PROVIDER_EVENT_TYPES,
          issues,
        )
  ) as readonly ProviderEventType[];
  const minGuestsPerEvent = integerWithDefault(
    input.minGuestsPerEvent,
    "minGuestsPerEvent",
    0,
    100000,
    0,
    issues,
  );
  const maxGuestsPerEvent = integerWithDefault(
    input.maxGuestsPerEvent ?? input.guestCapacity,
    "maxGuestsPerEvent",
    0,
    100000,
    0,
    issues,
  );
  const acceptsMultipleEventsPerDay = booleanWithDefault(
    input.acceptsMultipleEventsPerDay,
    "acceptsMultipleEventsPerDay",
    false,
    issues,
  );
  const maxEventsPerDay = integerWithDefault(
    input.maxEventsPerDay,
    "maxEventsPerDay",
    1,
    100,
    1,
    issues,
  );
  const availableStaffCount = integerWithDefault(
    input.availableStaffCount,
    "availableStaffCount",
    0,
    100000,
    0,
    issues,
  );
  const availableEquipmentCount = integerWithDefault(
    input.availableEquipmentCount,
    "availableEquipmentCount",
    0,
    100000,
    0,
    issues,
  );
  const operatingDays = enumList(
    input.operatingDays,
    "operatingDays",
    PROVIDER_OPERATING_DAYS,
    issues,
  ) as readonly ProviderOperatingDay[];
  const bookingLeadTimeDays = integerWithDefault(
    input.bookingLeadTimeDays,
    "bookingLeadTimeDays",
    0,
    365,
    0,
    issues,
  );
  const unavailableDates = isoDateList(
    input.unavailableDates,
    "unavailableDates",
    issues,
  );
  if (
    maxGuestsPerEvent > 0 &&
    minGuestsPerEvent > maxGuestsPerEvent
  ) {
    issues.push({field: "minGuestsPerEvent", code: "invalid"});
  }
  if (!acceptsMultipleEventsPerDay && maxEventsPerDay !== 1) {
    issues.push({field: "maxEventsPerDay", code: "invalid"});
  }
  const logoUrl = optionalCloudinaryUrl(
    input.logoUrl,
    "logoUrl",
    "logo",
    issues,
  );

  const logoPublicId =
    optionalCloudinaryPublicId(
      input.logoPublicId,
      "logoPublicId",
      "logo",
      issues,
    );

  const coverImageUrl =
    optionalCloudinaryUrl(
      input.coverImageUrl,
      "coverImageUrl",
      "cover",
      issues,
    );

  const coverPublicId =
    optionalCloudinaryPublicId(
      input.coverPublicId,
      "coverPublicId",
      "cover",
      issues,
    );

  if (
    (logoUrl === null) !==
    (logoPublicId === null)
  ) {
    issues.push({
      field: "logoUrl",
      code: "invalid",
    });
  }

  if (
    (coverImageUrl === null) !==
    (coverPublicId === null)
  ) {
    issues.push({
      field: "coverImageUrl",
      code: "invalid",
    });
  }

  const known = new Set<string>(PROVIDER_ONBOARDING_CLIENT_FIELDS);
  for (const field of Object.keys(input)) {
    if (!known.has(field)) issues.push({field, code: "unknown"});
  }
  if (issues.length > 0 || !providerServiceType) {
    return {success: false, issues};
  }

  return {
    success: true,
    value: {
      ownerFirstName,
      ownerLastName,
      businessName,
      businessEmail,
      businessPhone,
      description,
      providerServiceType,
      providerCategory,
      serviceCategories,
      address,
      city,
      province,
      locationCoordinates,
      serviceAreas,
      maxServiceDistanceKm,
      eventTypesSupported,
      minGuestsPerEvent,
      maxGuestsPerEvent,
      acceptsMultipleEventsPerDay,
      maxEventsPerDay,
      availableStaffCount,
      availableEquipmentCount,
      operatingDays,
      bookingLeadTimeDays,
      unavailableDates,
      logoUrl,
      logoPublicId,
      coverImageUrl,
      coverPublicId,
    },
  };
}

export function serviceCategoryMatchesProviderType(
  category: ProviderServiceCategory,
  providerServiceType: ProviderServiceType,
): boolean {
  const isCatering = (CATERING_SERVICE_CATEGORIES as readonly string[])
    .includes(category);
  return providerServiceType === "both" ||
    (providerServiceType === "catering" ? isCatering : !isCatering);
}

function normalize(
  value: unknown,
  aliases: Readonly<Record<string, string>> = {},
): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  return aliases[normalized] ?? normalized;
}

function identityText(
  input: Readonly<Record<string, unknown>>,
  field: string,
  minimum: number,
  maximum: number,
  issues: ProviderValidationIssue[],
): string {
  const raw = input[field];
  if (typeof raw !== "string") {
    issues.push({field, code: "required"});
    return "";
  }
  const value = raw.trim();
  if (value.length < minimum) issues.push({field, code: "too_short"});
  if (value.length > maximum) issues.push({field, code: "too_long"});
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(
  value: unknown,
  field: string,
  issues: ProviderValidationIssue[],
): readonly string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    value.some((item) =>
      typeof item !== "string" ||
      item.trim().length === 0 ||
      item.trim().length > 100
    )
  ) {
    issues.push({field, code: "invalid"});
    return [];
  }
  return [...new Set(value.map((item) => (item as string).trim()))];
}

function enumList<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  issues: ProviderValidationIssue[],
): readonly T[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    value.some((item) => typeof item !== "string" || !allowed.includes(item as T))
  ) {
    issues.push({field, code: "invalid"});
    return [];
  }
  return [...new Set(value)] as T[];
}

function compatibilityEventTypeList(
  value: unknown,
  field: string,
  issues: ProviderValidationIssue[],
): readonly ProviderEventType[] {
  const values = stringList(value, field, issues).map((item) =>
    item.toLowerCase().replaceAll(/[\s-]+/gu, "_")
  );
  if (values.some((item) =>
    !PROVIDER_EVENT_TYPES.includes(item as ProviderEventType)
  )) {
    issues.push({field, code: "invalid"});
    return [];
  }
  return [...new Set(values)] as ProviderEventType[];
}

function serviceCategoryList(
  value: unknown,
  legacyCategory: string,
  providerServiceType: ProviderServiceType | null,
  issues: ProviderValidationIssue[],
): readonly ProviderServiceCategory[] {
  // Legacy records used one open-text category. Preserve them while requiring
  // canonical values whenever the new plural field is supplied.
  if (value === undefined) return [];
  const categories = enumList(
    value,
    "serviceCategories",
    PROVIDER_SERVICE_CATEGORIES,
    issues,
  ) as readonly ProviderServiceCategory[];
  if (categories.length === 0 && legacyCategory.length > 0) {
    return categories;
  }
  if (
    providerServiceType &&
    categories.some((category) =>
      !serviceCategoryMatchesProviderType(category, providerServiceType)
    )
  ) {
    issues.push({field: "serviceCategories", code: "invalid"});
  }
  return categories;
}

function optionalNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  issues: ProviderValidationIssue[],
): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    issues.push({field, code: "invalid"});
    return null;
  }
  return value;
}

function isoDateList(
  value: unknown,
  field: string,
  issues: ProviderValidationIssue[],
): readonly string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 366 ||
    value.some((item) =>
      typeof item !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(item) ||
      Number.isNaN(Date.parse(`${item}T00:00:00Z`))
    )
  ) {
    issues.push({field, code: "invalid"});
    return [];
  }
  return [...new Set(value)].sort();
}

function optionalCoordinates(
  value: unknown,
  issues: ProviderValidationIssue[],
): ProviderLocationCoordinates | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    issues.push({field: "locationCoordinates", code: "invalid"});
    return null;
  }
  const {latitude, longitude} = value;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    issues.push({field: "locationCoordinates", code: "invalid"});
    return null;
  }
  return {latitude, longitude};
}

function integerWithDefault(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  fallback: number,
  issues: ProviderValidationIssue[],
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    issues.push({field, code: "invalid"});
    return fallback;
  }
  return value;
}

function booleanWithDefault(
  value: unknown,
  field: string,
  fallback: boolean,
  issues: ProviderValidationIssue[],
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    issues.push({field, code: "invalid"});
    return fallback;
  }
  return value;
}

function optionalCloudinaryUrl(
  value: unknown,
  field: string,
  mediaType: "logo" | "cover",
  issues: ProviderValidationIssue[],
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > 1000
  ) {
    issues.push({
      field,
      code: "invalid",
    });

    return null;
  }

  try {
    const url = new URL(value);

    const segments = url.pathname
      .split("/")
      .filter(Boolean);

    const uploadIndex =
      segments.indexOf("upload");

    const publicPath = segments
      .slice(uploadIndex + 1)
      .filter(
        (segment) =>
          !/^v\d+$/u.test(segment),
      );

    const hasExpectedPath =
      uploadIndex >= 0 &&
      publicPath.length === 5 &&
      publicPath[0] === "feasta" &&
      publicPath[1] === "providers" &&
      /^[A-Za-z0-9_-]{1,128}$/u.test(
        publicPath[2] ?? "",
      ) &&
      publicPath[3] === "onboarding" &&
      new RegExp(
        `^${mediaType}\\.(?:jpe?g|png|webp)$`,
        "iu",
      ).test(publicPath[4] ?? "");

    if (
      url.protocol !== "https:" ||
      url.hostname !==
        "res.cloudinary.com" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      !hasExpectedPath
    ) {
      issues.push({
        field,
        code: "invalid",
      });

      return null;
    }

    return url.toString();
  } catch {
    issues.push({
      field,
      code: "invalid",
    });

    return null;
  }
}

function optionalCloudinaryPublicId(
  value: unknown,
  field: string,
  mediaType: "logo" | "cover",
  issues: ProviderValidationIssue[],
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > 500
  ) {
    issues.push({
      field,
      code: "invalid",
    });

    return null;
  }

  const pattern = new RegExp(
    "^feasta/providers/" +
      "[A-Za-z0-9_-]{1,128}/" +
      "onboarding/" +
      `${mediaType}$`,
    "u",
  );

  if (!pattern.test(value)) {
    issues.push({
      field,
      code: "invalid",
    });

    return null;
  }

  return value;
}
