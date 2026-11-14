const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

function source(relative) {
  return fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      relative,
    ),
    "utf8",
  );
}

test(
  "new canonical bookings freeze Provider disbursement policy v1",
  () => {
    const financial =
      source(
        "provider-requests/provider-request-financial-snapshot.ts",
      );

    assert.match(
      financial,
      /providerDisbursementPolicyVersion/u,
    );

    assert.match(
      financial,
      /PROVIDER_DISBURSEMENT_POLICY_VERSION/u,
    );
  },
);

test(
  "completion creates a scheduled Provider disbursement",
  () => {
    const lifecycle =
      source(
        "provider-requests/update-provider-booking-lifecycle.ts",
      );

    assert.match(
      lifecycle,
      /scheduleCompletedProviderRequestDisbursementInTransaction/u,
    );

    assert.match(
      lifecycle,
      /targetStatus === "completed"/u,
    );
  },
);

test(
  "reconciliation is bounded and does not dispatch external money",
  () => {
    const reconcile =
      source(
        "provider-finance/provider-disbursement-reconciliation.ts",
      );

    assert.match(
      reconcile,
      /\.limit\(\s*SWEEP_LIMIT/u,
    );

    assert.match(
      reconcile,
      /providerDisbursementsEnabled/u,
    );

    assert.match(
      reconcile,
      /status:\s*"ready"/u,
    );

    assert.doesNotMatch(
      reconcile,
      /api\.paymongo\.com/u,
    );
  },
);

test(
  "scheduled reconciliation is exported by Functions entry point",
  () => {
    const index =
      source(
        "index.ts",
      );

    assert.match(
      index,
      /reconcileProviderDisbursements/u,
    );

    assert.match(
      index,
      /provider-disbursement-reconciliation\.js/u,
    );
  },
);

test(
  "Provider disbursement collection remains browser-inaccessible",
  () => {
    const rules =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "..",
          "firebase",
          "firestore.rules",
        ),
        "utf8",
      );

    assert.match(
      rules,
      /match \/providerDisbursements\/\{disbursementId\}/u,
    );

    assert.match(
      rules,
      /match \/providerDisbursements\/\{disbursementId\} \{[\s\S]*?allow read, write: if false;/u,
    );
  },
);
