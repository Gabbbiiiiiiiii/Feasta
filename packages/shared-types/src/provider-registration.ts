import type {UserRole} from "./enums.js";

export const PROVIDER_REGISTRATION_STATES = [
  "phone_authentication_required",
  "email_credential_link_required",
  "provider_identity_required",
  "email_verification_required",
  "onboarding_ready",
  "registration_complete",
  "account_collision",
  "account_unavailable",
] as const;

export type ProviderRegistrationState =
  (typeof PROVIDER_REGISTRATION_STATES)[number];

export const PROVIDER_ACCOUNT_CLASSIFICATIONS = [
  "auth_only",
  "provider_identity",
  "registered_provider",
  "non_provider_account",
  "malformed_provider_relationship",
] as const;

export type ProviderAccountClassification =
  (typeof PROVIDER_ACCOUNT_CLASSIFICATIONS)[number];

export const PROVIDER_REGISTRATION_COLLISION_OUTCOMES = [
  "none",
  "phone_belongs_to_non_provider",
  "email_belongs_to_another_uid",
  "credential_belongs_to_another_uid",
  "provider_relationship_invalid",
] as const;

export type ProviderRegistrationCollisionOutcome =
  (typeof PROVIDER_REGISTRATION_COLLISION_OUTCOMES)[number];

export const PROVIDER_REGISTRATION_RECOVERY_ACTIONS = [
  "authenticate_phone",
  "link_email_credential",
  "complete_provider_identity",
  "verify_email",
  "continue_onboarding",
  "resume_existing_provider",
  "sign_in_existing_email_account",
  "use_correct_feasta_portal",
  "contact_support",
] as const;

export type ProviderRegistrationRecoveryAction =
  (typeof PROVIDER_REGISTRATION_RECOVERY_ACTIONS)[number];

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
export function resolveProviderRegistrationState(
  input: ProviderRegistrationStateInput,
): ProviderRegistrationResolution {
  const explicitCollision = input.collision ?? "none";
  const uidCollision = input.authenticatedUid &&
    input.linkedCredentialUid &&
    input.authenticatedUid !== input.linkedCredentialUid ?
    "credential_belongs_to_another_uid" :
    "none";
  const collision = uidCollision !== "none" ? uidCollision : explicitCollision;

  if (collision !== "none") {
    return {
      state: "account_collision",
      resumable: false,
      collision,
      recoveryAction: collisionRecoveryAction(collision),
    };
  }

  if (input.accountClassification === "non_provider_account") {
    return {
      state: "account_collision",
      resumable: false,
      collision: "phone_belongs_to_non_provider",
      recoveryAction: "use_correct_feasta_portal",
    };
  }

  if (input.accountClassification === "malformed_provider_relationship") {
    return {
      state: "account_unavailable",
      resumable: false,
      collision: "provider_relationship_invalid",
      recoveryAction: "contact_support",
    };
  }

  if (
    !input.authenticatedUid ||
    !input.phoneAuthenticated ||
    !input.phoneVerified
  ) {
    return {
      state: "phone_authentication_required",
      resumable: false,
      collision: "none",
      recoveryAction: "authenticate_phone",
    };
  }

  if (!input.emailCredentialLinked) {
    return {
      state: "email_credential_link_required",
      resumable: true,
      collision: "none",
      recoveryAction: "link_email_credential",
    };
  }

  if (input.accountClassification === "auth_only") {
    return {
      state: "provider_identity_required",
      resumable: true,
      collision: "none",
      recoveryAction: "complete_provider_identity",
    };
  }

  if (!input.emailVerified) {
    return {
      state: "email_verification_required",
      resumable: true,
      collision: "none",
      recoveryAction: "verify_email",
    };
  }

  if (input.accountClassification === "provider_identity") {
    return {
      state: "onboarding_ready",
      resumable: true,
      collision: "none",
      recoveryAction: "continue_onboarding",
    };
  }

  return {
    state: "registration_complete",
    resumable: true,
    collision: "none",
    recoveryAction: "resume_existing_provider",
  };
}

function collisionRecoveryAction(
  collision: Exclude<ProviderRegistrationCollisionOutcome, "none">,
): ProviderRegistrationRecoveryAction {
  switch (collision) {
  case "email_belongs_to_another_uid":
  case "credential_belongs_to_another_uid":
    return "sign_in_existing_email_account";
  case "phone_belongs_to_non_provider":
    return "use_correct_feasta_portal";
  case "provider_relationship_invalid":
    return "contact_support";
  }
}
