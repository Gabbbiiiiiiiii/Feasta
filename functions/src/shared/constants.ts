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
