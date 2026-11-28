const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const repoRoot =
  path.join(
    __dirname,
    "..",
    "..",
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      repoRoot,
      ...relativePath.split("/"),
    ),
    "utf8",
  );
}

test(
  "web customer projection exposes canonical remaining-balance truth",
  () => {
    const types =
      read(
        "apps/web/src/lib/customer/bookings/customer-booking-types.ts",
      );

    const service =
      read(
        "apps/web/src/lib/customer/bookings/customer-booking-service.ts",
      );

    for (
      const field of [
        "settlementStatus",
        "grossSettledAmountInCentavos",
        "outstandingAmountInCentavos",
        "remainingBalanceStatus",
        "remainingBalanceDueAt",
        "remainingBalanceGraceEndsAt",
      ]
    ) {
      assert.match(
        types,
        new RegExp(field, "u"),
      );

      assert.match(
        service,
        new RegExp(field, "u"),
      );
    }
  },
);

test(
  "web customer booking card displays server-owned balance lifecycle",
  () => {
    const source =
      read(
        "apps/web/src/components/customer/bookings/customer-booking-provider-request-card.tsx",
      );

    assert.match(
      source,
      /RemainingBalanceLifecycle/u,
    );

    assert.match(
      source,
      /Customer paid so far/u,
    );

    assert.match(
      source,
      /Balance due/u,
    );

    assert.doesNotMatch(
      source,
      /Balancestatus/u,
    );

    assert.match(
      source,
      /Overdue from/u,
    );

    assert.match(
      source,
      /Payment options will appear when they are available/u,
    );

    assert.doesNotMatch(
      source,
      /does not currently collect provider balances online/u,
    );
  },
);

test(
  "mobile payment request projects canonical balance lifecycle",
  () => {
    const source =
      read(
        "apps/customer_mobile/lib/shared/models/customer_payment_request.dart",
      );

    assert.match(
      source,
      /remainingBalanceStatus/u,
    );

    assert.match(
      source,
      /remainingBalanceDueAt/u,
    );

    assert.match(
      source,
      /remainingBalanceGraceEndsAt/u,
    );

    assert.match(
      source,
      /_remainingBalanceStatus/u,
    );

    assert.match(
      source,
      /_timestampDate/u,
    );
  },
);

test(
  "mobile payment summary displays canonical balance lifecycle",
  () => {
    const source =
      read(
        "apps/customer_mobile/lib/features/customer/payment_status_screen.dart",
      );

    assert.match(
      source,
      /Balance status/u,
    );

    assert.match(
      source,
      /Balance due/u,
    );

    assert.doesNotMatch(
      source,
      /Balancestatus/u,
    );

    assert.match(
      source,
      /Overdue from/u,
    );

    assert.match(
      source,
      /_formatManilaBalanceDate/u,
    );
  },
);

test(
  "remaining-balance display fields do not replace checkout authority",
  () => {
    const web =
      read(
        "apps/web/src/lib/customer/bookings/customer-booking-payment.ts",
      );

    const mobile =
      read(
        "apps/customer_mobile/lib/shared/models/customer_payment_request.dart",
      );

    const checkoutDomain =
      read(
        "apps/web/src/lib/customer/bookings/customer-booking-checkout-options.ts",
      );

    assert.match(
      web,
      /request\.checkoutOptions\.length > 0/u,
    );

    assert.match(
      mobile,
      /bool get canStartCheckout => checkoutOptions\.isNotEmpty/u,
    );

    assert.doesNotMatch(
      checkoutDomain,
      /remainingBalanceDueAt/u,
    );

    assert.doesNotMatch(
      checkoutDomain,
      /remainingBalanceGraceEndsAt/u,
    );
  },
);
