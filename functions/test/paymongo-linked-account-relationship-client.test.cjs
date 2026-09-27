const {
  afterEach,
  test,
} = require("node:test");

const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const {
  findPayMongoLinkedAccountRelationship,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "provider-finance",
  "paymongo-linked-account-client.js",
));

const originalFetch =
  global.fetch;

afterEach(() => {
  global.fetch =
    originalFetch;
});

function relationship(
  overrides = {},
) {
  return {
    id:
      "mr_123456789",

    parent_account_id:
      "org_parent123456789",

    child_account_id:
      "org_child123456789",

    enabled:
      true,

    linking_request_id:
      "lr_123456789",

    parent_account: {
      id:
        "org_parent123456789",

      account_type:
        "merchant",

      activation_status:
        "activated",

      enabled:
        true,
    },

    child_account: {
      id:
        "org_child123456789",

      account_type:
        "merchant",

      activation_status:
        "activated",

      enabled:
        true,
    },

    ...overrides,
  };
}

function jsonResponse(
  body,
) {
  return new Response(
    JSON.stringify(body),
    {
      status: 200,

      headers: {
        "Content-Type":
          "application/json",
      },
    },
  );
}

test(
  "discovers Provider relationship by official child-account filter then verifies by ID",
  async () => {
    const calls = [];

    global.fetch =
      async (
        url,
        init,
      ) => {
        calls.push({
          url:
            String(url),

          method:
            init?.method,
        });

        const requestUrl =
          new URL(
            String(url),
          );

        if (
          requestUrl.pathname ===
            "/v2/relationships"
        ) {
          assert.equal(
            requestUrl.searchParams.get(
              "child_account_id",
            ),
            "org_child123456789",
          );

          assert.equal(
            requestUrl.searchParams.get(
              "limit",
            ),
            "100",
          );

          return jsonResponse({
            data: [
              relationship(),
            ],

            has_more:
              false,

            cursor:
              null,
          });
        }

        if (
          requestUrl.pathname ===
            "/v2/relationships/mr_123456789"
        ) {
          return jsonResponse({
            data:
              relationship(),
          });
        }

        throw new Error(
          `Unexpected URL: ${requestUrl}`,
        );
      };

    const result =
      await findPayMongoLinkedAccountRelationship({
        secretKey:
          "sk_test_feasta_relationship",

        childAccountId:
          "org_child123456789",

        invitationId:
          "lr_123456789",
      });

    assert.ok(result);

    assert.equal(
      result.relationshipId,
      "mr_123456789",
    );

    assert.equal(
      result.enabled,
      true,
    );

    assert.equal(
      calls.length,
      2,
    );
  },
);

test(
  "relationship discovery returns null when invitation relationship is not present",
  async () => {
    global.fetch =
      async () =>
        jsonResponse({
          data: [
            relationship({
              id:
                "mr_other123456789",

              linking_request_id:
                "lr_other123456789",
            }),
          ],

          has_more:
            false,

          cursor:
            null,
        });

    const result =
      await findPayMongoLinkedAccountRelationship({
        secretKey:
          "sk_test_feasta_relationship",

        childAccountId:
          "org_child123456789",

        invitationId:
          "lr_123456789",
      });

    assert.equal(
      result,
      null,
    );
  },
);

test(
  "relationship discovery fails closed when PayMongo reports another page",
  async () => {
    global.fetch =
      async () =>
        jsonResponse({
          data: [
            relationship(),
          ],

          has_more:
            true,

          cursor:
            "opaque_cursor",
        });

    await assert.rejects(
      () =>
        findPayMongoLinkedAccountRelationship({
          secretKey:
            "sk_test_feasta_relationship",

          childAccountId:
            "org_child123456789",

          invitationId:
            "lr_123456789",
        }),
      /more than one page/u,
    );
  },
);

test(
  "relationship discovery rejects an unexpected child account",
  async () => {
    global.fetch =
      async () =>
        jsonResponse({
          data: [
            relationship({
              child_account_id:
                "org_wrong123456789",

              child_account: {
                id:
                  "org_wrong123456789",

                account_type:
                  "merchant",

                activation_status:
                  "activated",

                enabled:
                  true,
              },
            }),
          ],

          has_more:
            false,

          cursor:
            null,
        });

    await assert.rejects(
      () =>
        findPayMongoLinkedAccountRelationship({
          secretKey:
            "sk_test_feasta_relationship",

          childAccountId:
            "org_child123456789",

          invitationId:
            "lr_123456789",
        }),
      /unexpected child account/u,
    );
  },
);