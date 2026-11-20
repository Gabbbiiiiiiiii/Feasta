import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const page =
  readFileSync(
    "src/app/provider/packages/page.tsx",
    "utf8",
  );

const client =
  readFileSync(
    "src/app/provider/packages/provider-packages-client.tsx",
    "utf8",
  );

describe(
  "provider package category options",
  () => {
    it(
      "loads active categories from the server service",
      () => {
        expect(page).toContain(
          "getActiveServiceCategoryOptions",
        );
      },
    );

    it(
      "keeps only assigned catering categories",
      () => {
        expect(page).toContain(
          'category.serviceType ===',
        );

        expect(page).toContain(
          '"catering"',
        );

        expect(page).toContain(
          "providerServiceCategories.includes",
        );
      },
    );

    it(
      "passes code and name options to the package client",
      () => {
        expect(page).toContain(
          "packageCategoryOptions={packageCategoryOptions}",
        );

        expect(client).toContain(
          "packageCategoryOptions: readonly {",
        );
      },
    );
  },
);
