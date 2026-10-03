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
  "admin provider tax-profile review contract",
  () => {
    const root =
      process.cwd();

    const service =
      readFileSync(
        join(
          root,
          "src/lib/admin/provider-verification/provider-verification-service.ts",
        ),
        "utf8",
      );

    const client =
      readFileSync(
        join(
          root,
          "src/lib/admin/provider-verification/provider-verification-client.ts",
        ),
        "utf8",
      );

    const panel =
      readFileSync(
        join(
          root,
          "src/components/admin/provider-verification/provider-verification-review-panel.tsx",
        ),
        "utf8",
      );

    const backend =
      readFileSync(
        join(
          root,
          "../../functions/src/providers/provider-tax-profile.ts",
        ),
        "utf8",
      );

    it(
      "loads the tax profile only through the trusted admin review service",
      () => {
        expect(
          service,
        ).toContain(
          '"providerTaxProfiles"',
        );

        expect(
          service,
        ).toContain(
          "mapProviderTaxProfileReview",
        );

        expect(
          service,
        ).toContain(
          "getString(data.providerId)",
        );

        expect(
          service,
        ).toContain(
          "getString(data.ownerId)",
        );
      },
    );

    it(
      "uses the dedicated tax review callable",
      () => {
        expect(
          client,
        ).toContain(
          '"reviewProviderTaxProfile"',
        );

        expect(
          client,
        ).toContain(
          'action: ProviderTaxReviewAction',
        );

        expect(
          panel,
        ).toContain(
          "reviewProviderTaxProfile",
        );
      },
    );

    it(
      "keeps business verification and tax verification independent",
      () => {
        expect(
          panel,
        ).toContain(
          "Tax profile verification",
        );

        expect(
          panel,
        ).toContain(
          "does not approve, reject, or",
        );

        expect(
          panel,
        ).toContain(
          "FEASTA&apos;s platform tax settings",
        );

        expect(
          backend,
        ).toContain(
          "Only pending tax profiles can be reviewed.",
        );

        expect(
          backend,
        ).toContain(
          "provider.tax_profile_verified",
        );

        expect(
          backend,
        ).toContain(
          "provider.tax_profile_rejected",
        );
      },
    );

    it(
      "does not infer tax status from provider approval",
      () => {
        expect(
          service,
        ).toContain(
          "parseTaxRegistrationStatus",
        );

        expect(
          panel,
        ).toContain(
          "Provider tax classification",
        );

        expect(
          panel,
        ).toContain(
          "Verify Tax Profile",
        );

        expect(
          panel,
        ).toContain(
          "Approve provider",
        );
      },
    );
  },
);
