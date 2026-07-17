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
