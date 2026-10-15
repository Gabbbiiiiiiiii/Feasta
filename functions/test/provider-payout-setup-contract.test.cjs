const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PAYOUT_GATEWAY_AUTHENTICATION_FAILED_MESSAGE,
  PAYOUT_GATEWAY_FORBIDDEN_MESSAGE,
  PAYOUT_GATEWAY_NOT_CONFIGURED_MESSAGE,
  PAYOUT_GATEWAY_NOT_FOUND_DIAGNOSTIC,
  PAYOUT_GATEWAY_NOT_FOUND_MESSAGE,
  PAYOUT_GATEWAY_UPSTREAM_MESSAGE,
  providerPayoutCreationFailure,
  providerPayoutReadinessReason,
  shouldCreateProviderPayoutAccount,
} = require("../lib/provider-finance/provider-payment-account-domain.js");

const {
  rejectBrowserPayoutAuthority,
} = require("../lib/provider-finance/provider-payout-activation-profile.js");

const readyAccount = {
  schemaVersion: 1,
  providerId: "provider_one",
  linkedAccountType: "merchant",
  setupStatus: "ready",
  payoutReady: true,
  paymongoAccountId: "org_ready_provider_one",
};

test("incomplete payout setup cannot satisfy acceptance readiness", () => {
  assert.equal(
    providerPayoutReadinessReason({
      payoutSetupRequired: true,
      providerId: "provider_one",
      account: {
        schemaVersion: 1,
        providerId: "provider_one",
        linkedAccountType: "merchant",
        setupStatus: "unavailable",
        payoutReady: false,
        inviteCreationState: "rejected",
        gatewayLastStatusCode: 404,
      },
    }),
    "payout_setup_not_ready",
  );
});

test("a canonical ready account is accepted by the same readiness contract", () => {
  assert.equal(
    providerPayoutReadinessReason({
      payoutSetupRequired: true,
      providerId: "provider_one",
      account: readyAccount,
    }),
    null,
  );
});

test("a client payoutReady flag cannot bypass an incomplete account", () => {
  assert.equal(
    providerPayoutReadinessReason({
      payoutSetupRequired: true,
      providerId: "provider_one",
      account: {
        ...readyAccount,
        setupStatus: "action_required",
        payoutReady: true,
      },
    }),
    "payout_setup_not_ready",
  );

  assert.equal(
    providerPayoutReadinessReason({
      payoutSetupRequired: true,
      providerId: "provider_one",
      account: {
        ...readyAccount,
        payoutReady: false,
      },
    }),
    "payout_setup_not_ready",
  );
});

test("PayMongo 404 is not classified as a secret-key permission failure", () => {
  const failure = providerPayoutCreationFailure({
    certainty: "gateway_rejected",
    statusCode: 404,
    gatewayMessage: "PayMongo linked-account request failed.",
  });
  const stored = {
    schemaVersion: 1,
    providerId: "provider_one",
    linkedAccountType: "merchant",
    setupStatus: "unavailable",
    payoutReady: false,
    paymongoAccountId: null,
    invitationId: null,
    inviteCreationState: "rejected",
    gatewayLastStatusCode: 404,
  };

  assert.equal(failure.reason, "paymongo_account_endpoint_not_found");
  assert.equal(failure.message, PAYOUT_GATEWAY_NOT_FOUND_MESSAGE);
  assert.equal(failure.diagnostic, PAYOUT_GATEWAY_NOT_FOUND_DIAGNOSTIC);
  assert.doesNotMatch(failure.message, /PAYMONGO_SECRET_KEY/);
  assert.doesNotMatch(failure.message, /cannot call/);
  assert.doesNotMatch(failure.diagnostic, /cannot call/);
  assert.equal(failure.inviteCreationState, "rejected");
  assert.equal(
    providerPayoutReadinessReason({
      payoutSetupRequired: true,
      providerId: "provider_one",
      account: stored,
    }),
    "payout_setup_not_ready",
  );
  assert.equal(shouldCreateProviderPayoutAccount(stored), true);
  assert.equal(shouldCreateProviderPayoutAccount({
    ...stored,
    setupStatus: failure.setupStatus,
    inviteCreationState: failure.inviteCreationState,
  }), true);
});

