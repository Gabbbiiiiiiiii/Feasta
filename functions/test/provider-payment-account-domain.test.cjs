const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  linkedAccountTypeForBusinessRegistration,
  providerPayoutReadinessReason,
  isSafeProviderPaymentAccountReference,
} =
  require(path.resolve(
    __dirname,
    "../lib/provider-finance/provider-payment-account-domain.js",
  ));

test(
  "individual providers map to consumer linked accounts",
  () => {
    assert.equal(
      linkedAccountTypeForBusinessRegistration(
        "individual",
      ),
      "consumer",
    );
  },
);

test(
  "registered businesses map to merchant linked accounts",
  () => {
    assert.equal(
      linkedAccountTypeForBusinessRegistration(
        "registered_business",
      ),
      "merchant",
    );
  },
);

test(
  "unknown registration type fails closed",
  () => {
    assert.throws(
      () =>
        linkedAccountTypeForBusinessRegistration(
          "unknown",
        ),
      /registration type is invalid/u,
    );
  },
);

test(
  "payout setup can be optional without an account",
  () => {
    assert.equal(
      providerPayoutReadinessReason({
        payoutSetupRequired:
          false,

        providerId:
          "provider_one",

        account:
          null,
      }),
      null,
    );
  },
);

test(
  "required payout setup rejects missing or incomplete account",
  () => {
    assert.equal(
      providerPayoutReadinessReason({
        payoutSetupRequired:
          true,

        providerId:
          "provider_one",

        account:
          null,
      }),
      "payout_setup_missing",
    );

    assert.equal(
      providerPayoutReadinessReason({
        payoutSetupRequired:
          true,

        providerId:
          "provider_one",

        account: {
          schemaVersion:
            1,

          providerId:
            "provider_one",

          linkedAccountType:
            "consumer",

          setupStatus:
            "onboarding",

          payoutReady:
            false,
        },
      }),
      "payout_setup_not_ready",
    );
  },
);

test(
  "ready payout account requires safe gateway reference",
  () => {
    assert.equal(
      providerPayoutReadinessReason({
        payoutSetupRequired:
          true,

        providerId:
          "provider_one",

        account: {
          schemaVersion:
            1,

          providerId:
            "provider_one",

          linkedAccountType:
            "merchant",

          setupStatus:
            "ready",

          payoutReady:
            true,

          paymongoAccountId:
            "org_test_provider_one",
        },
      }),
      null,
    );

    assert.equal(
      isSafeProviderPaymentAccountReference(
        "org_test_provider_one",
      ),
      true,
    );

    assert.equal(
      isSafeProviderPaymentAccountReference(
        "4111 1111 1111 1111",
      ),
      false,
    );
  },
);