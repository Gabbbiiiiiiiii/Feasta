import type {
  AdminAuditLog,
  AdminAuditLogCategory,
  AdminAuditLogCategoryFilter,
  AdminAuditLogDetail,
  AdminAuditLogFilters,
  AdminAuditLogPreviewField,
} from "@/lib/admin/audit-logs/admin-audit-log-types";

const NOT_RECORDED = "Not recorded";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 30;
const MAX_SEARCH_LENGTH = 120;
const MAX_FILTER_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 180;
const MAX_DETAIL_TEXT_LENGTH = 500;
const MAX_PREVIEW_FIELDS = 12;
const MAX_PREVIEW_VALUE_LENGTH = 160;

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const sensitiveTerms = [
  "password",
  "passcode",
  "secret",
  "token",
  "credential",
  "authorization",
  "cookie",
  "note",
  "reason",
  "private_note",
  "privatenote",
  "admin_note",
  "adminnote",
  "card",
  "cvv",
  "cvc",
  "bank",
  "account_number",
  "accountnumber",
  "access_key",
  "accesskey",
  "refresh_key",
  "refreshkey",
  "session",
] as const;

export type NormalizedAdminAuditLogFilters = AdminAuditLogFilters & {
  category: AdminAuditLogCategoryFilter;
  fromMilliseconds: number | null;
  toMilliseconds: number | null;
};

export type NormalizedAdminAuditLogRecord = {
  auditLog: AdminAuditLog;
  detail: AdminAuditLogDetail;
  createdAtMilliseconds: number | null;
};

export function normalizeAdminAuditLogFilters(
  input: AdminAuditLogFilters,
): NormalizedAdminAuditLogFilters {
  const fromDate = normalizeDateInput(input.fromDate);
  const toDate = normalizeDateInput(input.toDate);
  const fromMilliseconds = fromDate
    ? Date.parse(`${fromDate}T00:00:00.000+08:00`)
    : null;
  const toMilliseconds = toDate
    ? Date.parse(`${toDate}T23:59:59.999+08:00`)
    : null;

  if (
    fromMilliseconds !== null &&
    toMilliseconds !== null &&
    fromMilliseconds > toMilliseconds
  ) {
    throw new Error("The start date cannot be after the end date.");
  }

  return {
    search: boundedText(input.search, MAX_SEARCH_LENGTH),
    category: normalizeCategoryFilter(input.category),
    action: normalizeFilter(input.action),
    actorRole: normalizeFilter(input.actorRole),
    source: normalizeFilter(input.source),
    targetCollection: normalizeFilter(input.targetCollection),
    fromDate,
    toDate,
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Number.isSafeInteger(input.pageSize)
          ? input.pageSize
          : DEFAULT_PAGE_SIZE,
      ),
    ),
    cursor:
      typeof input.cursor === "string" && input.cursor.length <= 500
        ? input.cursor || null
        : null,
    fromMilliseconds,
    toMilliseconds,
  };
}

export function normalizeAdminAuditLogRecord(
  id: string,
  data: Record<string, unknown>,
): NormalizedAdminAuditLogRecord {
  const createdAtMilliseconds = timestampMilliseconds(data.createdAt);
  const action = recordedText(data.action, "unknown_action");
  const actorId = recordedText(data.actorId, NOT_RECORDED);
  const actorRole = recordedText(data.actorRole, NOT_RECORDED);
  const targetCollection = recordedText(
    data.targetCollection,
    recordedText(data.entity, NOT_RECORDED),
  );
  const targetId = recordedText(
    data.targetId,
    recordedText(data.entityId, NOT_RECORDED),
  );
  const source = recordedText(data.source, NOT_RECORDED);
  const correlationId = nullableBoundedText(data.correlationId, 150);
  const outcome = nullableBoundedText(data.outcome, 80);
  const reasonCode = nullableBoundedText(data.reasonCode, 120);
  const description = nullableBoundedText(
    data.description,
    MAX_DETAIL_TEXT_LENGTH,
  );

  const auditLog: AdminAuditLog = {
    id: boundedText(id, 150) || "unknown",
    createdAt:
      createdAtMilliseconds === null
        ? null
        : new Date(createdAtMilliseconds).toISOString(),
    action,
    category: classifyAuditCategory({
      action,
      actorRole,
      targetCollection,
    }),
    actorId,
    actorRole,
    targetCollection,
    targetId,
    source,
    correlationId,
    outcome,
    reasonCode,
    summary: createSummary({
      description,
      outcome,
      reasonCode,
      before: data.before,
      after: data.after,
    }),
  };

  return {
    auditLog,
    createdAtMilliseconds,
    detail: {
      ...auditLog,
      description,
      beforePreview: previewRecord(data.before),
      afterPreview: previewRecord(data.after),
      metadataPreview: previewRecord(data.metadata ?? data.details),
    },
  };
}

