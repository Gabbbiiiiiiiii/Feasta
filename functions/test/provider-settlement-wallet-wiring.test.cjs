const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

test(
  "C3D wallet client is read-only parent-context discovery",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "provider-finance",
          "paymongo-wallet-client.ts",
        ),
        "utf8",
      );

    assert.match(
      source,
      /\/v2\/wallets/u,
    );

    assert.match(
      source,
      /method:\s*"GET"/u,
    );

    assert.doesNotMatch(
      source,
      /method:\s*"POST"/u,
    );

    /*
     * Comments may document Account-ID, but the client must never
     * construct either child-account or organization-context headers.
     */
    assert.doesNotMatch(
      source,
      /["']Account-ID["']\s*:/u,
    );

    assert.doesNotMatch(
      source,
      /["']Organization-Id["']\s*:/u,
    );

    assert.doesNotMatch(
      source,
      /providerPaymentAccounts/u,
    );

    assert.doesNotMatch(
      source,
      /settlementTransportReady:\s*true/u,
    );

    assert.doesNotMatch(
      source,
      /batch_transfers/u,
    );
  },
);