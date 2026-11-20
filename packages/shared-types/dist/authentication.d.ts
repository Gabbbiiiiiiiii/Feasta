import { type AccountStatus, type ProviderVerificationStatus, type UserRole } from "./enums.js";
export declare const AUTHENTICATION_GATE_KINDS: readonly ["loading", "unauthenticated", "missingUserProfile", "disabledAuthAccount", "disabledAccount", "blocked", "deactivated", "emailVerificationRequired", "customerReady", "customerPhoneVerificationRequired", "providerPhoneVerificationRequired", "providerBusinessSetupRequired", "providerVerificationDraft", "providerVerificationSubmitted", "providerUnderReview", "providerResubmissionRequired", "providerRejected", "providerSuspended", "providerApproved", "adminReady", "forbiddenRole", "sessionExpired", "configurationError", "invalidAccountState"];
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
export interface AuthenticationGatePresentation {
    label: string;
    message: string;
    recoveryAction: string | null;
}
/**
 * Canonical user-facing terminology for account-state decisions.
 *
 * Authorization remains a server/backend responsibility. Clients may use this
 * copy to explain a trusted decision, but must never use it to grant access.
 */
export declare const AUTHENTICATION_GATE_PRESENTATION: {
    readonly loading: {
        readonly label: "Checking account";
        readonly message: "FEASTA is checking your account.";
        readonly recoveryAction: null;
    };
    readonly unauthenticated: {
        readonly label: "Sign in required";
        readonly message: "Sign in to continue.";
        readonly recoveryAction: "Sign in";
    };
    readonly missingUserProfile: {
        readonly label: "Profile unavailable";
        readonly message: "We could not find the FEASTA profile for this account.";
        readonly recoveryAction: "Retry or contact FEASTA support";
    };
    readonly disabledAuthAccount: {
        readonly label: "Account disabled";
        readonly message: "This account is disabled. Contact FEASTA support for help.";
        readonly recoveryAction: "Contact FEASTA support";
    };
    readonly disabledAccount: {
        readonly label: "Account disabled";
        readonly message: "This account is disabled. Contact FEASTA support for help.";
        readonly recoveryAction: "Contact FEASTA support";
    };
    readonly blocked: {
        readonly label: "Account blocked";
        readonly message: "This account is blocked. Contact FEASTA support for help.";
        readonly recoveryAction: "Contact FEASTA support";
    };
    readonly deactivated: {
        readonly label: "Account deactivated";
        readonly message: "This account is deactivated. Contact FEASTA support if you want to restore access.";
        readonly recoveryAction: "Contact FEASTA support";
    };
    readonly emailVerificationRequired: {
        readonly label: "Email verification required";
        readonly message: "Verify your email address to continue.";
        readonly recoveryAction: "Check or resend verification";
    };
    readonly customerReady: {
        readonly label: "Customer account ready";
        readonly message: "Your customer account is ready.";
        readonly recoveryAction: null;
    };
    readonly customerPhoneVerificationRequired: {
        readonly label: "Phone verification required";
        readonly message: "Verify your phone number before submitting a booking.";
        readonly recoveryAction: "Verify phone number";
    };
    readonly providerPhoneVerificationRequired: {
        readonly label: "Mobile verification required";
        readonly message: "Verify your mobile number before continuing provider setup.";
        readonly recoveryAction: "Verify mobile number";
    };
    readonly providerBusinessSetupRequired: {
        readonly label: "Business setup required";
        readonly message: "Complete your provider business setup to continue.";
        readonly recoveryAction: "Continue business setup";
    };
    readonly providerVerificationDraft: {
        readonly label: "Verification draft";
        readonly message: "Complete and submit your provider verification documents.";
        readonly recoveryAction: "Continue verification";
    };
    readonly providerVerificationSubmitted: {
        readonly label: "Verification submitted";
        readonly message: "Your provider verification is waiting for FEASTA review.";
        readonly recoveryAction: "View verification status";
    };
    readonly providerUnderReview: {
        readonly label: "Verification under review";
        readonly message: "A FEASTA administrator is reviewing your submission.";
        readonly recoveryAction: "View verification status";
    };
    readonly providerResubmissionRequired: {
        readonly label: "Resubmission required";
        readonly message: "FEASTA requested changes to your verification documents.";
        readonly recoveryAction: "Update verification documents";
    };
    readonly providerRejected: {
        readonly label: "Provider application rejected";
        readonly message: "This provider profile was not approved.";
        readonly recoveryAction: "Review FEASTA feedback";
    };
    readonly providerSuspended: {
        readonly label: "Provider account suspended";
        readonly message: "Provider business operations are currently disabled.";
        readonly recoveryAction: "Contact FEASTA support";
    };
    readonly providerApproved: {
        readonly label: "Provider approved";
        readonly message: "Your provider account is approved.";
        readonly recoveryAction: null;
    };
    readonly adminReady: {
        readonly label: "Admin account ready";
        readonly message: "Your administrator account is ready.";
        readonly recoveryAction: null;
    };
    readonly forbiddenRole: {
        readonly label: "Account not supported";
        readonly message: "This account cannot use the selected FEASTA app or portal.";
        readonly recoveryAction: "Use the correct FEASTA app or portal";
    };
    readonly sessionExpired: {
        readonly label: "Session ended";
        readonly message: "Your session ended. Sign in again to continue.";
        readonly recoveryAction: "Sign in again";
    };
    readonly configurationError: {
        readonly label: "Configuration error";
        readonly message: "FEASTA could not start securely. Please try again later.";
        readonly recoveryAction: "Retry";
    };
    readonly invalidAccountState: {
        readonly label: "Account unavailable";
        readonly message: "This account is in an unsupported state. Contact FEASTA support.";
        readonly recoveryAction: "Contact FEASTA support";
    };
};
export declare function authenticationGatePresentation(kind: AuthenticationGateKind): AuthenticationGatePresentation;
export declare function parseUserRole(value: unknown): UserRole | null;
export declare function parseAccountStatus(value: unknown): AccountStatus | null;
export declare function parseProviderVerificationStatus(value: unknown): ProviderVerificationStatus | null;
export declare function resolveAuthenticationGate(input: AuthenticationGateInput): AuthenticationGateResult;
//# sourceMappingURL=authentication.d.ts.map