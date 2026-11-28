import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const source =
  readFileSync(
    "src/lib/provider/provider-package-client.ts",
    "utf8",
  );

describe(
  "provider package category client contract",
  () => {
    it(
      "requires serviceCategoryCode for new package writes",
      () => {
        expect(source).toContain(
          "serviceCategoryCode: string;",
        );

        expect(source).toContain(
          "input.serviceCategoryCode.trim()",
        );
      },
    );

    it(
      "keeps historical packages readable without a category",
      () => {
        expect(source).toContain(
          "ServiceCategoryCode | null",
        );

        expect(source).toContain(
          "optionalServiceCategoryCode",
        );

        expect(source).toContain(
          "data.serviceCategoryCode",
        );
      },
    );

    it(
      "rejects structurally invalid stored category codes",
      () => {
        expect(source).toContain(
          "isServiceCategoryCode(value)",
        );

        expect(source).toContain(
          "throw invalidPackageRecord()",
        );
      },
    );
  },
);
