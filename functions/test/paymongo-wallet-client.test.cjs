const {
  afterEach,
  test,
} = require("node:test");

const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const {
  discoverPayMongoSettlementSourceWallet,
  parsePayMongoWalletResource,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "provider-finance",
  "paymongo-wallet-client.js",
));

const originalFetch =
  global.fetch;

afterEach(() => {
  global.fetch =
    originalFetch;
});

function wallet(
  overrides = {},
) {
  return {
    id:
      "wallet_parent123456789",

    merchant_id:
      "org_parent123456789",

    livemode:
      false,

    is_default:
      true,

    status:
      "activated",

    type:
      "standard",

    balance: {
      available:
        150000,

      pending:
        5000,
    },

    limits: {
      balance:
        50000000,
    },

    account: {
      provider:
        "paymongo",

      account_name:
        "FEASTA Test",

      account_number:
        "123456789012",

      currency:
        "PHP",

      ledger_account_id:
        "ledger_secret_internal",
    },

    signed_statement_of_acceptance_file_record_id:
      "file_not_retained",

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
  "wallet parser retains only settlement-safe fields",
  () => {
    const result =
      parsePayMongoWalletResource({
        data:
          wallet(),
      });

    assert.deepEqual(
      result,
      {
        walletId:
          "wallet_parent123456789",

        merchantId:
          "org_parent123456789",

        livemode:
          false,

        isDefault:
          true,

        status:
          "activated",

        availableBalanceInCentavos:
          150000,

        pendingBalanceInCentavos:
          5000,

        accountProvider:
          "paymongo",

        accountNumber:
          "123456789012",

        currency:
          "PHP",
      },
    );

    assert.equal(
      Object.hasOwn(
        result,
        "accountName",
      ),
      false,
    );

    assert.equal(
      Object.hasOwn(
        result,
        "ledgerAccountId",
      ),
      false,
    );
  },
);

test(
  "discovers FEASTA parent wallet in parent account context and verifies it by ID",
  async () => {
    const calls =
      [];

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

          headers:
            init?.headers,
        });

        const requestUrl =
          new URL(
            String(url),
          );

        if (
          requestUrl.pathname ===
            "/v2/wallets"
        ) {
          assert.equal(
            requestUrl
              .searchParams
              .get("status"),
            "activated",
          );

          assert.deepEqual(
            requestUrl
              .searchParams
              .getAll("fields"),
            [
              "balance",
              "account",
            ],
          );

          return jsonResponse({
            data: [
              wallet(),
            ],
          });
        }

        if (
          requestUrl.pathname ===
            "/v2/wallets/wallet_parent123456789"
        ) {
          return jsonResponse({
            data:
              wallet(),
          });
        }

        throw new Error(
          `Unexpected request: ${requestUrl}`,
        );
      };

    const result =
      await discoverPayMongoSettlementSourceWallet({
        secretKey:
          "sk_test_wallet_contract",
      });

    assert.ok(result);

    assert.equal(
      result.walletId,
      "wallet_parent123456789",
    );

    assert.equal(
      result.status,
      "activated",
    );

    assert.equal(
      calls.length,
      2,
    );

    for (const call of calls) {
      assert.equal(
        call.method,
        "GET",
      );

      const headers =
        call.headers ?? {};

      assert.equal(
        Object.hasOwn(
          headers,
          "Account-ID",
        ),
        false,
      );

      assert.equal(
        Object.hasOwn(
          headers,
          "Organization-Id",
        ),
        false,
      );
    }
  },
);

test(
  "multiple activated wallets require exactly one default",
  async () => {
    global.fetch =
      async (
        url,
      ) => {
        const requestUrl =
          new URL(
            String(url),
          );

        if (
          requestUrl.pathname ===
            "/v2/wallets"
        ) {
          return jsonResponse({
            data: [
              wallet({
                id:
                  "wallet_first123456789",

                is_default:
                  false,

                account: {
                  ...wallet().account,

                  account_number:
                    "111111111111",
                },
              }),

              wallet({
                id:
                  "wallet_second123456789",

                is_default:
                  false,

                account: {
                  ...wallet().account,

                  account_number:
                    "222222222222",
                },
              }),
            ],
          });
        }

        throw new Error(
          "Wallet verification should not execute after ambiguous discovery.",
        );
      };

    await assert.rejects(
      () =>
        discoverPayMongoSettlementSourceWallet({
          secretKey:
            "sk_test_wallet_contract",
        }),
      /ambiguous/u,
    );
  },
);

test(
  "exactly one default wallet resolves an otherwise multiple-wallet result",
  async () => {
    global.fetch =
      async (
        url,
      ) => {
        const requestUrl =
          new URL(
            String(url),
          );

        if (
          requestUrl.pathname ===
            "/v2/wallets"
        ) {
          return jsonResponse({
            data: [
              wallet({
                id:
                  "wallet_first123456789",

                is_default:
                  false,

                account: {
                  ...wallet().account,

                  account_number:
                    "111111111111",
                },
              }),

              wallet({
                id:
                  "wallet_second123456789",

                is_default:
                  true,

                account: {
                  ...wallet().account,

                  account_number:
                    "222222222222",
                },
              }),
            ],
          });
        }

        if (
          requestUrl.pathname ===
            "/v2/wallets/wallet_second123456789"
        ) {
          return jsonResponse({
            data:
              wallet({
                id:
                  "wallet_second123456789",

                is_default:
                  true,

                account: {
                  ...wallet().account,

                  account_number:
                    "222222222222",
                },
              }),
          });
        }

        throw new Error(
          `Unexpected request: ${requestUrl}`,
        );
      };

    const result =
      await discoverPayMongoSettlementSourceWallet({
        secretKey:
          "sk_test_wallet_contract",
      });

    assert.equal(
      result?.walletId,
      "wallet_second123456789",
    );
  },
);

test(
  "no activated wallet returns null",
  async () => {
    global.fetch =
      async () =>
        jsonResponse({
          data: [],
        });

    const result =
      await discoverPayMongoSettlementSourceWallet({
        secretKey:
          "sk_test_wallet_contract",
      });

    assert.equal(
      result,
      null,
    );
  },
);

test(
  "wallet parser rejects malformed money fields",
  () => {
    assert.throws(
      () =>
        parsePayMongoWalletResource({
          data:
            wallet({
              balance: {
                available:
                  -1,

                pending:
                  0,
              },
            }),
        }),
      /available balance/u,
    );
  },
);