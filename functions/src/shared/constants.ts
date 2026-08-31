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

export function isApprovedProviderForOperations(
  provider: Readonly<Record<string, unknown>>,
): boolean {
  return provider.verificationStatus === "approved" &&
    provider.isActive === true &&
    provider.isSuspended !== true &&
    provider.isDeleted !== true &&
    typeof provider.ownerId === "string" &&
    provider.ownerId.trim().length > 0;
}

export function isProviderPubliclyEligible(
  provider: Readonly<Record<string, unknown>>,
  ownerAccount: Readonly<Record<string, unknown>>,
): boolean {
  const requiredPublicText = [
    provider.businessName,
    provider.description,
    provider.address,
    provider.city,
    provider.province,
  ];
  return isApprovedProviderForOperations(provider) &&
    provider.publiclyVisible !== false &&
    typeof provider.id === "string" &&
    provider.id.trim().length > 0 &&
    parseProviderServiceType(provider.providerServiceType) !== null &&
    requiredPublicText.every(
      (value) => typeof value === "string" && value.trim().length > 0,
    ) &&
    isProviderOwnerAccountActive(provider.id as string, ownerAccount);
}

export function isProviderOwnerAccountActive(
  providerId: string,
  ownerAccount: Readonly<Record<string, unknown>>,
): boolean {
  return ownerAccount.role === USER_ROLES.provider &&
    ownerAccount.providerId === providerId &&
    ownerAccount.accountStatus === "active" &&
    ownerAccount.isActive !== false &&
    ownerAccount.isBlocked !== true;
}

export function shouldPublishProvider(
  provider: Readonly<Record<string, unknown>>,
  ownerAccount: Readonly<Record<string, unknown>>,
): boolean {
  return isProviderPubliclyEligible(
    {...provider, publiclyVisible: true},
    ownerAccount,
  );
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

export interface ProviderCapacityCapabilities {
  requiresGuestCapacity: boolean;
  usesStaffCapacity: boolean;
  usesEquipmentCapacity: boolean;
}

const GUEST_CAPACITY_SERVICE_CATEGORIES = [
  "catering_service",
  "food_trays_packed_meals",
  "venue_provider",
] as const satisfies readonly ProviderServiceCategory[];

const STAFF_CAPACITY_SERVICE_CATEGORIES = [
  "catering_service",
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
] as const satisfies readonly ProviderServiceCategory[];

const EQUIPMENT_CAPACITY_SERVICE_CATEGORIES = [
  "catering_service",
  "catering_event_styling",
  "photographer",
  "videographer",
  "photo_booth",
  "sound_system",
  "lights_and_sounds",
  "decorator_event_stylist",
  "car_rental",
  "venue_provider",
  "tables_chairs_rental",
  "other_event_service",
] as const satisfies readonly ProviderServiceCategory[];

export function providerCapacityCapabilities(
  serviceCategories:
    readonly ProviderServiceCategory[],
): ProviderCapacityCapabilities {
  return {
    requiresGuestCapacity:
      serviceCategories.some(
        (category) =>
          GUEST_CAPACITY_SERVICE_CATEGORIES.includes(
            category as
              (typeof GUEST_CAPACITY_SERVICE_CATEGORIES)[number],
          ),
      ),

    usesStaffCapacity:
      serviceCategories.some(
        (category) =>
          STAFF_CAPACITY_SERVICE_CATEGORIES.includes(
            category as
              (typeof STAFF_CAPACITY_SERVICE_CATEGORIES)[number],
          ),
      ),

    usesEquipmentCapacity:
      serviceCategories.some(
        (category) =>
          EQUIPMENT_CAPACITY_SERVICE_CATEGORIES.includes(
            category as
              (typeof EQUIPMENT_CAPACITY_SERVICE_CATEGORIES)[number],
          ),
      ),
  };
}

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
  "dti_registration",
  "bir_registration",
  "valid_id",
] as const satisfies readonly VerificationDocumentType[];

export const FOOD_SERVICE_CATEGORIES = [
  "catering_service",
  "food_trays_packed_meals",
  "catering_event_styling",
  "cake_provider",
] as const;

export const FOOD_PERMIT_ALTERNATIVES = [
  "sanitary_permit",
  "mayors_permit",
] as const satisfies readonly VerificationDocumentType[];

export interface ProviderVerificationDocumentPolicy {
  requiredAll: readonly VerificationDocumentType[];
  requiredOneOf: readonly (readonly VerificationDocumentType[])[];
}

