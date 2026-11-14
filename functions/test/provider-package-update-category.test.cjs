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
      "../src/packages/update-provider-package.ts",
    ),
    "utf8",
  );

test(
  "package update accepts and requires serviceCategoryCode",
  () => {
    assert.ok(
      source.includes(
        '"serviceCategoryCode"',
      ),
    );

    assert.ok(
      source.includes(
        "serviceCategoryCode:\n        input.serviceCategoryCode",
      ) ||
      source.includes(
        "serviceCategoryCode:\r\n        input.serviceCategoryCode",
      ),
    );

    assert.ok(
      source.includes(
        "assertCanonicalPackageServiceCategory",
      ),
    );
  },
);

test(
  "package update validates category against Firestore",
  () => {
    assert.ok(
      source.includes(
        "requireActiveServiceCategoryInTransaction",
      ),
    );

    assert.ok(
      source.includes(
        "validated.serviceCategoryCode",
      ),
    );

    assert.ok(
      source.includes(
        '"catering"',
      ),
    );
  },
);

test(
  "package update persists service category",
  () => {
    assert.ok(
      source.includes(
        "serviceCategoryCode:",
      ),
    );

    assert.ok(
      source.includes(
        "validated.serviceCategoryCode",
      ),
    );
  },
);