export function adminAuditLogMatchesFilters(
  record: NormalizedAdminAuditLogRecord,
  filters: NormalizedAdminAuditLogFilters,
): boolean {
  const auditLog = record.auditLog;

  if (
    filters.category !== "all" &&
    (auditLog.category ??
      classifyAuditCategory({
        action: auditLog.action,
        actorRole: auditLog.actorRole,
        targetCollection: auditLog.targetCollection,
      })) !== filters.category
  ) {
    return false;
  }
  if (filters.action !== "all" && auditLog.action !== filters.action) {
    return false;
  }
  if (
    filters.actorRole !== "all" &&
    auditLog.actorRole !== filters.actorRole
  ) {
    return false;
  }
  if (filters.source !== "all" && auditLog.source !== filters.source) {
    return false;
  }
  if (
    filters.targetCollection !== "all" &&
    auditLog.targetCollection !== filters.targetCollection
  ) {
    return false;
  }
  if (
    filters.fromMilliseconds !== null &&
    (record.createdAtMilliseconds === null ||
      record.createdAtMilliseconds < filters.fromMilliseconds)
  ) {
    return false;
  }
  if (
    filters.toMilliseconds !== null &&
    (record.createdAtMilliseconds === null ||
      record.createdAtMilliseconds > filters.toMilliseconds)
  ) {
    return false;
  }

  if (!filters.search) return true;

  const query = filters.search.toLocaleLowerCase("en-PH");
  return [
    auditLog.actorId,
    auditLog.targetId,
    auditLog.correlationId,
    auditLog.action,
  ].some(
    (value) =>
      value !== null &&
      value !== NOT_RECORDED &&
      value.toLocaleLowerCase("en-PH").includes(query),
  );
}

