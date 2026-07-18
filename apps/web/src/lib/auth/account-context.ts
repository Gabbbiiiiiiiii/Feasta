import "server-only";

import {
  resolveAuthenticationGate,
  type AccountStatus,
  type AuthenticationGateResult,
  type AuthenticationProviderProfileInput,
  type UserRole,
} from "@feasta/shared-types";

export interface ServerAccountContext {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
  accountStatus: AccountStatus;
  isActive: boolean;
  isBlocked: boolean;
  isPhoneVerified: boolean;
  providerId: string | null;
}

export function resolveServerAuthenticationGate(input: {
  account: ServerAccountContext;
  providerProfile?: AuthenticationProviderProfileInput | null;
  requiredRoles?: readonly UserRole[];
}): AuthenticationGateResult {
  return resolveAuthenticationGate({
    authenticated: true,
    emailVerified: input.account.emailVerified,
    userProfile: {
      role: input.account.role,
      accountStatus: input.account.accountStatus,
      isActive: input.account.isActive,
      isBlocked: input.account.isBlocked,
      isPhoneVerified: input.account.isPhoneVerified,
      providerId: input.account.providerId,
    },
    providerProfile: input.providerProfile,
    requiredRoles: input.requiredRoles,
  });
}