test("PayMongo 401 is an authentication failure and 403 is a parent permission failure", () => {
  const unauthorized = providerPayoutCreationFailure({
    certainty: "gateway_rejected",
    statusCode: 401,
    gatewayMessage: "PayMongo linked-account request failed.",
  });
  const forbidden = providerPayoutCreationFailure({
    certainty: "gateway_rejected",
    statusCode: 403,
    gatewayMessage: "PayMongo linked-account request failed.",
  });

  assert.equal(unauthorized.reason, "payout_gateway_authentication_failed");
  assert.equal(unauthorized.message, PAYOUT_GATEWAY_AUTHENTICATION_FAILED_MESSAGE);
  assert.equal(unauthorized.inviteCreationState, "rejected");
  assert.equal(forbidden.reason, "payout_gateway_forbidden");
  assert.equal(forbidden.message, PAYOUT_GATEWAY_FORBIDDEN_MESSAGE);
  assert.equal(shouldCreateProviderPayoutAccount({
    paymongoAccountId: null,
    inviteCreationState: unauthorized.inviteCreationState,
    setupStatus: unauthorized.setupStatus,
  }), true);
  assert.equal(shouldCreateProviderPayoutAccount({
    paymongoAccountId: null,
    inviteCreationState: forbidden.inviteCreationState,
    setupStatus: forbidden.setupStatus,
  }), true);
});

test("a missing PayMongo secret is explicit and retryable", () => {
  const failure = providerPayoutCreationFailure({
    certainty: "gateway_rejected",
    statusCode: null,
    gatewayMessage: "PayMongo secret key is not configured.",
  });

  assert.equal(failure.reason, "payout_gateway_not_configured");
  assert.equal(failure.message, PAYOUT_GATEWAY_NOT_CONFIGURED_MESSAGE);
  assert.equal(failure.inviteCreationState, "rejected");
  assert.equal(
    shouldCreateProviderPayoutAccount({
      paymongoAccountId: null,
      inviteCreationState: failure.inviteCreationState,
      setupStatus: failure.setupStatus,
    }),
    true,
  );
});

test("an ambiguous PayMongo result is not retried and is not ready", () => {
  const failure = providerPayoutCreationFailure({
    certainty: "ambiguous",
    statusCode: 503,
    gatewayMessage: "PayMongo linked-account request failed.",
  });
  const timeout = providerPayoutCreationFailure({
    certainty: "ambiguous",
    statusCode: null,
    gatewayMessage: "PayMongo linked-account request outcome is unknown.",
  });

  assert.equal(failure.reason, "payout_gateway_upstream");
  assert.equal(failure.message, PAYOUT_GATEWAY_UPSTREAM_MESSAGE);
  assert.equal(failure.inviteCreationState, "ambiguous");
  assert.equal(timeout.reason, "payout_gateway_upstream");
  assert.equal(timeout.inviteCreationState, "ambiguous");
  assert.equal(
    shouldCreateProviderPayoutAccount({
      paymongoAccountId: null,
      inviteCreationState: "ambiguous",
      setupStatus: "action_required",
    }),
    false,
  );
  assert.equal(
    providerPayoutReadinessReason({
      payoutSetupRequired: true,
      providerId: "provider_one",
      account: {
        schemaVersion: 1,
        providerId: "provider_one",
        linkedAccountType: "consumer",
        setupStatus: failure.setupStatus,
        payoutReady: false,
      },
    }),
    "payout_setup_not_ready",
  );
});

test("an existing child account is resumed instead of created again", () => {
  assert.equal(
    shouldCreateProviderPayoutAccount({
      paymongoAccountId: "org_existing_child",
      inviteCreationState: "rejected",
      setupStatus: "action_required",
    }),
    false,
  );
});

test("a payout-not-ready provider cannot accept and a payout-ready provider can", () => {
  assert.equal(
    providerPayoutReadinessReason({
      payoutSetupRequired: true,
      providerId: "provider_one",
      account: {
        schemaVersion: 1,
        providerId: "provider_one",
        linkedAccountType: "merchant",
        setupStatus: "unavailable",
        payoutReady: false,
        paymongoAccountId: null,
      },
    }),
    "payout_setup_not_ready",
  );
  assert.equal(
    providerPayoutReadinessReason({
      payoutSetupRequired: true,
      providerId: "provider_one",
      account: readyAccount,
    }),
    null,
  );
});