export function timestampMilliseconds(value: unknown): number | null {
  if (value instanceof Date) return finiteMilliseconds(value.getTime());
  if (typeof value === "string" || typeof value === "number") {
    return finiteMilliseconds(
      typeof value === "number" ? value : Date.parse(value),
    );
  }
  if (!isRecord(value)) return null;

  if (typeof value.toMillis === "function") {
    try {
      return finiteMilliseconds(
        (value.toMillis as () => number).call(value),
      );
    } catch {
      return null;
    }
  }

  if (typeof value.toDate === "function") {
    try {
      const date = (value.toDate as () => unknown).call(value);
      return date instanceof Date
        ? finiteMilliseconds(date.getTime())
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

function createSummary({
  description,
  outcome,
  reasonCode,
  before,
  after,
}: {
  description: string | null;
  outcome: string | null;
  reasonCode: string | null;
  before: unknown;
  after: unknown;
}): string {
  if (description) return boundedText(description, MAX_SUMMARY_LENGTH);

  const transition = primaryStatusTransition(before, after);
  if (transition) return transition;

  const changedFields = changedSafeFields(before, after);
  if (changedFields.length > 0) {
    return `Updated: ${changedFields.join(", ")}`;
  }
  if (outcome) return `Result: ${humanize(outcome)}`;
  if (reasonCode) return `Reason: ${humanize(reasonCode)}`;
  return "Recorded activity";
}

function primaryStatusTransition(
  before: unknown,
  after: unknown,
): string | null {
  const beforeRecord = isRecord(before) ? before : null;
  const afterRecord = isRecord(after) ? after : null;
  const statusFields: Array<[string, string]> = [
    ["status", "Status"],
    ["verificationStatus", "Verification"],
    ["moderationStatus", "Visibility"],
    ["accountStatus", "Account status"],
    ["paymentStatus", "Payment status"],
  ];

  for (const [field, label] of statusFields) {
    const beforeValue =
      beforeRecord && typeof beforeRecord[field] === "string"
        ? boundedText(beforeRecord[field], 60)
        : "";
    const afterValue =
      afterRecord && typeof afterRecord[field] === "string"
        ? boundedText(afterRecord[field], 60)
        : "";

    if (beforeValue && afterValue && beforeValue !== afterValue) {
      return `${label}: ${humanize(beforeValue)} → ${humanize(afterValue)}`;
    }
    if (!beforeValue && afterValue) {
      return `${label}: ${humanize(afterValue)}`;
    }
  }

  return null;
}

function changedSafeFields(before: unknown, after: unknown): string[] {
  if (!isRecord(before) || !isRecord(after)) return [];

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const safeKeys = keys
    .filter((key) => !isSensitiveKey(key))
    .filter((key) => before[key] !== after[key])
    .slice(0, 6)
    .map((key) => humanize(boundedText(key, 60)));

  if (keys.length > safeKeys.length && safeKeys.length === 6) {
    safeKeys.push("Additional Fields");
  }
  return safeKeys;
}

function previewRecord(value: unknown): AdminAuditLogPreviewField[] {
  if (!isRecord(value)) return [];

  return Object.entries(value)
    .slice(0, MAX_PREVIEW_FIELDS)
    .map(([rawKey, rawValue]) => {
      const key = boundedText(rawKey, 80) || "Unnamed field";
      const redacted = isSensitiveKey(key);
      return {
        key,
        redacted,
        value: redacted ? "Redacted" : previewValue(rawValue),
      };
    });
}

function previewValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    return boundedText(value, MAX_PREVIEW_VALUE_LENGTH) || "Empty string";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "Invalid number";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  const milliseconds = timestampMilliseconds(value);
  if (milliseconds !== null) return new Date(milliseconds).toISOString();
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (isRecord(value)) return "Nested object";
  return "Unsupported value";
}

function normalizeFilter(value: unknown): string {
  if (value === "all") return "all";
  return boundedText(value, MAX_FILTER_LENGTH) || "all";
}

function normalizeDateInput(value: unknown): string {
  if (typeof value !== "string" || !datePattern.test(value)) return "";
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString().slice(0, 10) === value
    ? value
    : "";
}

function recordedText(value: unknown, fallback: string): string {
  return nullableBoundedText(value, MAX_FILTER_LENGTH) ?? fallback;
}

function nullableBoundedText(
  value: unknown,
  maximumLength: number,
): string | null {
  const normalized = boundedText(value, maximumLength);
  return normalized || null;
}

function boundedText(value: unknown, maximumLength: number): string {
  return typeof value === "string"
    ? value
        .replace(/[\p{Cc}]/gu, " ")
        .trim()
        .slice(0, maximumLength)
    : "";
}

const RECORD_TYPE_LABELS: Record<string, string> = {
  mainEvents: "Bookings",
  providerRequests: "Service bookings",
  providers: "Providers",
  providerVerifications: "Provider verifications",
  users: "Users",
  customers: "Customers",
  payments: "Payments",
  refunds: "Refunds",
  reviews: "Reviews",
  complaints: "Complaints",
  announcements: "Announcements",
  serviceCategories: "Service categories",
  documentTypes: "Verification documents",
  verificationDocumentTypes: "Verification documents",
  platformSettings: "Platform settings",
  settings: "Platform settings",
  companyCommissionMockWithdrawals: "FEASTA fee withdrawals",
  companyFinance: "FEASTA finance",
  financialLedgerEntries: "Financial ledger",
  walkInBookings: "Walk-in bookings",
  packages: "Packages",
  providerServices: "Provider services",
  specialRequests: "Special requests",
  providerOccasionSuggestions: "Occasion suggestions",
  providerPayoutAccounts: "Provider payout accounts",
  providerDisbursements: "Provider disbursements",
};

const NOISE_AUDIT_ACTIONS = new Set([
  "unknown_action",
  "booking.preparation_automatic",
  "booking.service_start_automatic",
  "payment.checkout_attempt_created",
  "payment.checkout_attempt_retry",
  "payment.checkout_attempt_reconciled",
  "payment.attempt_evidence_conflict",
  "payment.checkout_attempt_ambiguous",
  "refund_calculation.created",
  "refund_reservation.created",
  "refund_eligibility.stage_advanced",
  "refund_eligibility_stage_advance",
  "refund_reconciliation.replayed",
  "provider_request.acceptance_recovered",
  "account_email_synchronized",
  "phone_verification_synchronized",
  "provider_phone_verification_prepared",
  "customer_preferences_updated",
  "account_preferences_updated",
  "customer_profile_updated",
  "provider_account_profile_updated",
  "admin_profile_updated",
  "announcement_created",
  "announcement_updated",
  "idempotency_replay",
  "authority_initialized",
  "fixed_v2_in_place_recovery",
  "occasion_atomic_withdraw_lock",
  "occasion_withdraw_batch",
  "verify_provider_test_settlement_transport",
  "chat_access",
]);

const NOISE_ACTION_FRAGMENTS = [
  "onboarding_draft",
  "draft_saved",
  "availability",
  "synchronized",
  "automatic",
  "reconciled",
  "replayed",
  "checkout_attempt",
  "checkout_outcome",
  "attempt_evidence",
  "refund_calculation",
  "refund_reservation",
  "eligibility_stage",
] as const;

const MONEY_COLLECTIONS = new Set([
  "payments",
  "refunds",
  "companyCommissionMockWithdrawals",
  "companyFinance",
  "financialLedgerEntries",
  "providerDisbursements",
  "providerPayoutAccounts",
  "providerPaymentAccounts",
]);

const GOVERNANCE_COLLECTIONS = new Set([
  "platformSettings",
  "settings",
  "serviceCategories",
  "documentTypes",
  "verificationDocumentTypes",
  "announcements",
  "agreementTemplates",
  "agreementTypes",
  "providerVerifications",
  "providerOccasionSuggestions",
]);

const ACTION_LABELS: Record<string, string> = {
  "booking.submitted": "Booking submitted",
  "special_request.converted_to_booking": "Special request converted to booking",
  provider_verification_approved: "Approved provider verification",
  provider_verification_rejected: "Rejected provider verification",
  provider_verification_submitted: "Submitted verification application",
  provider_verification_decision: "Reviewed provider verification",
  provider_verification_document_removed: "Removed verification document",
  user_account_blocked: "Blocked user account",
  user_account_access_restored: "Restored user access",
  customer_account_deactivated: "Deactivated customer account",
  provider_account_deactivated: "Deactivated provider account",
  account_sessions_revoked: "Revoked user sessions",
  customer_sessions_revoked: "Revoked customer sessions",
  account_security_state_changed: "Updated account security",
  account_access_denied: "Blocked unauthorized access",
  role_access_denied: "Blocked role access",
  rate_limit_rejected: "Blocked excessive requests",
  review_hidden: "Hid customer review",
  review_restored: "Restored customer review",
  review_report_dismissed: "Dismissed review report",
  review_deleted_by_customer: "Customer deleted review",
  announcement_published: "Published announcement",
  announcement_archived: "Archived announcement",
  complaint_created: "Submitted complaint",
  complaint_start_review: "Started complaint review",
  complaint_request_customer_response: "Requested customer response",
  complaint_request_provider_response: "Requested provider response",
  complaint_escalate: "Escalated complaint",
  complaint_resolve: "Resolved complaint",
  complaint_dismiss: "Dismissed complaint",
  complaint_close: "Closed complaint",
  complaint_reopen: "Reopened complaint",
  "payment.created": "Created customer payment",
  payment_webhook: "Payment status updated",
  sandbox_mock_checkout_completed: "Completed payment checkout",
  "initial_payment.expired": "Initial payment expired",
  "initial_payment.review_required": "Payment requires review",
  "payment.remaining_balance_enforcement": "Enforced balance deadline",
  "refund_execution.failed": "Refund failed",
  "cancellation_request.submitted": "Submitted cancellation request",
  "cancellation_request.rejected": "Rejected cancellation request",
  "cancellation_policy.admin_default_updated": "Updated default cancellation policy",
  "cancellation_policy.provider_updated": "Updated provider cancellation policy",
  "customer_violation.issued": "Issued customer violation",
  "customer_violation.reversed": "Reversed customer violation",
  "customer_violation.restriction_ended": "Ended customer restriction",
  "customer_violation.review_required": "Violation requires review",
  "customer_violation.recovery_requested": "Requested account recovery",
  "provider.agreement_accepted": "Accepted provider agreement",
  "provider.business_profile_updated": "Updated business profile",
  "provider_request.arranged_payment_offered": "Offered arranged payment",
  service_category_created: "Added service category",
  service_category_updated: "Updated service category",
  service_category_deleted: "Deleted service category",
  business_document_type_created: "Added verification document type",
  business_document_type_updated: "Updated verification document type",
  business_document_type_deleted: "Deleted verification document type",
  agreement_template_created: "Created agreement template",
  agreement_template_updated: "Updated agreement template",
  agreement_template_deleted: "Deleted agreement template",
  agreement_type_updated: "Updated agreement type",
  occasion_activate: "Activated occasion",
  occasion_deactivate: "Deactivated occasion",
};

export function isMeaningfulAuditLog(auditLog: Pick<AdminAuditLog, "action">): boolean {
  const normalized = auditLog.action.trim().toLocaleLowerCase("en-PH");
  if (!normalized || NOISE_AUDIT_ACTIONS.has(normalized)) return false;
  const canonical = normalized.replaceAll(".", "_").replaceAll("-", "_");
  if (NOISE_AUDIT_ACTIONS.has(canonical)) return false;
  return !NOISE_ACTION_FRAGMENTS.some((fragment) => canonical.includes(fragment));
}

export function classifyAuditCategory(input: {
  action: string;
  actorRole: string;
  targetCollection: string;
}): AdminAuditLogCategory {
  const action = input.action.trim().toLocaleLowerCase("en-PH");
  const role = input.actorRole.trim().toLocaleLowerCase("en-PH");

  if (
    MONEY_COLLECTIONS.has(input.targetCollection) ||
    action.startsWith("payment") ||
    action.startsWith("refund") ||
    action.startsWith("initial_payment") ||
    action.includes("commission") ||
    action.includes("withdrawal") ||
    action.includes("disbursement") ||
    action.includes("checkout") ||
    action.includes("payout")
  ) {
    return "money";
  }

  if (
    action.includes("blocked") ||
    action.includes("access_restored") ||
    action.includes("access_denied") ||
    action.includes("deactivated") ||
    action.includes("sessions_revoked") ||
    action.includes("security_state") ||
    action.includes("violation") ||
    action.includes("rate_limit") ||
    action.includes("agreement_accepted") ||
    action.includes("suspended")
  ) {
    return "security";
  }

  if (role === "admin" || GOVERNANCE_COLLECTIONS.has(input.targetCollection)) {
    return "admin";
  }

  return "bookings";
}

export function formatAuditAction(action: string): string {
  const trimmed = action.trim();
  if (!trimmed) return "Activity";
  if (Object.hasOwn(ACTION_LABELS, trimmed)) {
    return ACTION_LABELS[trimmed];
  }
  const lower = trimmed.toLocaleLowerCase("en-PH");
  if (Object.hasOwn(ACTION_LABELS, lower)) {
    return ACTION_LABELS[lower];
  }
  return trimmed
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./u, (character) => character.toUpperCase());
}

export function formatAuditCategory(category: AdminAuditLogCategory): string {
  switch (category) {
    case "admin":
      return "Admin actions";
    case "money":
      return "Payments & refunds";
    case "bookings":
      return "Bookings & disputes";
    case "security":
      return "Account & security";
  }
}

function normalizeCategoryFilter(value: unknown): AdminAuditLogCategoryFilter {
  if (
    value === "admin" ||
    value === "money" ||
    value === "bookings" ||
    value === "security"
  ) {
    return value;
  }
  return "all";
}

export function formatAuditRecordType(collection: string): string {
  const trimmed = collection.trim();
  if (!trimmed || trimmed === NOT_RECORDED) return NOT_RECORDED;
  if (Object.hasOwn(RECORD_TYPE_LABELS, trimmed)) {
    return RECORD_TYPE_LABELS[trimmed];
  }
  return trimmed
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/^./u, (character) => character.toUpperCase());
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function isSensitiveKey(value: string): boolean {
  const normalized = value
    .toLocaleLowerCase("en-PH")
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
  return sensitiveTerms.some((term) => normalized.includes(term));
}

function finiteMilliseconds(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
