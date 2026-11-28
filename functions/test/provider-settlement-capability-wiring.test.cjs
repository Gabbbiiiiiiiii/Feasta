const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test(
  "Provider activation never silently enables settlement transport",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "provider-finance",
          "provider-payment-account-management.ts",
        ),
        "utf8",
      );

    assert.match(
      source,
      /settlementTransportReady:\s*false/u,
    );

    assert.match(
      source,
      /settlementTransportMode:\s*"disabled"/u,
    );
  },
);

test(
  "payout reservation checks settlement transport capability",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "provider-finance",
          "provider-settlement-management.ts",
        ),
        "utf8",
      );

    assert.match(
      source,
      /assertProviderSettlementTransportReady/u,
    );

    assert.match(
      source,
      /providerPaymentAccounts/u,
    );

    assert.match(
      source,
      /provider_settlement_transport_unavailable/u,
    );
  },
);

test(
  "P10-C1 does not add a gateway payout request",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "provider-finance",
          "provider-settlement-management.ts",
        ),
        "utf8",
      );

    assert.doesNotMatch(
      source,
      /api\.paymongo\.com/u,
    );

    assert.doesNotMatch(
      source,
      /fetch\(/u,
    );
  },
);
test(
  "linked account is never accepted as a payout transport",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "provider-finance",
          "provider-settlement-capability.ts",
        ),
        "utf8",
      );

    assert.doesNotMatch(
      source,
      /value === "linked_account"/u,
    );

    assert.match(
      source,
      /settlementTransportReady\s*!==\s*true/su,
    );
  },
);