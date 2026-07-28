import {
  parseAccountStatus,
  parseProviderVerificationStatus,
  parseUserRole,
  type AccountStatus,
  type ProviderVerificationStatus,
  type UserRole,
} from "@feasta/shared-types";

import {isSafeRelativeReturnTo} from "../security/policy.ts";

export interface ServerProviderContext {
  id: string;
  verificationStatus: ProviderVerificationStatus;
  isActive: boolean;
  isSuspended: boolean;
  isDeleted: boolean;
}

export interface ServerAccountContext {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
  accountStatus: AccountStatus;
  isActive: true;
  isBlocked: false;
  isPhoneVerified: boolean;
  providerId: string | null;
  provider: ServerProviderContext | null;
}

export type AccountContextFailureReason =
  | "disabled_auth_account"
  | "missing_user_profile"
  | "missing_customer_profile"
  | "invalid_role"
  | "invalid_account_status"
  | "blocked_account"
  | "deactivated_account"
  | "inactive_account"
  | "invalid_provider_link"
  | "missing_provider_profile"
  | "invalid_provider_status";

export type AccountContextResolution =
  | {ok: true; account: ServerAccountContext}
  | {ok: false; reason: AccountContextFailureReason};

interface AccountPolicyInput {
  uid: string;
  auth: {
    disabled: boolean;
    email?: string | null;
    emailVerified: boolean;
  };
  userProfile: Record<string, unknown> | null;
  customerProfileExists: boolean;
  providerProfile?: (Record<string, unknown> & {id: string}) | null;
}

export function resolveTrustedAccountContext(
  input: AccountPolicyInput,
): AccountContextResolution {
  if (input.auth.disabled) return {ok: false, reason: "disabled_auth_account"};
  const profile = input.userProfile;
  if (!profile) return {ok: false, reason: "missing_user_profile"};

  const role = parseUserRole(profile.role);
  if (!role) return {ok: false, reason: "invalid_role"};
  const accountStatus = parseAccountStatus(profile.accountStatus);
  if (!accountStatus) return {ok: false, reason: "invalid_account_status"};
  if (profile.isBlocked === true || accountStatus === "blocked") {
    return {ok: false, reason: "blocked_account"};
  }
  if (accountStatus === "pending_deletion") {
    return {ok: false, reason: "deactivated_account"};
  }
  if (
    accountStatus !== "active" ||
    profile.isActive !== true ||
    profile.isBlocked !== false
  ) {
    return {ok: false, reason: "inactive_account"};
  }

  const providerId = typeof profile.providerId === "string" &&
    profile.providerId.trim().length > 0
    ? profile.providerId.trim()
    : null;
  if (role !== "provider" && providerId !== null) {
    return {ok: false, reason: "invalid_provider_link"};
  }
  if (role === "customer" && input.customerProfileExists !== true) {
    return {ok: false, reason: "missing_customer_profile"};
  }

  let provider: ServerProviderContext | null = null;
  if (role === "provider" && providerId !== null) {
    const providerProfile = input.providerProfile;
    if (!providerProfile) {
      return {ok: false, reason: "missing_provider_profile"};
    }
    if (providerProfile.id !== providerId || providerProfile.ownerId !== input.uid) {
      return {ok: false, reason: "invalid_provider_link"};
    }
    const verificationStatus = parseProviderVerificationStatus(
      providerProfile.verificationStatus,
    );
    if (!verificationStatus) {
      return {ok: false, reason: "invalid_provider_status"};
    }
    provider = {
      id: providerId,
      verificationStatus,
      isActive: providerProfile.isActive === true,
      isSuspended: providerProfile.isSuspended === true,
      isDeleted: providerProfile.isDeleted === true,
    };
  }

  return {
    ok: true,
    account: {
      uid: input.uid,
      email: input.auth.email ?? null,
      emailVerified: input.auth.emailVerified,
      role,
      accountStatus,
      isActive: true,
      isBlocked: false,
      isPhoneVerified: profile.isPhoneVerified === true,
      providerId,
      provider,
    },
  };
}

export function accountHomePath(role: UserRole): string {
  return `/${role}`;
}

export function safeReturnPathForAccount(
  value: unknown,
  account: Pick<ServerAccountContext, "role">,
): string {
  const home = accountHomePath(account.role);
  if (!isSafeRelativeReturnTo(value)) {
    return home;
  }
  return value === home || value.startsWith(`${home}/`) ? value : home;
}

export function providerAccessDestination(
  account: Pick<ServerAccountContext, "provider">,
): string {
  const provider = account.provider;
  if (!provider) return "/provider/onboarding";
  switch (provider.verificationStatus) {
    case "approved":
      return provider.isActive && !provider.isSuspended && !provider.isDeleted
        ? "/provider"
        : "/provider/status";
    case "draft":
    case "resubmission_required":
      return "/provider/verification";
    case "submitted":
    case "under_review":
    case "rejected":
    case "suspended":
      return "/provider/status";
  }
}
