const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  buildPayMongoLinkedAccountSignupUrl,
  parsePayMongoLinkedAccountInvitation,
  parsePayMongoLinkedAccountInviteResponse,
  parsePayMongoLinkedAccountResource,
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