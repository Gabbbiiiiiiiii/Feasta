import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

describe(
  "provider tax-profile contract",
  () => {
    const root =
      process.cwd();

    const service =
      readFileSync(
        join(
          root,
          "src/lib/provider/tax-profile/provider-tax-profile-service.ts",
        ),
        "utf8",
      );

    const client =
      readFileSync(
        join(
          root,
          "src/lib/provider/tax-profile/provider-tax-profile-client.ts",
        ),
        "utf8",
      );

    const page =
      readFileSync(
        join(
          root,
          "src/app/provider/tax-profile/page.tsx",
        ),
        "utf8",
      );

    const workspace =
      readFileSync(
        join(
          root,
          "src/app/provider/tax-profile/provider-tax-profile-client.tsx",
        ),
        "utf8",
      );

    const navigation =
      readFileSync(
        join(
          root,
          "src/components/layout/navigation.ts",
        ),
        "utf8",
      );

    it(
      "loads only the linked provider tax profile through the server",
      () => {
        expect(
          service,
        ).toContain(
          "requireProviderCatalogAccess",
        );

        expect(
          service,
        ).toContain(
          '"providerTaxProfiles"',
        );

        expect(
          service,
        ).toContain(
          "provider.ownerId",
        );

        expect(
          page,
        ).toContain(
          "await getProviderTaxProfile()",
        );

        expect(
          page,
        ).not.toMatch(
          /firebase|collection\(|getDoc\(/u,
        );
      },
    );

    it(
      "uses only the trusted callable for browser mutation",
      () => {
        expect(
          client,
        ).toContain(
          '"submitProviderTaxProfile"',
        );

        expect(
          workspace,
        ).toContain(
          "submitProviderTaxProfile",
        );

        expect(
          workspace,
        ).not.toMatch(
          /setDoc\(|updateDoc\(|addDoc\(/u,
        );
      },
    );

    it(
      "keeps provider tax status independent",
      () => {
        expect(
          workspace,
        ).toContain(
          "does not automatically mean",
        );

        expect(
          workspace,
        ).toContain(
          "does not automatically determine",
        );

        expect(
          workspace,
        ).toContain(
          "FEASTA&apos;s own platform tax settings",
        );
      },
    );

    it(
      "adds the provider Tax Profile navigation without exposing it before a provider profile exists",
      () => {
        expect(
          navigation,
        ).toContain(
          'href: "/provider/tax-profile"',
        );

        expect(
          navigation,
        ).toContain(
          "providerLinkedRestrictedNavigation",
        );

        expect(
          navigation,
        ).toContain(
          "providerTaxProfileNavigation",
        );
      },
    );
  },
);
