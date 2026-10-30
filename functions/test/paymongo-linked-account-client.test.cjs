const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  providerPayoutCreationFailure,
  shouldCreateProviderPayoutAccount,
} = require("../lib/provider-finance/provider-payment-account-domain.js");

const {
  activatePayMongoChildAccount,
  buildPayMongoLinkedAccountSignupUrl,
  createPayMongoChildAccount,
  createPayMongoIdentityVerificationSession,
  parsePayMongoLinkedAccountInvitation,
  parsePayMongoLinkedAccountInviteResponse,
  parsePayMongoLinkedAccountResource,
  payMongoLinkedAccountUrl,
  safePayMongoAccountResponseMetadata,
  retrievePayMongoLinkedAccount,
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
  "account parser ignores embedded relationship payload",
  () => {
    const result =
      parsePayMongoLinkedAccountResource({
        data: {
          id:
            "org_child12345",

          type:
            "merchant",

          activation_status:
            "pending",

          relationship: {
            id:
              "unexpected_relationship_shape",

            enabled:
              true,

            parent_account: {
              id:
                "org_parent12345",
            },

            child_account: {
              id:
                "org_child12345",
            },
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
          "pending",

        identityVerificationStatus:
          null,

        relationshipId:
          null,

        legalIdentityPresent:
          false,
      },
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
      calls.push({
        url: String(url),
        method: init.method,
        authorization: init.headers.Authorization,
        body: init.body,
      });
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
      const authorization = Buffer.from("sk_test_secret:").toString("base64");

      assert.equal(calls[0].method, "POST");
      assert.equal(calls[0].url, "https://api.paymongo.com/v2/accounts");
      assert.equal(calls[0].authorization, `Basic ${authorization}`);
      assert.equal(calls[0].url.includes("sk_test_secret"), false);
      assert.equal(merchantBody.type, "merchant");
      assert.equal(merchantBody.person.email_address, "owner@example.com");
      assert.equal(merchantBody.account_id, undefined);
      assert.equal(merchantBody.paymongoAccountId, undefined);
      assert.equal(consumerBody.type, "consumer");
      assert.equal(merchant.accountId, "org_childcreated1");
      assert.equal(merchant.relationshipId, null);
      assert.equal(merchant.payoutReady, undefined);
      assert.equal(consumer.accountType, "consumer");
      assert.equal(Object.hasOwn(merchant, "bank"), false);
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "account URL assembly stays on the PayMongo host and v2 path",
  () => {
    assert.equal(
      payMongoLinkedAccountUrl("/v2/accounts"),
      "https://api.paymongo.com/v2/accounts",
    );
    assert.throws(
      () => payMongoLinkedAccountUrl("/v2/v2/accounts"),
      /path is invalid/u,
    );
    assert.throws(
      () => payMongoLinkedAccountUrl("https://api.paymongo.com/v2/accounts"),
      /path is invalid/u,
    );
    assert.throws(
      () => payMongoLinkedAccountUrl("/accounts"),
      /path is invalid/u,
    );
  },
);

test(
  "PayMongo 401, 403, and 404 stay classified by status and error code",
  async () => {
    const originalFetch = global.fetch;
    const cases = [
      {
        status: 401,
        code: "authentication_invalid",
      },
      {
        status: 403,
        code: "account_not_allowed",
      },
      {
        status: 404,
        code: "resource_not_found",
      },
    ];

    try {
      for (const entry of cases) {
        global.fetch = async (url, init) => {
          assert.equal(String(url), "https://api.paymongo.com/v2/accounts");
          assert.equal(init.method, "POST");
          assert.match(init.headers.Authorization, /^Basic /u);
          assert.equal(
            String(init.headers.Authorization).includes("sk_test_secret"),
            false,
          );
          return {
            ok: false,
            status: entry.status,
            json: async () => ({
              errors: [{
                code: entry.code,
                detail: "The requested resource could not be found",
              }],
            }),
          };
        };

        await assert.rejects(
          () => createPayMongoChildAccount({
            secretKey: "sk_test_secret",
            accountType: "merchant",
            emailAddress: "owner@example.com",
            mobileNumber: "+639171234567",
          }),
          (error) => {
            assert.equal(error.statusCode, entry.status);
            assert.equal(error.gatewayCode, entry.code);
            assert.equal(error.certainty, "gateway_rejected");
            assert.equal(error.message.includes("PAYMONGO_SECRET_KEY"), false);
            assert.equal(error.message.includes("cannot call"), false);
            assert.equal(error.message.includes("sk_test_secret"), false);
            return true;
          },
        );
      }
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "refresh reads the authoritative child account from PayMongo",
  async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({url: String(url), method: init.method});
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: "org_childcreated1",
            type: "merchant",
            activation_status: "activated",
            person: {
              identity_verification_status: "passed",
            },
          },
        }),
      };
    };

    try {
      const account = await retrievePayMongoLinkedAccount({
        secretKey: "sk_test_secret",
        accountId: "org_childcreated1",
      });
      assert.equal(
        calls[0].url,
        "https://api.paymongo.com/v2/accounts/org_childcreated1",
      );
      assert.equal(calls[0].method, "GET");
      assert.equal(account.accountId, "org_childcreated1");
      assert.equal(account.activationStatus, "activated");
      assert.equal(account.payoutReady, undefined);
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
          id: "verif_test_session1",
          account_id: "org_childcreated1",
          url: "https://identity.paymongo.com/v/verif_test_session1",
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
        "https://identity.paymongo.com/v/verif_test_session1",
      );
    } finally {
      global.fetch = originalFetch;
    }

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: "verif_test_session1",
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

test(
  "create account 400 preserves the PayMongo validation reason",
  async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      assert.equal(String(url), "https://api.paymongo.com/v2/accounts");
      assert.equal(init.method, "POST");
      const body = JSON.parse(init.body);
      assert.equal(body.type, "merchant");
      assert.equal(body.person.email_address, "owner@example.com");
      assert.equal(body.person.mobile_number, "+639171234567");
      assert.equal(body.data, undefined);
      return {
        ok: false,
        status: 400,
        json: async () => ({
          errors: [{
            code: "parameter_invalid",
            detail: "email owner@example.com is taken",
            source: {pointer: "person.email_address"},
          }],
        }),
      };
    };

    try {
      await assert.rejects(
        () => createPayMongoChildAccount({
          secretKey: "sk_test_secret",
          accountType: "merchant",
          emailAddress: "owner@example.com",
          mobileNumber: "+639171234567",
        }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.equal(error.gatewayCode, "parameter_invalid");
          assert.deepEqual(error.missingPointers, ["person.email_address"]);
          assert.equal(error.certainty, "gateway_rejected");
          assert.equal(error.message.includes("owner@example.com"), false);
          const failure = providerPayoutCreationFailure({
            certainty: error.certainty,
            statusCode: error.statusCode,
            gatewayMessage: error.message,
            gatewayCode: error.gatewayCode,
            missingPointers: error.missingPointers,
          });
          assert.equal(failure.callableStatus, "failed-precondition");
          assert.notEqual(failure.callableStatus, "unavailable");
          assert.match(failure.message, /person\.email_address/u);
          assert.equal(failure.inviteCreationState, "rejected");
          return true;
        },
      );
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "create account 401, 403, and 404 stay distinct from upstream failure",
  async () => {
    const originalFetch = global.fetch;
    const cases = [
      [401, "payout_gateway_authentication_failed"],
      [403, "payout_gateway_forbidden"],
      [404, "paymongo_account_endpoint_not_found"],
    ];

    try {
      for (const [status, reason] of cases) {
        global.fetch = async () => ({
          ok: false,
          status,
          json: async () => ({
            errors: [{code: "resource_not_found", detail: "missing"}],
          }),
        });
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
              gatewayCode: error.gatewayCode,
            });
            assert.equal(failure.reason, reason);
            assert.equal(failure.callableStatus, "failed-precondition");
            assert.equal(failure.inviteCreationState, "rejected");
            return true;
          },
        );
      }
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "create account network failure and PayMongo 5xx stay unavailable and are not retried",
  async () => {
    const originalFetch = global.fetch;

    try {
      global.fetch = async () => {
        throw new Error("getaddrinfo ENOTFOUND api.paymongo.com");
      };
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
          assert.equal(error.certainty, "ambiguous");
          assert.equal(error.statusCode, null);
          assert.equal(failure.callableStatus, "unavailable");
          assert.equal(failure.reason, "payout_gateway_upstream");
          assert.equal(failure.inviteCreationState, "ambiguous");
          assert.equal(shouldCreateProviderPayoutAccount({
            paymongoAccountId: null,
            inviteCreationState: failure.inviteCreationState,
            setupStatus: failure.setupStatus,
          }), false);
          return true;
        },
      );

      global.fetch = async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          errors: [{code: "upstream_unavailable", detail: "try later"}],
        }),
      });
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
            gatewayCode: error.gatewayCode,
          });
          assert.equal(error.statusCode, 503);
          assert.equal(failure.callableStatus, "unavailable");
          assert.equal(failure.reason, "payout_gateway_upstream");
          assert.equal(failure.inviteCreationState, "ambiguous");
          return true;
        },
      );
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "a missing server secret is a configuration error before PayMongo is called",
  async () => {
    const originalFetch = global.fetch;
    let called = false;
    global.fetch = async () => {
      called = true;
      throw new Error("should not call PayMongo");
    };

    try {
      await assert.rejects(
        () => createPayMongoChildAccount({
          secretKey: "",
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
          assert.equal(called, false);
          assert.equal(failure.reason, "payout_gateway_not_configured");
          assert.equal(failure.callableStatus, "failed-precondition");
          assert.equal(failure.inviteCreationState, "rejected");
          assert.equal(error.message.includes("sk_"), false);
          return true;
        },
      );
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "documented data-wrapped account response parses without payout readiness",
  () => {
    const account = parsePayMongoLinkedAccountResource({
      data: {
        id: "org_zeZdrgooHpjxzDpwvAsHXEAr",
        type: "merchant",
        activation_status: "pending",
        person: {
          type: "representative",
          email_address: "owner@example.com",
          mobile_number: "+639171234567",
          identity_verification_status: "pending",
        },
      },
    });

    assert.equal(account.accountId, "org_zeZdrgooHpjxzDpwvAsHXEAr");
    assert.equal(account.accountType, "merchant");
    assert.equal(account.activationStatus, "pending");
    assert.equal(account.payoutReady, undefined);
    assert.equal(Object.hasOwn(account, "email"), false);
    assert.equal(Object.hasOwn(account, "person"), false);
  },
);

test(
  "missing org id and a wrapperless account body are rejected",
  () => {
    assert.throws(
      () => parsePayMongoLinkedAccountResource({
        data: {
          type: "merchant",
          activation_status: "pending",
        },
      }),
      /account ID is invalid/u,
    );
    assert.throws(
      () => parsePayMongoLinkedAccountResource({
        id: "org_childcreated1",
        type: "merchant",
        activation_status: "pending",
      }),
      /response is invalid/u,
    );
  },
);

test(
  "wrong account type is rejected for the provider being created",
  async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: "org_childcreated1",
          type: "consumer",
          activation_status: "pending",
        },
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
          assert.equal(error.statusCode, 201);
          assert.match(error.message, /type is inconsistent/u);
          assert.equal(error.payoutReady, undefined);
          const failure = providerPayoutCreationFailure({
            certainty: error.certainty,
            statusCode: error.statusCode,
            gatewayMessage: error.message,
          });
          assert.notEqual(failure.callableStatus, "unavailable");
          assert.equal(failure.inviteCreationState, "ambiguous");
          return true;
        },
      );
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "unknown activation status does not produce a payout-ready account",
  () => {
    assert.throws(
      () => parsePayMongoLinkedAccountResource({
        data: {
          id: "org_childcreated1",
          type: "merchant",
          activation_status: "created",
        },
      }),
      /activation status is invalid/u,
    );

    const pending = parsePayMongoLinkedAccountResource({
      data: {
        id: "org_childcreated1",
        type: "merchant",
        activation_status: "pending",
      },
    });
    assert.equal(pending.activationStatus, "pending");
    assert.equal(pending.payoutReady, undefined);
  },
);

