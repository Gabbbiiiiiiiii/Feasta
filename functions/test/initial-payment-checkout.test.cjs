const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const root =
  path.resolve(
    __dirname,
    "../src",
  );

const checkout =
  fs.readFileSync(
    path.join(
      root,
      "payments/create-payment-session.ts",
    ),
    "utf8",
  );

test(
  "checkout accepts a choice but never a client amount",
  () => {
    const callable =
      checkout.slice(
        0,
        checkout.indexOf(
          "export async function createPaymentSessionForCustomer",
        ),
      );

    assert.match(
      callable,
      /"paymentChoice"/u,
    );

    assert.match(
      checkout,
      /parseInitialPaymentChoice/u,
    );

    assert.doesNotMatch(
      callable,
      /input\.amount\b/u,
    );
  },
);

test(
  "initial payment identity and amount are server-derived",
  () => {
    assert.match(
      checkout,
      /paymentIdForProviderRequestChoice/u,
    );

    assert.match(
      checkout,
      /providerPaymentObligationForChoice/u,
    );

    assert.match(
      checkout,
      /obligation\.amountInCentavos/u,
    );

    assert.doesNotMatch(
      checkout,
      /providerRequest\s*\.\s*downPaymentAmount/u,
    );
  },
);

test(
  "minimum and full are mutually exclusive before gateway dispatch",
  () => {
    assert.match(
      checkout,
      /alternatePaymentReference/u,
    );

    assert.match(
      checkout,
      /legacyPaymentReference/u,
    );

    assert.match(
      checkout,
      /initialPaymentSelectionReason/u,
    );

    assert.match(
      checkout,
      /initialPaymentChoice/u,
    );

    assert.match(
      checkout,
      /initialPaymentId/u,
    );

    assert.match(
      checkout,
      /initialPaymentSelectedAt/u,
    );

    assert.match(
      checkout,
      /paymentId,/u,
    );
  },
);

test(
  "payment document persists obligation identity",
  () => {
    for (
      const field of [
        "obligationSchemaVersion",
        "paymentChoice",
        "obligationKey",
        "obligationKind",
        "paymentType",
      ]
    ) {
      assert.match(
        checkout,
        new RegExp(
          `${field}:`,
          "u",
        ),
      );
    }
  },
);

test(
  "legacy deterministic identity is migration guard only",
  () => {
    assert.match(
      checkout,
      /Historical checkout identity is read only as[\s\S]*a migration guard/u,
    );

    assert.match(
      checkout,
      /const legacyPaymentId\s*=\s*paymentIdForProviderRequest/u,
    );

    assert.match(
      checkout,
      /const paymentId\s*=\s*paymentIdForProviderRequestChoice/u,
    );
  },
);
test(
  "initial choice atomically reserves the settlement snapshot",
  () => {
    assert.match(
      checkout,
      /initialPaymentReservationSettlementUpdate/u,
    );

    assert.match(
      checkout,
      /const initialSettlementUpdate/u,
    );

    assert.match(
      checkout,
      /\.\.\.initialSettlementUpdate/u,
    );

    assert.match(
      checkout,
      /initialPaymentChoice/u,
    );

    assert.match(
      checkout,
      /initialPaymentId/u,
    );

    assert.match(
      checkout,
      /initialPaymentSelectedAt/u,
    );
  },
);
