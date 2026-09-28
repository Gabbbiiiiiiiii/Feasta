const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  activatePayMongoChildAccount,
  buildPayMongoLinkedAccountSignupUrl,
  createPayMongoChildAccount,
  createPayMongoIdentityVerificationSession,
  parsePayMongoLinkedAccountInvitation,
  parsePayMongoLinkedAccountInviteResponse,
  parsePayMongoLinkedAccountResource,
  updatePayMongoChildAccount,
} =
  require(path.resolve(
    __dirname,
    "../lib/provider-finance/paymongo-linked-account-client.js",
  ));

test(
  "parses one safe PayMongo invitation",
  () => {
    const result =
      parsePayMongoLinkedAccountInviteResponse({
        success_count: 1,
        failed_count: 0,

        invites: [
          {
            email:
              "provider@example.com",

            account_type:
              "merchant",

            invitation_id:
              "lr_testinvite123",

            status:
              "pending",
          },
        ],
      });

    assert.deepEqual(
      result,
      {
        invitationId:
          "lr_testinvite123",

        email:
          "provider@example.com",

        accountType:
          "merchant",

        status:
          "pending",

        childAccountId:
          null,
      },
    );
  },
);

test(
  "parses accepted invitation and child account reference",
  () => {
    const result =
      parsePayMongoLinkedAccountInvitation({
        invitation_id:
          "lr_testinvite456",

        email:
          "individual@example.com",

        account_type:
          "consumer",

        status:
          "accepted",

        child_account_id:
          "org_child12345",
      });

    assert.equal(
      result.status,
      "accepted",
    );

    assert.equal(
      result.childAccountId,
      "org_child12345",
    );
  },
);

test(
  "account parser deliberately returns only safe identity and status",
  () => {
    const result =
      parsePayMongoLinkedAccountResource({
        data: {
          id:
            "org_child12345",

          type:
            "merchant",

          activation_status:
            "activated",

          person: {
            first_name:
              "Sensitive",
          },

          bank: {
            account_name:
              "Sensitive",

            account_number:
              "1234567890",

            bank_name:
              "Sensitive Bank",
          },

          business: {
            tin:
              "123456789",
          },
        },
      });

    assert.deepEqual(
      result,
      {
        accountId:
          "org_child12345",

        accountType:
          "merchant",

        activationStatus:
          "activated",

        identityVerificationStatus:
          null,

        relationshipId:
          null,

        legalIdentityPresent:
          false,
      },
    );

    assert.equal(
      Object.hasOwn(
        result,
        "bank",
      ),
      false,
    );

    assert.equal(
      Object.hasOwn(
        result,
        "person",
      ),
      false,
    );
  },
);

test(
  "signup URL safely encodes provider email and invitation",
  () => {
    const value =
      buildPayMongoLinkedAccountSignupUrl({
        email:
          "provider+events@example.com",

        invitationId:
          "lr_testinvite789",
      });

    const url =
      new URL(value);

    assert.equal(
      url.origin,
      "https://dashboard.paymongo.com",
    );

    assert.equal(
      url.pathname,
      "/signup",
    );

    assert.equal(
      url.searchParams.get(
        "email",
      ),
      "provider+events@example.com",
    );

    assert.equal(
      url.searchParams.get(
        "invitation_code",
      ),
      "lr_testinvite789",
    );
  },
);

test(
  "unknown invitation or activation statuses fail closed",
  () => {
    assert.throws(
      () =>
        parsePayMongoLinkedAccountInvitation({
          invitation_id:
            "lr_testinvite000",

          email:
            "provider@example.com",

          account_type:
            "merchant",

          status:
            "mystery",
        }),
      /invitation status is invalid/u,
    );

    assert.throws(
      () =>
        parsePayMongoLinkedAccountResource({
          data: {
            id:
              "org_child000",

            type:
              "merchant",

            activation_status:
              "mystery",
          },
        }),
      /activation status is invalid/u,
    );
  },
);

test(
  "create account sends merchant or consumer and stores only the returned org id",
  async () => {
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      calls.push({url: String(url), body: init.body});
      const type = JSON.parse(init.body).type;
      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: "org_childcreated1",
            type,
            activation_status: "pending",
            person: {
              first_name: "Hidden",
              identity_verification_status: "pending",
            },
            relationship: {id: "mr_relationship1"},
            bank: {account_number: "999"},
          },
        }),
      };
    };

    try {
      const merchant = await createPayMongoChildAccount({
        secretKey: "sk_test_secret",
        accountType: "merchant",
        emailAddress: "Owner@Example.com",
        mobileNumber: "+639171234567",
      });
      const consumer = await createPayMongoChildAccount({
        secretKey: "sk_test_secret",
        accountType: "consumer",
        emailAddress: "person@example.com",
        mobileNumber: "+639171234567",
      });
      const merchantBody = JSON.parse(calls[0].body);
      const consumerBody = JSON.parse(calls[1].body);

      assert.equal(merchantBody.type, "merchant");
      assert.equal(merchantBody.person.email_address, "owner@example.com");
      assert.equal(merchantBody.account_id, undefined);
      assert.equal(merchantBody.paymongoAccountId, undefined);
      assert.equal(consumerBody.type, "consumer");
      assert.equal(merchant.accountId, "org_childcreated1");
      assert.equal(merchant.relationshipId, "mr_relationship1");
      assert.equal(merchant.payoutReady, undefined);
      assert.equal(consumer.accountType, "consumer");
      assert.equal(Object.hasOwn(merchant, "bank"), false);
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "identity verification returns only a PayMongo hosted URL",
  async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: "verif_session1",
          account_id: "org_childcreated1",
          url: "https://identity.paymongo.com/v/verif_session1",
        },
      }),
    });

    try {
      const session = await createPayMongoIdentityVerificationSession({
        secretKey: "sk_test_secret",
        accountId: "org_childcreated1",
      });
      assert.equal(
        session.hostedUrl,
        "https://identity.paymongo.com/v/verif_session1",
      );
    } finally {
      global.fetch = originalFetch;
    }

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: "verif_session1",
          url: "https://evil.example/verify",
        },
      }),
    });
    try {
      await assert.rejects(
        () => createPayMongoIdentityVerificationSession({
          secretKey: "sk_test_secret",
          accountId: "org_childcreated1",
        }),
        /URL is invalid/u,
      );
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "failed create and incomplete activation do not report readiness",
  async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        errors: [{
          code: "parameter_required",
          detail: "TIN 123456789",
          source: {pointer: "business.tin"},
        }],
      }),
    });

    try {
      await assert.rejects(
        () => activatePayMongoChildAccount({
          secretKey: "sk_test_secret",
          accountId: "org_childcreated1",
        }),
        (error) => {
          assert.equal(error.certainty, "gateway_rejected");
          assert.deepEqual(error.missingPointers, ["business.tin"]);
          assert.equal(error.message.includes("123456789"), false);
          assert.equal(error.payoutReady, undefined);
          return true;
        },
      );

      await assert.rejects(
        () => updatePayMongoChildAccount({
          secretKey: "sk_test_secret",
          accountId: "org_childcreated1",
          body: {person: {nationality: "PHL"}},
        }),
        (error) => error.certainty === "gateway_rejected",
      );
    } finally {
      global.fetch = originalFetch;
    }
  },
);