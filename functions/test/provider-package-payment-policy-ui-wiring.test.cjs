const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const root =
  path.join(
    __dirname,
    "..",
    "..",
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      ...relativePath.split("/"),
    ),
    "utf8",
  );
}

const page = read(
  "apps/web/src/app/provider/packages/page.tsx",
);

const client = read(
  "apps/web/src/app/provider/packages/provider-packages-client.tsx",
);

const form = read(
  "apps/web/src/app/provider/packages/provider-package-form.tsx",
);

const packageClient = read(
  "apps/web/src/lib/provider/provider-package-client.ts",
);

const service = read(
  "apps/web/src/lib/provider/provider-package-payment-policy-service.ts",
);

test(
  "P11-C2B server-loads the current package payment policy",
  () => {
    assert.match(
      service,
      /^import "server-only";/u,
    );

    assert.match(
      service,
      /adminDb/u,
    );

    assert.match(
      service,
      /\.collection\("appSettings"\)[\s\S]*\.doc\("platform"\)/u,
    );

    assert.match(
      page,
      /getProviderPackagePaymentPolicyBounds/u,
    );

    assert.match(
      page,
      /paymentPolicyBounds=\{paymentPolicyBounds\}/u,
    );
  },
);

test(
  "P11-C2B passes current payment bounds into the Provider package form",
  () => {
    assert.match(
      client,
      /paymentPolicyBounds/u,
    );

    assert.match(
      client,
      /<ProviderPackageForm[\s\S]*paymentPolicyBounds=\{paymentPolicyBounds\}/u,
    );

    assert.match(
      form,
      /minimumDepositPercentageAllowed/u,
    );

    assert.match(
      form,
      /maximumDepositPercentageAllowed/u,
    );

    assert.match(
      form,
      /minimumBalanceDaysAllowed/u,
    );

    assert.match(
      form,
      /maximumBalanceDaysAllowed/u,
    );
  },
);

test(
  "P11-C2B removes hard-coded 20 to 80 and 1 to 30 form validation",
  () => {
    assert.doesNotMatch(
      form,
      /parsedDepositPercentage < 20|parsedDepositPercentage > 80/u,
    );

    assert.doesNotMatch(
      form,
      /parsedBalanceDueDays < 1[\s\S]*parsedBalanceDueDays > 30/u,
    );

    assert.match(
      form,
      /Current FEASTA policy allows/u,
    );
  },
);

test(
  "P11-C2B web package parser preserves saved package terms across the permanent envelope",
  () => {
    assert.match(
      packageClient,
      /depositPercentage <= 0/u,
    );

    assert.match(
      packageClient,
      /depositPercentage >= 100/u,
    );

    assert.match(
      packageClient,
      /balanceDueDaysBeforeEvent > 365/u,
    );

    assert.doesNotMatch(
      packageClient,
      /depositPercentage < 20|depositPercentage > 80/u,
    );
  },
);

test(
  "P11-C2B UI does not become financial authority",
  () => {
    assert.doesNotMatch(
      form,
      /appSettings|firebase\/firestore|getFirestore/u,
    );

    assert.doesNotMatch(
      client,
      /appSettings|firebase\/firestore|getFirestore/u,
    );

    assert.match(
      service,
      /providerPackagePaymentPolicyBoundsFromData/u,
    );
  },
);