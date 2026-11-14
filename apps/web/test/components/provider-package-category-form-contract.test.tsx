import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const form =
  readFileSync(
    "src/app/provider/packages/provider-package-form.tsx",
    "utf8",
  );

const client =
  readFileSync(
    "src/app/provider/packages/provider-packages-client.tsx",
    "utf8",
  );

describe(
  "provider package category form contract",
  () => {
    it(
      "requires explicit selection instead of silently selecting the first option",
      () => {
        expect(form).toContain(
          'initialPackage?.serviceCategoryCode ??',
        );

        expect(form).toContain(
          '""',
        );

        expect(form).toContain(
          '<option value="">',
        );

        expect(form).toContain(
          "Choose a service category",
        );
      },
    );

    it(
      "validates the selected category against server-provided options",
      () => {
        expect(form).toContain(
          "packageCategoryOptions.some",
        );

        expect(form).toContain(
          "category.code ===",
        );

        expect(form).toContain(
          "serviceCategoryCode",
        );
      },
    );

    it(
      "submits the category with package mutations",
      () => {
        expect(form).toMatch(
          /const input: ProviderPackageInput = \{[\s\S]*?serviceCategoryCode,/u,
        );
      },
    );

    it(
      "passes dynamic category options from client to form",
      () => {
        expect(client).toContain(
          "packageCategoryOptions={packageCategoryOptions}",
        );
      },
    );

    it(
      "fails closed when no active package category is available",
      () => {
        expect(form).toContain(
          "packageCategoryOptions.length === 0",
        );

        expect(form).toContain(
          "Package setup is unavailable",
        );
      },
    );
  },
);
