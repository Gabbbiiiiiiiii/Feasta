export const USER_ROLES = [
  "customer",
  "provider",
  "admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

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

export const VERIFICATION_DOCUMENT_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "expired",
] as const;

export type VerificationDocumentStatus =
  (typeof VERIFICATION_DOCUMENT_STATUSES)[number];

export const PROVIDER_SERVICE_TYPES = [
  "catering",
  "addon",
  "both",
] as const;

export type ProviderServiceType =
  (typeof PROVIDER_SERVICE_TYPES)[number];

export const PACKAGE_STATUSES = [
  "draft",
  "active",
  "inactive",
  "archived",
] as const;

export type PackageStatus =
  (typeof PACKAGE_STATUSES)[number];

export const ADDON_PRICING_TYPES = [
  "fixed",
  "per_guest",
  "per_hour",
  "per_unit",
  "custom_quote",
] as const;

export type AddonPricingType =
  (typeof ADDON_PRICING_TYPES)[number];
  

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

export const PROVIDER_REQUEST_TYPES = [
  "catering",
  "addon",
] as const;

export type ProviderRequestType =
  (typeof PROVIDER_REQUEST_TYPES)[number];


export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "paid",
  "failed",
  "expired",
  "refunded",
] as const;

export type PaymentStatus =
  (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_TRANSITIONS = {
  pending: ["processing", "paid", "failed", "expired"],
  processing: ["paid", "failed", "expired"],
  paid: ["refunded"],
  failed: ["processing"],
  expired: ["processing"],
  refunded: [],
} as const satisfies Record<PaymentStatus, readonly PaymentStatus[]>;

export const PAYMENT_TYPES = [
  "provider_down_payment",
  "provider_balance",
  "refund",
  "adjustment",
] as const;

export type PaymentType =
  (typeof PAYMENT_TYPES)[number];

export const PAYMENT_GATEWAYS = [
  "paymongo",
] as const;

export type PaymentGateway =
  (typeof PAYMENT_GATEWAYS)[number];

export const COMPLAINT_STATUSES = [
  "submitted",
  "under_review",
  "awaiting_customer",
  "awaiting_provider",
  "resolved",
  "dismissed",
  "escalated",
  "closed",
] as const;

export type ComplaintStatus =
  (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export type ComplaintPriority =
  (typeof COMPLAINT_PRIORITIES)[number];

export const CHAT_ROOM_STATUSES = [
  "active",
  "closed",
  "archived",
] as const;

export type ChatRoomStatus =
  (typeof CHAT_ROOM_STATUSES)[number];

export const MESSAGE_TYPES = [
  "text",
  "image",
  "file",
  "system",
] as const;

export type MessageType =
  (typeof MESSAGE_TYPES)[number];

export const REVIEW_MODERATION_STATUSES = [
  "published",
  "hidden",
  "under_review",
  "removed",
] as const;

export type ReviewModerationStatus =
  (typeof REVIEW_MODERATION_STATUSES)[number];

export const NOTIFICATION_DELIVERY_STATUSES = [
  "pending",
  "sent",
  "failed",
] as const;

export type NotificationDeliveryStatus =
  (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export const ANNOUNCEMENT_STATUSES = [
  "draft",
  "scheduled",
  "published",
  "expired",
  "archived",
] as const;

export type AnnouncementStatus =
  (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_AUDIENCES = [
  "everyone",
  "customers",
  "providers",
  "admins",
] as const;

export type AnnouncementAudience =
  (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const BOOKING_RECOVERY_OFFER_STATUSES = [
  "offered",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "withdrawn",
] as const;

export type BookingRecoveryOfferStatus =
  (typeof BOOKING_RECOVERY_OFFER_STATUSES)[number];
