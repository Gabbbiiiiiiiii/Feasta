const assert =
  require("node:assert/strict");

const {
  readFileSync,
} = require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const source =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/packages/publish-provider-package.ts",
    ),
    "utf8",
  );

test(
  "package publication requires canonical service category",
  () => {
    const categoryCall =
      source.search(
        /assertCanonicalPackageServiceCategory\s*\(\s*validated\s*,\s*\)/u,
      );

    const paymentCall =
      source.search(
        /assertCanonicalPackagePaymentTerms\s*\(\s*validated\s*,\s*\)/u,
      );

    assert.ok(
      categoryCall >= 0,
    );

    assert.ok(
      paymentCall >
        categoryCall,
    );
  },
);

test(
  "package publication revalidates category against Firestore",
  () => {
    assert.match(
      source,
      /requireActiveServiceCategoryInTransaction\s*\(\s*transaction\s*,\s*validated\.serviceCategoryCode\s*,\s*"catering"\s*,\s*"serviceCategoryCode"\s*,?\s*\)/u,
    );
  },
);

test(
  "category validation happens before package becomes public",
  () => {
    const validation =
      source.search(
        /await\s+requireActiveServiceCategoryInTransaction/u,
      );

    const publication =
      source.search(
        /status:\s*"published"/u,
      );

    assert.ok(
      validation >= 0,
    );

    assert.ok(
      publication >
        validation,
    );
  },
);