export function providerVerificationDocumentPolicy(
  provider: Readonly<Record<string, unknown>>,
): ProviderVerificationDocumentPolicy {
  const serviceType = parseProviderServiceType(provider.providerServiceType);
  const categories = Array.isArray(provider.serviceCategories) ?
    provider.serviceCategories.filter(
      (value): value is string => typeof value === "string",
    ) :
    typeof provider.providerCategory === "string" ?
      [provider.providerCategory] :
      [];
  const requiresFoodPermit =
    serviceType === "catering" ||
    serviceType === "both" ||
    categories.some((category) =>
      (FOOD_SERVICE_CATEGORIES as readonly string[]).includes(category)
    );
  const requiresMayorsPermit = categories.includes("venue_provider");
  return {
    requiredAll: [
      ...REQUIRED_VERIFICATION_DOCUMENT_TYPES,
      ...(requiresMayorsPermit ? ["mayors_permit" as const] : []),
    ],
    requiredOneOf: requiresFoodPermit && !requiresMayorsPermit ?
      [FOOD_PERMIT_ALTERNATIVES] :
      [],
  };
}

export function verificationDocumentRequirement(
  type: VerificationDocumentType,
  policy: ProviderVerificationDocumentPolicy,
): "required" | "one_of" | "optional" {
  if (policy.requiredAll.includes(type)) return "required";
  if (policy.requiredOneOf.some((group) => group.includes(type))) {
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

/**
 * Server-owned readiness check for the profile sections required before a
 * provider may submit verification. This intentionally ignores activation,
 * approval, audit, and review fields, which are controlled separately.
 */
export function providerSubmissionProfileIssues(
  provider: Readonly<Record<string, unknown>>,
): readonly string[] {
  const issues = new Set<string>();
  const requiredText = [
    "ownerFirstName",
    "ownerLastName",
    "ownerEmail",
    "ownerPhone",
    "businessName",
    "businessEmail",
    "businessPhone",
    "description",
    "providerCategory",
    "address",
    "city",
    "province",
  ] as const;
  for (const field of requiredText) {
    if (typeof provider[field] !== "string" || provider[field].trim() === "") {
      issues.add(field);
    }
  }
  if (
    typeof provider.description !== "string" ||
    provider.description.trim().length < 20
  ) {
    issues.add("description");
  }
  for (const field of ["ownerEmail", "businessEmail"] as const) {
    if (
      typeof provider[field] !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(provider[field].trim())
    ) {
      issues.add(field);
    }
  }
  for (const field of ["ownerPhone", "businessPhone"] as const) {
    if (
      typeof provider[field] !== "string" ||
      !/^\+[1-9]\d{7,14}$/u.test(provider[field].trim())
    ) {
      issues.add(field);
    }
  }

  const serviceType = parseProviderServiceType(provider.providerServiceType);
  if (!serviceType) issues.add("providerServiceType");
  const serviceCategories = validStringArray(
    provider.serviceCategories,
    PROVIDER_SERVICE_CATEGORIES,
  );
  if (
    serviceCategories.length === 0 ||
    (serviceType && serviceCategories.some((category) =>
      !serviceCategoryMatchesProviderType(category, serviceType)
    ))
  ) {
    issues.add("serviceCategories");
  }
  if (
    validStringArray(provider.eventTypesSupported, PROVIDER_EVENT_TYPES)
      .length === 0
  ) {
    issues.add("eventTypesSupported");
  }
  if (!hasNonEmptyStringArray(provider.serviceAreas)) {
    issues.add("serviceAreas");
  }
  if (
    validStringArray(provider.operatingDays, PROVIDER_OPERATING_DAYS)
      .length === 0
  ) {
    issues.add("operatingDays");
  }

  const capacityCapabilities =
    providerCapacityCapabilities(
      serviceCategories,
    );

  const minimumGuests =
    provider.minGuestsPerEvent;

  const maximumGuests =
    provider.maxGuestsPerEvent;

  if (
    capacityCapabilities.requiresGuestCapacity
  ) {
    if (
      typeof minimumGuests !== "number" ||
      !Number.isInteger(minimumGuests) ||
      minimumGuests < 1 ||
      typeof maximumGuests !== "number" ||
      !Number.isInteger(maximumGuests) ||
      maximumGuests < minimumGuests
    ) {
      issues.add("guestCapacity");
    }
  } else if (
    minimumGuests !== 0 ||
    maximumGuests !== 0
  ) {
    issues.add("guestCapacity");
  }
  if (
    typeof provider.maxEventsPerDay !== "number" ||
    !Number.isInteger(provider.maxEventsPerDay) ||
    provider.maxEventsPerDay < 1 ||
    (
      provider.acceptsMultipleEventsPerDay !== true &&
      provider.maxEventsPerDay !== 1
    )
  ) {
    issues.add("maxEventsPerDay");
  }
  if (
    typeof provider.bookingLeadTimeDays !== "number" ||
    !Number.isInteger(provider.bookingLeadTimeDays) ||
    provider.bookingLeadTimeDays < 0 ||
    provider.bookingLeadTimeDays > 365
  ) {
    issues.add("bookingLeadTimeDays");
  }

  return [...issues].sort();
}

function validStringArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is T =>
      typeof item === "string" && allowed.includes(item as T),
  );
}

function hasNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    );
}

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

export const MAIN_EVENT_STATUSES = [
  "draft",
  "pending_provider_approval",
  "needs_provider_replacement",
  "waiting_for_down_payment",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
] as const;

export type MainEventStatus =
  (typeof MAIN_EVENT_STATUSES)[number];


export const MAIN_EVENT_STATUS_TRANSITIONS = {
  draft: [
    "pending_provider_approval",
    "cancelled",
  ],

  pending_provider_approval: [
    "needs_provider_replacement",
    "waiting_for_down_payment",
    "confirmed",
    "cancelled",
    "expired",
  ],

  needs_provider_replacement: [
    "pending_provider_approval",
    "waiting_for_down_payment",
    "cancelled",
    "expired",
  ],

  waiting_for_down_payment: [
    "needs_provider_replacement",
    "confirmed",
    "cancelled",
    "expired",
  ],

  confirmed: [
    "in_progress",
    "cancelled",
  ],

  in_progress: [
    "completed",
    "cancelled",
  ],

  completed: [],
  cancelled: [],
  expired: [],
} as const satisfies Record<
  MainEventStatus,
  readonly MainEventStatus[]
>;

export function isMainEventStatusTransitionAllowed(
  from: MainEventStatus,
  to: MainEventStatus,
): boolean {
  return (
    MAIN_EVENT_STATUS_TRANSITIONS[
      from
    ] as readonly string[]
  ).includes(to);
}

export function parseMainEventStatus(
  value: unknown,
): MainEventStatus | null {
  const normalized = normalizeStatusValue(
    value,
    {
      pending:
        "pending_provider_approval",
      waitingpayment:
        "waiting_for_down_payment",
    },
  );

  return MAIN_EVENT_STATUSES.includes(
    normalized as MainEventStatus,
  ) ?
    normalized as MainEventStatus :
    null;
}

export const PROVIDER_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
] as const;

export type ProviderRequestStatus =
  (typeof PROVIDER_REQUEST_STATUSES)[number];


export const PROVIDER_REQUEST_STATUS_TRANSITIONS = {
  pending: [
    "accepted",
    "rejected",
    "waiting_for_down_payment",
    "confirmed",
    "cancelled",
    "expired",
  ],

  accepted: [
    "waiting_for_down_payment",
    "confirmed",
    "cancelled",
    "expired",
  ],

  rejected: [],

  waiting_for_down_payment: [
    "payment_processing",
    "confirmed",
    "cancelled",
    "expired",
  ],

  payment_processing: [
    "waiting_for_down_payment",
    "confirmed",
    "cancelled",
    "expired",
  ],

  confirmed: [
    "in_progress",
    "cancelled",
  ],

  in_progress: [
    "completed",
    "cancelled",
  ],

  completed: [],
  cancelled: [],
  expired: [],
} as const satisfies Record<
  ProviderRequestStatus,
  readonly ProviderRequestStatus[]
>;

export function isProviderRequestStatusTransitionAllowed(
  from: ProviderRequestStatus,
  to: ProviderRequestStatus,
): boolean {
  return (
    PROVIDER_REQUEST_STATUS_TRANSITIONS[
      from
    ] as readonly string[]
  ).includes(to);
}

export function parseProviderRequestStatus(
  value: unknown,
): ProviderRequestStatus | null {
  const normalized = normalizeStatusValue(
    value,
    {
      waitingpayment:
        "waiting_for_down_payment",
      paymentprocessing:
        "payment_processing",
    },
  );

  return PROVIDER_REQUEST_STATUSES.includes(
    normalized as ProviderRequestStatus,
  ) ?
    normalized as ProviderRequestStatus :
    null;
}

export const PROVIDER_REQUEST_TYPES = [
  "catering",
  "addon",
] as const;

export type ProviderRequestType =
  (typeof PROVIDER_REQUEST_TYPES)[number];

export function parseProviderRequestType(
  value: unknown,
): ProviderRequestType | null {
  const normalized = normalizeStatusValue(
    value,
    {
      add_on: "addon",
    },
  );

  return PROVIDER_REQUEST_TYPES.includes(
    normalized as ProviderRequestType,
  ) ?
    normalized as ProviderRequestType :
    null;
}

export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "paid",
  "partially_refunded",
  "failed",
  "expired",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_TRANSITIONS = {
  pending: ["processing", "paid", "failed", "expired"],
  processing: ["paid", "failed", "expired"],
  paid: ["partially_refunded", "refunded"],
  partially_refunded: ["refunded"],
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
