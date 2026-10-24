import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveProviderRegistrationState,
} from "../dist/index.js";

const registration = (overrides = {}) => resolveProviderRegistrationState({
  authenticatedUid: "provider-uid",
  phoneAuthenticated: true,
  emailCredentialLinked: true,
  emailVerified: true,
  phoneVerified: true,
  accountClassification: "provider_identity",
  ...overrides,
});

test("provider registration checkpoints are resumable without persisted secrets", () => {
  assert.deepEqual(registration({
    authenticatedUid: null,
    phoneAuthenticated: false,
    phoneVerified: false,
  }), {
    state: "phone_authentication_required",
    resumable: false,
    collision: "none",
    recoveryAction: "authenticate_phone",
  });
  assert.equal(registration({emailCredentialLinked: false}).state,
    "email_credential_link_required");
  assert.equal(registration({accountClassification: "auth_only"}).state,
    "provider_identity_required");
  assert.equal(registration({emailVerified: false}).state,
    "email_verification_required");
  assert.equal(registration().state, "onboarding_ready");
  assert.equal(registration({accountClassification: "registered_provider"}).state,
    "registration_complete");
});

test("one-UID mismatch fails into a safe credential recovery outcome", () => {
  assert.deepEqual(registration({
    linkedCredentialUid: "different-uid",
  }), {
    state: "account_collision",
    resumable: false,
    collision: "credential_belongs_to_another_uid",
    recoveryAction: "sign_in_existing_email_account",
  });
});

test("non-provider and malformed relationships fail closed", () => {
  assert.deepEqual(registration({
    accountClassification: "non_provider_account",
    existingRole: "customer",
  }), {
    state: "account_collision",
    resumable: false,
    collision: "phone_belongs_to_non_provider",
    recoveryAction: "use_correct_feasta_portal",
  });
  assert.deepEqual(registration({
    accountClassification: "malformed_provider_relationship",
  }), {
    state: "account_unavailable",
    resumable: false,
    collision: "provider_relationship_invalid",
    recoveryAction: "contact_support",
  });
});

test("email collisions never imply an automatic merge", () => {
  const outcome = registration({
    collision: "email_belongs_to_another_uid",
  });
  assert.equal(outcome.state, "account_collision");
  assert.equal(outcome.resumable, false);
  assert.equal(outcome.recoveryAction, "sign_in_existing_email_account");
});