test(
  "malformed 2xx JSON never becomes a ready payout account",
  async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        email: "owner@example.com",
        mobile_number: "+639171234567",
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
          assert.equal(error.statusCode, 201);
          assert.equal(error.payoutReady, undefined);
          const failure = providerPayoutCreationFailure({
            certainty: error.certainty,
            statusCode: error.statusCode,
            gatewayMessage: error.message,
          });
          assert.equal(failure.reason, "paymongo_account_response_invalid");
          assert.equal(failure.inviteCreationState, "ambiguous");
          assert.equal(shouldCreateProviderPayoutAccount({
            paymongoAccountId: null,
            inviteCreationState: failure.inviteCreationState,
            setupStatus: failure.setupStatus,
            payoutReady: true,
          }), false);
          return true;
        },
      );
    } finally {
      global.fetch = originalFetch;
    }
  },
);

test(
  "unparseable account diagnostics omit personal and secret data",
  () => {
    const metadata = safePayMongoAccountResponseMetadata({
      data: {
        id: "org_childcreated1",
        type: "merchant",
        activation_status: "pending",
        person: {
          email_address: "owner@example.com",
          mobile_number: "+639171234567",
          first_name: "Juan",
        },
      },
      authorization: "Basic secret",
      note: "owner@example.com",
    });
    const serialized = JSON.stringify(metadata);

    assert.equal(metadata.hasData, true);
    assert.equal(metadata.orgIdPresent, true);
    assert.equal(metadata.accountType, "merchant");
    assert.equal(metadata.activationStatus, "pending");
    assert.deepEqual(metadata.dataKeys, [
      "id",
      "type",
      "activation_status",
      "person",
    ]);
    assert.equal(serialized.includes("owner@example.com"), false);
    assert.equal(serialized.includes("+639171234567"), false);
    assert.equal(serialized.includes("Juan"), false);
    assert.equal(serialized.includes("org_childcreated1"), false);
    assert.equal(serialized.includes("Basic"), false);
    assert.equal(serialized.includes("secret"), false);
  },
);

test(
  "an invalid activation status after HTTP 201 is not classified as unavailable",
  async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: "org_childcreated1",
          type: "merchant",
          activation_status: "created",
        },
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
          assert.equal(error.message, "PayMongo account activation status is invalid.");
          assert.equal(failure.callableStatus, "failed-precondition");
          assert.equal(failure.reason, "paymongo_account_response_invalid");
          assert.equal(failure.inviteCreationState, "ambiguous");
          assert.equal(shouldCreateProviderPayoutAccount({
            paymongoAccountId: null,
            inviteCreationState: failure.inviteCreationState,
            setupStatus: failure.setupStatus,
          }), false);
          return true;
        },
      );
    } finally {
      global.fetch = originalFetch;
    }
  },
);
