import {
  ACCOUNT_STATUSES,
  PROVIDER_VERIFICATION_STATUSES,
  USER_ROLES,
  type AccountStatus,
  type ProviderVerificationStatus,
  type UserRole,
} from "./enums.js";

export const AUTHENTICATION_GATE_KINDS = [
  "loading",
  "unauthenticated",
  "missingUserProfile",
  "disabledAuthAccount",
  "disabledAccount",
  "blocked",
  "deactivated",
  "emailVerificationRequired",
  "customerReady",
  "customerPhoneVerificationRequired",
  "providerBusinessSetupRequired",
  "providerVerificationDraft",
  "providerVerificationSubmitted",
  "providerUnderReview",
  "providerResubmissionRequired",
  "providerRejected",
  "providerSuspended",
  "providerApproved",
  "adminReady",
  "forbiddenRole",
  "sessionExpired",
  "configurationError",
  "invalidAccountState",
] as const;

export type AuthenticationGateKind =
  (typeof AUTHENTICATION_GATE_KINDS)[number];

export interface AuthenticationUserProfileInput {
  role?: unknown;
  accountStatus?: unknown;
  isActive?: unknown;
  isBlocked?: unknown;
  isPhoneVerified?: unknown;
  providerId?: unknown;
}

export interface AuthenticationProviderProfileInput {
  verificationStatus?: unknown;
  isActive?: unknown;
  isSuspended?: unknown;
}

export interface AuthenticationGateInput {
  loading?: boolean;
  configurationError?: boolean;
  authenticated: boolean;
  sessionExpired?: boolean;
  authDisabled?: boolean;
  emailVerified?: boolean;
  userProfile?: AuthenticationUserProfileInput | null;
  providerProfile?: AuthenticationProviderProfileInput | null;
  requiredRoles?: readonly UserRole[];
}

export interface AuthenticationGateResult {
  kind: AuthenticationGateKind;
  role?: UserRole;
  accountStatus?: AccountStatus;
  providerVerificationStatus?: ProviderVerificationStatus;
}

export function parseUserRole(value: unknown): UserRole | null {
  const normalized = normalizeWireValue(value);
  return USER_ROLES.includes(normalized as UserRole)
    ? normalized as UserRole
    : null;
}

export function parseAccountStatus(value: unknown): AccountStatus | null {
  const normalized = normalizeWireValue(value, {
    pendingdeletion: "pending_deletion",
  });
  return ACCOUNT_STATUSES.includes(normalized as AccountStatus)
    ? normalized as AccountStatus
    : null;
}

export function parseProviderVerificationStatus(
  value: unknown,
): ProviderVerificationStatus | null {
  const normalized = normalizeWireValue(value, {
    underreview: "under_review",
    resubmissionrequired: "resubmission_required",
  });
  return PROVIDER_VERIFICATION_STATUSES.includes(
    normalized as ProviderVerificationStatus,
  )
    ? normalized as ProviderVerificationStatus
    : null;
}

export function resolveAuthenticationGate(
  input: AuthenticationGateInput,
): AuthenticationGateResult {
  if (input.configurationError) return {kind: "configurationError"};
  if (input.loading) return {kind: "loading"};
  if (input.sessionExpired) return {kind: "sessionExpired"};
  if (!input.authenticated) return {kind: "unauthenticated"};
  if (input.authDisabled) return {kind: "disabledAuthAccount"};
  if (!input.userProfile) return {kind: "missingUserProfile"};

  const role = parseUserRole(input.userProfile.role);
  const accountStatus = parseAccountStatus(input.userProfile.accountStatus);
  if (!role) return {kind: "forbiddenRole"};
  if (!accountStatus) return {kind: "invalidAccountState", role};
  if (
    typeof input.userProfile.isActive !== "boolean" ||
    typeof input.userProfile.isBlocked !== "boolean"
  ) {
    return {kind: "invalidAccountState", role, accountStatus};
  }

  const context = {role, accountStatus};
  if (
    input.userProfile.isBlocked === true ||
    accountStatus === "blocked"
  ) {
    return {kind: "blocked", ...context};
  }
  if (accountStatus === "pending_deletion") {
    return {kind: "deactivated", ...context};
  }
  if (
    accountStatus === "disabled" ||
    input.userProfile.isActive !== true
  ) {
    return {kind: "disabledAccount", ...context};
  }
  if (accountStatus !== "active") {
    return {kind: "invalidAccountState", ...context};
  }
  if (input.requiredRoles && !input.requiredRoles.includes(role)) {
    return {kind: "forbiddenRole", ...context};
  }
  if (input.emailVerified !== true) {
    return {kind: "emailVerificationRequired", ...context};
  }

  if (role === "customer") {
    return {
      kind: input.userProfile.isPhoneVerified === true
        ? "customerReady"
        : "customerPhoneVerificationRequired",
      ...context,
    };
  }

  if (role === "admin") return {kind: "adminReady", ...context};

  if (
    typeof input.userProfile.providerId !== "string" ||
    input.userProfile.providerId.trim().length === 0 ||
    !input.providerProfile
  ) {
    return {kind: "providerBusinessSetupRequired", ...context};
  }

  const providerVerificationStatus = parseProviderVerificationStatus(
    input.providerProfile.verificationStatus,
  );
  if (!providerVerificationStatus) {
    return {kind: "invalidAccountState", ...context};
  }
  const providerContext = {
    ...context,
    providerVerificationStatus,
  };

  switch (providerVerificationStatus) {
    case "draft":
      return {kind: "providerVerificationDraft", ...providerContext};
    case "submitted":
      return {kind: "providerVerificationSubmitted", ...providerContext};
    case "under_review":
      return {kind: "providerUnderReview", ...providerContext};
    case "resubmission_required":
      return {kind: "providerResubmissionRequired", ...providerContext};
    case "rejected":
      return {kind: "providerRejected", ...providerContext};
    case "suspended":
      return {kind: "providerSuspended", ...providerContext};
    case "approved":
      return input.providerProfile.isActive === true &&
        input.providerProfile.isSuspended !== true
        ? {kind: "providerApproved", ...providerContext}
        : {kind: "invalidAccountState", ...providerContext};
  }
}

function normalizeWireValue(
  value: unknown,
  aliases: Readonly<Record<string, string>> = {},
): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  return aliases[normalized] ?? normalized;
}