test("PayMongo 400 keeps the validation reason and is not unavailable", () => {
  const failure = providerPayoutCreationFailure({
    certainty: "gateway_rejected",
    statusCode: 400,
    gatewayMessage: "PayMongo linked-account request failed.",
    gatewayCode: "parameter_invalid",
    missingPointers: ["person.email_address"],
  });

  assert.equal(failure.callableStatus, "failed-precondition");
  assert.equal(failure.reason, "payout_setup_not_ready");
  assert.equal(failure.inviteCreationState, "rejected");
  assert.match(failure.message, /person\.email_address/u);
  assert.equal(failure.message.includes("TIN"), false);
  assert.equal(
    shouldCreateProviderPayoutAccount({
      paymongoAccountId: null,
      inviteCreationState: failure.inviteCreationState,
      setupStatus: failure.setupStatus,
    }),
    true,
  );
});

test("PayMongo 429 is rate limited and can be retried", () => {
  const failure = providerPayoutCreationFailure({
    certainty: "ambiguous",
    statusCode: 429,
    gatewayMessage: "PayMongo linked-account request failed.",
    gatewayCode: "rate_limit_exceeded",
  });

  assert.equal(failure.callableStatus, "resource-exhausted");
  assert.equal(failure.reason, "payout_gateway_rate_limited");
  assert.equal(failure.inviteCreationState, "rejected");
  assert.equal(
    shouldCreateProviderPayoutAccount({
      paymongoAccountId: null,
      inviteCreationState: failure.inviteCreationState,
      setupStatus: failure.setupStatus,
    }),
    true,
  );
});

test("a 2xx account response FEASTA cannot verify is not a 503 and is not retried", () => {
  const failure = providerPayoutCreationFailure({
    certainty: "ambiguous",
    statusCode: 201,
    gatewayMessage: "PayMongo account activation status is invalid.",
  });

  assert.equal(failure.callableStatus, "failed-precondition");
  assert.equal(failure.reason, "paymongo_account_response_invalid");
  assert.equal(failure.message, "PayMongo account activation status is invalid.");
  assert.equal(failure.inviteCreationState, "ambiguous");
  assert.equal(
    shouldCreateProviderPayoutAccount({
      paymongoAccountId: null,
      inviteCreationState: failure.inviteCreationState,
      setupStatus: failure.setupStatus,
    }),
    false,
  );
});

test("an unexpected failure is internal and is not retried", () => {
  const failure = providerPayoutCreationFailure({
    certainty: null,
    statusCode: null,
    gatewayMessage: null,
  });

  assert.equal(failure.callableStatus, "internal");
  assert.equal(failure.reason, "payout_setup_unconfirmed");
  assert.equal(failure.inviteCreationState, "ambiguous");
  assert.equal(
    shouldCreateProviderPayoutAccount({
      paymongoAccountId: null,
      inviteCreationState: "ambiguous",
      setupStatus: "action_required",
    }),
    false,
  );
});

test("successful org id storage still does not make payouts ready", () => {
  assert.equal(
    shouldCreateProviderPayoutAccount({
      paymongoAccountId: "org_childcreated1",
      inviteCreationState: "created",
      setupStatus: "onboarding",
      payoutReady: false,
    }),
    false,
  );
  assert.equal(
    providerPayoutReadinessReason({
      payoutSetupRequired: true,
      providerId: "provider_one",
      account: {
        schemaVersion: 1,
        providerId: "provider_one",
        linkedAccountType: "merchant",
        setupStatus: "onboarding",
        payoutReady: false,
        paymongoAccountId: "org_childcreated1",
      },
    }),
    "payout_setup_not_ready",
  );
});

test("browser cannot set payoutReady or attach an org id", () => {
  for (const payload of [
    {payoutReady: true},
    {paymongoAccountId: "org_from_browser"},
    {orgId: "org_from_browser"},
    {childAccountId: "org_from_browser"},
    {child_account_id: "org_from_browser"},
    {accountId: "org_from_browser"},
  ]) {
    assert.throws(
      () => rejectBrowserPayoutAuthority(payload),
      (error) => {
        assert.equal(error.code, "invalid-argument");
        assert.equal(String(error.message).includes("org_from_browser"), false);
        return true;
      },
    );
  }
});
