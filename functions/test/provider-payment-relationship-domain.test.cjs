const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  parsePayMongoLinkedAccountRelationship,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "provider-finance",
  "paymongo-linked-account-client.js",
));

const {
  providerPaymentRelationshipSnapshot,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "provider-finance",
  "provider-payment-relationship-domain.js",
));

function storedAccount() {
  return {
    invitationId:
      "lr_123456789",

    paymongoAccountId:
      "org_child123456789",
  };
}

test(
  "parses only safe PayMongo relationship identity and enabled state",
  () => {
    const result =
      parsePayMongoLinkedAccountRelationship({
        data: {
          id:
            "mr_123456789",

          linking_request_id:
            "lr_123456789",

          enabled:
            true,

          parent_account: {
            id:
              "org_parent123456789",

            sensitive_extra_field:
              "ignored",
          },

          child_account: {
            id:
              "org_child123456789",

            bank_account_number:
              "ignored",
          },

          policy: {
            secret:
              "ignored",
          },
        },
      });

    assert.deepEqual(
      result,
      {
        relationshipId:
          "mr_123456789",

        linkingRequestId:
          "lr_123456789",

        enabled:
          true,

        parentAccountId:
          "org_parent123456789",

        childAccountId:
          "org_child123456789",
      },
    );

    assert.equal(
      Object.hasOwn(
        result,
        "policy",
      ),
      false,
    );
  },
);

test(
  "disabled relationship is preserved as disabled",
  () => {
    const relationship =
      parsePayMongoLinkedAccountRelationship({
        data: {
          id:
            "mr_123456789",

          linking_request_id:
            "lr_123456789",

          enabled:
            false,

          parent_account: {
            id:
              "org_parent123456789",
          },

          child_account: {
            id:
              "org_child123456789",
          },
        },
      });

    const snapshot =
      providerPaymentRelationshipSnapshot({
        storedAccount:
          storedAccount(),

        relationship,
      });

    assert.equal(
      snapshot.status,
      "disabled",
    );
  },
);

test(
  "relationship must belong to the stored Provider child account",
  () => {
    const relationship =
      parsePayMongoLinkedAccountRelationship({
        data: {
          id:
            "mr_123456789",

          linking_request_id:
            "lr_123456789",

          enabled:
            true,

          parent_account: {
            id:
              "org_parent123456789",
          },

          child_account: {
            id:
              "org_other123456789",
          },
        },
      });

    assert.throws(
      () =>
        providerPaymentRelationshipSnapshot({
          storedAccount:
            storedAccount(),

          relationship,
        }),
      /does not match/u,
    );
  },
);

test(
  "relationship invitation must match canonical onboarding invitation",
  () => {
    const relationship =
      parsePayMongoLinkedAccountRelationship({
        data: {
          id:
            "mr_123456789",

          linking_request_id:
            "lr_other123456789",

          enabled:
            true,

          parent_account: {
            id:
              "org_parent123456789",
          },

          child_account: {
            id:
              "org_child123456789",
          },
        },
      });

    assert.throws(
      () =>
        providerPaymentRelationshipSnapshot({
          storedAccount:
            storedAccount(),

          relationship,
        }),
      /invitation does not match/u,
    );
  },
);

test(
  "relationship without linking request remains valid for API-created accounts",
  () => {
    const relationship =
      parsePayMongoLinkedAccountRelationship({
        data: {
          id:
            "mr_123456789",

          linking_request_id:
            null,

          enabled:
            true,

          parent_account: {
            id:
              "org_parent123456789",
          },

          child_account: {
            id:
              "org_child123456789",
          },
        },
      });

    const snapshot =
      providerPaymentRelationshipSnapshot({
        storedAccount:
          storedAccount(),

        relationship,
      });

    assert.equal(
      snapshot.linkingRequestId,
      null,
    );

    assert.equal(
      snapshot.status,
      "enabled",
    );
  },
);
test(
  "legacy rel_ relationship identifiers are rejected",
  () => {
    assert.throws(
      () =>
        parsePayMongoLinkedAccountRelationship({
          data: {
            id:
              "rel_123456789",

            linking_request_id:
              "lr_123456789",

            enabled:
              true,

            parent_account: {
              id:
                "org_parent123456789",
            },

            child_account: {
              id:
                "org_child123456789",
            },
          },
        }),
      /relationship ID is invalid/u,
    );
  },
);
