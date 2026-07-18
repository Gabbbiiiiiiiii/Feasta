import { type AccountStatus, type ProviderVerificationStatus, type UserRole } from "./enums.js";
export declare const AUTHENTICATION_GATE_KINDS: readonly ["loading", "unauthenticated", "missingUserProfile", "disabledAuthAccount", "disabledAccount", "blocked", "deactivated", "emailVerificationRequired", "customerReady", "customerPhoneVerificationRequired", "providerBusinessSetupRequired", "providerVerificationDraft", "providerVerificationSubmitted", "providerUnderReview", "providerResubmissionRequired", "providerRejected", "providerSuspended", "providerApproved", "adminReady", "forbiddenRole", "sessionExpired", "configurationError", "invalidAccountState"];
export type AuthenticationGateKind = (typeof AUTHENTICATION_GATE_KINDS)[number];
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
export declare function parseUserRole(value: unknown): UserRole | null;
export declare function parseAccountStatus(value: unknown): AccountStatus | null;
export declare function parseProviderVerificationStatus(value: unknown): ProviderVerificationStatus | null;
export declare function resolveAuthenticationGate(input: AuthenticationGateInput): AuthenticationGateResult;
//# sourceMappingURL=authentication.d.ts.map