export const USER_ROLES = [
    "customer",
    "provider",
    "admin",
];
export const ACCOUNT_STATUSES = [
    "active",
    "blocked",
    "disabled",
    "pending_deletion",
];
export const PROVIDER_VERIFICATION_STATUSES = [
    "draft",
    "submitted",
    "under_review",
    "resubmission_required",
    "approved",
    "rejected",
    "suspended",
];
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
};
export const VERIFICATION_DOCUMENT_STATUSES = [
    "pending",
    "verified",
    "rejected",
    "expired",
];
export const PROVIDER_SERVICE_TYPES = [
    "catering",
    "addon",
    "both",
];
export const PACKAGE_STATUSES = [
    "draft",
    "active",
    "inactive",
    "archived",
];
export const ADDON_PRICING_TYPES = [
    "fixed",
    "per_guest",
    "per_hour",
    "per_unit",
    "custom_quote",
];
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
];
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
];
export const PROVIDER_REQUEST_TYPES = [
    "catering",
    "addon",
];
export const PAYMENT_STATUSES = [
    "pending",
    "checkout_created",
    "processing",
    "paid",
    "failed",
    "expired",
    "cancelled",
    "refund_pending",
    "partially_refunded",
    "refunded",
];
export const PAYMENT_TYPES = [
    "provider_down_payment",
    "provider_balance",
    "refund",
    "adjustment",
];
export const PAYMENT_GATEWAYS = [
    "paymongo",
];
export const COMPLAINT_STATUSES = [
    "submitted",
    "under_review",
    "awaiting_customer",
    "awaiting_provider",
    "resolved",
    "dismissed",
    "escalated",
    "closed",
];
export const COMPLAINT_PRIORITIES = [
    "low",
    "normal",
    "high",
    "urgent",
];
export const CHAT_ROOM_STATUSES = [
    "active",
    "closed",
    "archived",
];
export const MESSAGE_TYPES = [
    "text",
    "image",
    "file",
    "system",
];
export const REVIEW_MODERATION_STATUSES = [
    "published",
    "hidden",
    "under_review",
    "removed",
];
export const NOTIFICATION_DELIVERY_STATUSES = [
    "pending",
    "sent",
    "failed",
];
export const ANNOUNCEMENT_STATUSES = [
    "draft",
    "scheduled",
    "published",
    "expired",
    "archived",
];
export const ANNOUNCEMENT_AUDIENCES = [
    "everyone",
    "customers",
    "providers",
    "admins",
];
export const BOOKING_RECOVERY_OFFER_STATUSES = [
    "offered",
    "viewed",
    "accepted",
    "rejected",
    "expired",
    "withdrawn",
];
//# sourceMappingURL=enums.js.map