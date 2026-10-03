const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  providerSettlementCapability,
  assertProviderSettlementTransportReady,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "provider-finance",
  "provider-settlement-capability.js",
));

function readyAccount(overrides = {}) {
  return {
    schemaVersion: 1,
    setupStatus: "ready",
    payoutReady: true,
    paymongoAccountId:
      "org_123456789",
    activationStatus:
      "activated",

    relationshipId:
      null,

    relationshipStatus:
      "unknown",

    settlementTransportMode:
      "disabled",

    ...overrides,
  };
}

test(
  "activated child account alone is not settlement transport ready",
  () => {
    const result =
      providerSettlementCapability(
        readyAccount(),
      );

    assert.equal(
      result.accountReady,
      true,
    );

    assert.equal(
      result.transportReady,
      false,
    );

    assert.equal(
      result.reason,
      "relationship_unknown",
    );
  },
);

test(
  "disabled PayMongo relationship blocks settlement transport",
  () => {
    const result =
      providerSettlementCapability(
        readyAccount({
          relationshipStatus:
            "disabled",
        }),
      );

    assert.equal(
      result.relationshipKnown,
      true,
    );

    assert.equal(
      result.relationshipEnabled,
      false,
    );

    assert.equal(
      result.reason,
      "relationship_disabled",
    );
  },
);

test(
  "enabled relationship still fails closed while transport is disabled",
  () => {
    const result =
      providerSettlementCapability(
        readyAccount({
          relationshipStatus:
            "enabled",

          settlementTransportMode:
            "disabled",
        }),
      );

    assert.equal(
      result.relationshipEnabled,
      true,
    );

    assert.equal(
      result.transportReady,
      false,
    );

    assert.equal(
      result.reason,
      "transport_disabled",
    );
  },
);

test(
  "transport mode alone never makes Provider settlement ready",
  () => {
    const capability =
      providerSettlementCapability(
        readyAccount({
          relationshipStatus:
            "enabled",

          settlementTransportMode:
            "wallet_transfer",

          settlementTransportReady:
            false,
        }),
      );

    assert.equal(
      capability.transportMode,
      "wallet_transfer",
    );

    assert.equal(
      capability.transportReady,
      false,
    );

    assert.equal(
      capability.reason,
      "transport_unverified",
    );
  },
);

test(
  "verified wallet transport becomes ready only after explicit server verification",
  () => {
    const capability =
      providerSettlementCapability(
        readyAccount({
          relationshipStatus:
            "enabled",

          settlementTransportMode:
            "wallet_transfer",

          settlementTransportReady:
            true,
        }),
      );

    assert.equal(
      capability.transportMode,
      "wallet_transfer",
    );

    assert.equal(
      capability.transportReady,
      true,
    );

    assert.equal(
      capability.reason,
      "ready",
    );
  },
);

test(
  "linked account is authorization context and is not a settlement transport",
  () => {
    const capability =
      providerSettlementCapability(
        readyAccount({
          relationshipStatus:
            "enabled",

          settlementTransportMode:
            "linked_account",

          settlementTransportReady:
            true,
        }),
      );

    assert.equal(
      capability.transportMode,
      "disabled",
    );

    assert.equal(
      capability.transportReady,
      false,
    );

    assert.equal(
      capability.reason,
      "transport_disabled",
    );
  },
);

test(
  "unknown transport values fail closed",
  () => {
    const result =
      providerSettlementCapability(
        readyAccount({
          relationshipStatus:
            "enabled",

          settlementTransportMode:
            "magic_transport",
        }),
      );

    assert.equal(
      result.transportReady,
      false,
    );

    assert.equal(
      result.transportMode,
      "disabled",
    );
  },
);

test(
  "strict assertion rejects onboarding-only readiness",
  () => {
    assert.throws(
      () =>
        assertProviderSettlementTransportReady(
          readyAccount(),
        ),
      /relationship_unknown/u,
    );
  },
);
test(
  "workflow transport also requires explicit server verification",
  () => {
    const blocked =
      providerSettlementCapability(
        readyAccount({
          relationshipStatus:
            "enabled",

          settlementTransportMode:
            "workflow",

          settlementTransportReady:
            false,
        }),
      );

    assert.equal(
      blocked.transportReady,
      false,
    );

    assert.equal(
      blocked.reason,
      "transport_unverified",
    );

    const ready =
      providerSettlementCapability(
        readyAccount({
          relationshipStatus:
            "enabled",

          settlementTransportMode:
            "workflow",

          settlementTransportReady:
            true,
        }),
      );

    assert.equal(
      ready.transportReady,
      true,
    );
  },
);