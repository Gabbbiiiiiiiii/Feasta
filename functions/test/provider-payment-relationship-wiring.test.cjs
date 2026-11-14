const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test(
  "relationship domain itself performs no network request",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "provider-finance",
          "provider-payment-relationship-domain.ts",
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
  "Provider payout refresh verifies the PayMongo relationship",
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
      /findPayMongoLinkedAccountRelationship/u,
    );

    assert.match(
      source,
      /providerPaymentRelationshipSnapshot/u,
    );

    assert.match(
      source,
      /relationshipVerificationStatus/u,
    );

    assert.match(
      source,
      /relationshipLastCheckedAt/u,
    );
  },
);

test(
  "relationship refresh never automatically enables settlement transport",
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

    assert.doesNotMatch(
      source,
      /settlementTransportMode:\s*"linked_account"/u,
    );

    assert.doesNotMatch(
      source,
      /settlementTransportMode:\s*"wallet_transfer"/u,
    );

    assert.doesNotMatch(
      source,
      /settlementTransportMode:\s*"workflow"/u,
    );
  },
);