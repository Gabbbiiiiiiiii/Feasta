import "server-only";

import {
  resolveAuthenticationGate,
  type AuthenticationGateResult,
  type AuthenticationProviderProfileInput,
  type UserRole,
} from "@feasta/shared-types";

import type {ServerAccountContext} from "./account-policy";

export type {ServerAccountContext} from "./account-policy";

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
    providerProfile: input.providerProfile ?? (input.account.provider
      ? {
          verificationStatus: input.account.provider.verificationStatus,
          isActive: input.account.provider.isActive,
          isSuspended: input.account.provider.isSuspended,
        }
      : null),
    requiredRoles: input.requiredRoles,
  });
}
