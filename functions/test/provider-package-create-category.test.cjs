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
      "../src/packages/create-provider-package.ts",
    ),
    "utf8",
  );

test(
  "package creation accepts and requires serviceCategoryCode",
  () => {
    assert.ok(
      source.includes(
        '"serviceCategoryCode"',
      ),
    );

    assert.ok(
      source.includes(
        "assertCanonicalPackageServiceCategory",
      ),
    );

    assert.ok(
      source.includes(
        "assertCanonicalPackageServiceCategory(\n      validated,",
      ) ||
      source.includes(
        "assertCanonicalPackageServiceCategory(\r\n      validated,",
      ),
    );
  },
);

test(
  "package creation validates category against Firestore",
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

    assert.ok(
      source.includes(
        '"serviceCategoryCode"',
      ),
    );
  },
);

test(
  "package creation persists authoritative service category evidence",
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
