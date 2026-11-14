const assert =
  require("node:assert/strict");

const {
  readFileSync,
} =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const management =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/provider-finance/provider-payment-account-management.ts",
    ),
    "utf8",
  );

const client =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/provider-finance/paymongo-linked-account-client.ts",
    ),
    "utf8",
  );

const index =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/index.ts",
    ),
    "utf8",
  );

test(
  "payout onboarding is provider-only and App Check protected",
  () => {
    assert.match(
      management,
      /requireRole[\s\S]*?USER_ROLES\.provider/u,
    );

    assert.match(
      management,
      /appCheckCallableOptions/u,
    );

    assert.match(
      management,
      /defineSecret\([\s\S]*?"PAYMONGO_SECRET_KEY"/u,
    );
  },
);

test(
  "provider registration type selects merchant or consumer through trusted domain",
  () => {
    assert.match(
      management,
      /linkedAccountTypeForBusinessRegistration/u,
    );

    assert.match(
      management,
      /businessRegistrationType/u,
    );
  },
);

test(
  "linked account onboarding persists only bounded references and statuses",
  () => {
    assert.match(
      management,
      /collection\([\s\S]*?"providerPaymentAccounts"/u,
    );

    assert.match(
      management,
      /invitationId/u,
    );

    assert.match(
      management,
      /paymongoAccountId/u,
    );

    assert.match(
      management,
      /activationStatus/u,
    );

    assert.doesNotMatch(
      management,
      /account_number/u,
    );

    assert.doesNotMatch(
      management,
      /card_number/u,
    );

    assert.doesNotMatch(
      management,
      /\bcvv\b/iu,
    );

    assert.doesNotMatch(
      management,
      /bankPassword/iu,
    );
  },
);

test(
  "PayMongo account parser explicitly discards sensitive account payloads",
  () => {
    assert.match(
      client,
      /Intentionally read ONLY these safe fields/u,
    );

    assert.match(
      client,
      /activation_status/u,
    );
  },
);

test(
  "invalid registration type is rejected before any PayMongo invite",
  () => {
    const domain =
      readFileSync(
        path.resolve(
          __dirname,
          "../src/provider-finance/provider-payment-account-domain.ts",
        ),
        "utf8",
      );
    const contextStart =
      management.indexOf(
        "async function requireProviderFinanceContext",
      );
    const contextEnd =
      management.indexOf(
        "function assertStoredAccountOwnership",
      );
    const context =
      management.slice(
        contextStart,
        contextEnd,
      );

    assert.ok(contextStart >= 0);
    assert.ok(contextEnd > contextStart);
    assert.match(
      context,
      /linkedAccountTypeForBusinessRegistration\(\s*provider\.businessRegistrationType/u,
    );
    assert.doesNotMatch(
      context,
      /createPayMongoLinkedAccountInvite|paymongo\.com|fetch\(/u,
    );
    assert.match(
      domain,
      /new HttpsError\(\s*"failed-precondition",\s*"Complete your business registration type before setting up payouts\."/u,
    );
    assert.doesNotMatch(
      domain,
      /createPayMongoLinkedAccountInvite|api\.paymongo\.com/u,
    );
  },
);

test(
  "provider payout onboarding callables are exported",
  () => {
    assert.match(
      index,
      /startProviderPayoutOnboarding/u,
    );

    assert.match(
      index,
      /refreshProviderPayoutAccount/u,
    );

    assert.match(
      index,
      /saveProviderPayoutActivationProfile/u,
    );
  },
);

test(
  "Accounts API onboarding does not require an invitation id",
  () => {
    const refreshExport =
      management.indexOf(
        "export const refreshProviderPayoutAccount",
      );
    const refreshStart =
      management.indexOf(
        "async function refreshChildAccount",
      );
    const refreshCallable =
      management.slice(
        refreshExport,
        refreshStart,
      );
    const refresh =
      management.slice(refreshStart);

    assert.match(
      management,
      /createPayMongoChildAccount/u,
    );
    assert.match(
      management,
      /createPayMongoIdentityVerificationSession/u,
    );
    assert.match(
      management,
      /rejectBrowserPayoutAuthority/u,
    );
    assert.match(
      refreshCallable,
      /if \(orgAccountId\)/u,
    );
    assert.match(
      refreshCallable,
      /refreshChildAccount/u,
    );
    assert.doesNotMatch(
      refresh.slice(
        0,
        refresh.indexOf("activatePayMongoChildAccount"),
      ),
      /storedInvitationId/u,
    );
    assert.ok(
      refresh.indexOf("if (!profile)") <
      refresh.indexOf("activatePayMongoChildAccount"),
    );
    assert.match(
      management,
      /payoutReady:\s*false/u,
    );
  },
);