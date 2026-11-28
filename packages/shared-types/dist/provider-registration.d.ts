import type { UserRole } from "./enums.js";
export declare const PROVIDER_REGISTRATION_STATES: readonly ["phone_authentication_required", "email_credential_link_required", "provider_identity_required", "email_verification_required", "onboarding_ready", "registration_complete", "account_collision", "account_unavailable"];
export type ProviderRegistrationState = (typeof PROVIDER_REGISTRATION_STATES)[number];
export declare const PROVIDER_ACCOUNT_CLASSIFICATIONS: readonly ["auth_only", "provider_identity", "registered_provider", "non_provider_account", "malformed_provider_relationship"];
export type ProviderAccountClassification = (typeof PROVIDER_ACCOUNT_CLASSIFICATIONS)[number];
export declare const PROVIDER_REGISTRATION_COLLISION_OUTCOMES: readonly ["none", "phone_belongs_to_non_provider", "email_belongs_to_another_uid", "credential_belongs_to_another_uid", "provider_relationship_invalid"];
export type ProviderRegistrationCollisionOutcome = (typeof PROVIDER_REGISTRATION_COLLISION_OUTCOMES)[number];
export declare const PROVIDER_REGISTRATION_RECOVERY_ACTIONS: readonly ["authenticate_phone", "link_email_credential", "complete_provider_identity", "verify_email", "continue_onboarding", "resume_existing_provider", "sign_in_existing_email_account", "use_correct_feasta_portal", "contact_support"];
export type ProviderRegistrationRecoveryAction = (typeof PROVIDER_REGISTRATION_RECOVERY_ACTIONS)[number];
/**
 * Non-persisted evidence used to resolve a provider-registration checkpoint.
 * Firebase Auth remains authoritative for credential and verification fields.
 */
export interface ProviderRegistrationStateInput {
    authenticatedUid: string | null;
    linkedCredentialUid?: string | null;
    phoneAuthenticated: boolean;
    emailCredentialLinked: boolean;
    emailVerified: boolean;
    phoneVerified: boolean;
    accountClassification: ProviderAccountClassification;
    existingRole?: UserRole | null;
    collision?: ProviderRegistrationCollisionOutcome;
}
export interface ProviderRegistrationResolution {
    state: ProviderRegistrationState;
    resumable: boolean;
    collision: ProviderRegistrationCollisionOutcome;
    recoveryAction: ProviderRegistrationRecoveryAction;
}
/** Resolves UI/recovery state without granting authorization. */
export declare function resolveProviderRegistrationState(input: ProviderRegistrationStateInput): ProviderRegistrationResolution;
//# sourceMappingURL=provider-registration.d.ts.map