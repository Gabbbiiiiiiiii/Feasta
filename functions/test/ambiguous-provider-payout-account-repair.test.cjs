const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  AMBIGUOUS_PROVIDER_PAYOUT_ACCOUNT_REPAIR_REASON,
  planAmbiguousProviderPayoutAccountRepair,
  providerPayoutCreationFailure,
  shouldCreateProviderPayoutAccount,
} = require("../lib/provider-finance/provider-payment-account-domain.js");

const {
  createPayMongoChildAccount,
} = require("../lib/provider-finance/paymongo-linked-account-client.js");

const inspectedAt = 1759259069000;
const providerId = "provider_ambiguous";

function ambiguousAccount(overrides = {}) {
  return {
    schemaVersion: 1,
    providerId,
    ownerId: "owner_ambiguous",
    linkedAccountType: "merchant",
    setupStatus: "action_required",
    inviteCreationState: "ambiguous",
    payoutReady: false,
    paymongoAccountId: null,
    invitationId: null,
    relationshipId: null,
    relationshipStatus: "unknown",
    settlementTransportMode: "disabled",
    settlementTransportReady: false,
    gatewayLastStatusCode: null,
    updatedAt: {toMillis: () => inspectedAt},
    ...overrides,
  };
}

function planRepair(account, expectedUpdatedAtMillis = inspectedAt) {
  return planAmbiguousProviderPayoutAccountRepair({
    providerId,
    account,
    expectedUpdatedAtMillis,
  });
}

test("an ordinary ambiguous payout record cannot retry", () => {
  const stored = ambiguousAccount();

  assert.equal(shouldCreateProviderPayoutAccount(stored), false);
  assert.equal(shouldCreateProviderPayoutAccount({
    setupStatus: "action_required",
    inviteCreationState: "ambiguous",
    paymongoAccountId: null,
    payoutReady: false,
    gatewayLastStatusCode: null,
  }), false);
});

test("guarded repair resets only an eligible ambiguous record", () => {
  const definitive = providerPayoutCreationFailure({
    certainty: "gateway_rejected",
    statusCode: 401,
    gatewayMessage: "PayMongo linked-account request failed.",
  });
  const patch = planRepair(ambiguousAccount());

  assert.equal(
    AMBIGUOUS_PROVIDER_PAYOUT_ACCOUNT_REPAIR_REASON,
    "Operator confirmed no PayMongo test child account exists after ambiguous Create Account attempt.",
  );
  assert.deepEqual(patch, {
    setupStatus: definitive.setupStatus,
    payoutReady: false,
    inviteCreationState: definitive.inviteCreationState,
  });
  assert.deepEqual(Object.keys(patch).sort(), [
    "inviteCreationState",
    "payoutReady",
    "setupStatus",
  ]);
  assert.equal(patch.payoutReady, false);
});

test("repair rejects a record that already stores an org id", () => {
  assert.throws(
    () => planRepair(ambiguousAccount({
      paymongoAccountId: "org_existingchild",
    })),
    (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /PayMongo account id/u);
      return true;
    },
  );
});

test("repair rejects a record that already stores an invitation id", () => {
  assert.throws(
    () => planRepair(ambiguousAccount({
      invitationId: "lr_existinginvite",
    })),
    (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /invitation id/u);
      return true;
    },
  );
});

test("repair rejects payoutReady true", () => {
  assert.throws(
    () => planRepair(ambiguousAccount({
      payoutReady: true,
    })),
    (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /already payout ready/u);
      return true;
    },
  );
});

test("repair rejects a second use and a changed document", () => {
  const patch = planRepair(ambiguousAccount());
  const repaired = {
    ...ambiguousAccount(),
    ...patch,
    updatedAt: {toMillis: () => inspectedAt + 1000},
  };

  assert.throws(
    () => planRepair(repaired, inspectedAt + 1000),
    (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /not an ambiguous setup/u);
      return true;
    },
  );
  assert.throws(
    () => planRepair(ambiguousAccount(), inspectedAt + 1),
    (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /changed since it was inspected/u);
      return true;
    },
  );
  assert.throws(
    () => planRepair(ambiguousAccount({
      relationshipId: "mr_relationship1",
    })),
    (error) => {
      assert.match(error.message, /settlement identity/u);
      return true;
    },
  );
});

test("a repaired record can make one new Create Account attempt", () => {
  const patch = planRepair(ambiguousAccount());
  const repaired = {
    ...ambiguousAccount(),
    ...patch,
  };

  assert.equal(shouldCreateProviderPayoutAccount(ambiguousAccount()), false);
  assert.equal(shouldCreateProviderPayoutAccount(repaired), true);
  assert.equal(shouldCreateProviderPayoutAccount({
    ...repaired,
    paymongoAccountId: "org_childcreated1",
    inviteCreationState: "created",
    setupStatus: "onboarding",
  }), false);
});

test("HTTP 201 documented account response returns the org id and is not payout ready", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 201,
    json: async () => ({
      data: {
        id: "org_childcreated1",
        type: "merchant",
        activation_status: "pending",
      },
    }),
  });

  try {
    const account = await createPayMongoChildAccount({
      secretKey: "sk_test_secret",
      accountType: "merchant",
      emailAddress: "owner@example.com",
      mobileNumber: "+639171234567",
    });

    assert.equal(account.accountId, "org_childcreated1");
    assert.equal(account.activationStatus, "pending");
    assert.equal(account.payoutReady, undefined);

    const management = readFileSync(
      path.resolve(
        __dirname,
        "../src/provider-finance/provider-payment-account-management.ts",
      ),
      "utf8",
    );
    const createdStart = management.indexOf("createdAccountId =");
    const sessionStart = management.indexOf("const session =");
    const createdWrite = management.slice(createdStart, sessionStart);

    assert.ok(createdStart >= 0);
    assert.ok(sessionStart > createdStart);
    assert.match(createdWrite, /paymongoAccountId:\s*created\.accountId/u);
    assert.match(createdWrite, /payoutReady:\s*false/u);
    assert.doesNotMatch(createdWrite, /payoutReady:\s*true/u);
  } finally {
    global.fetch = originalFetch;
  }
});

test("a malformed 2xx body stays ambiguous and cannot be retried", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 201,
    json: async () => ({
      email: "owner@example.com",
      payoutReady: true,
    }),
  });

  try {
    await assert.rejects(
      () => createPayMongoChildAccount({
        secretKey: "sk_test_secret",
        accountType: "merchant",
        emailAddress: "owner@example.com",
        mobileNumber: "+639171234567",
      }),
      (error) => {
        const failure = providerPayoutCreationFailure({
          certainty: error.certainty,
          statusCode: error.statusCode,
          gatewayMessage: error.message,
        });

        assert.equal(error.statusCode, 201);
        assert.equal(error.payoutReady, undefined);
        assert.equal(failure.inviteCreationState, "ambiguous");
        assert.equal(failure.setupStatus, "action_required");
        assert.equal(shouldCreateProviderPayoutAccount({
          paymongoAccountId: null,
          inviteCreationState: failure.inviteCreationState,
          setupStatus: failure.setupStatus,
          payoutReady: false,
        }), false);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("the repair callable is admin-only and does not call PayMongo", () => {
  const repair = readFileSync(
    path.resolve(
      __dirname,
      "../src/provider-finance/repair-ambiguous-provider-payout-account.ts",
    ),
    "utf8",
  );

  assert.match(repair, /USER_ROLES\.admin/u);
  assert.match(repair, /writeAuditLogInTransaction/u);
  assert.match(repair, /db\.runTransaction/u);
  assert.match(repair, /planAmbiguousProviderPayoutAccountRepair/u);
  assert.match(repair, /payoutReady:\s*patch\.payoutReady/u);
  assert.doesNotMatch(repair, /createPayMongo|paymongo\.com|PAYMONGO_SECRET_KEY/u);
  assert.doesNotMatch(repair, /payoutReady:\s*true/u);
});
