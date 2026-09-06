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

function source(path: string) {
  return readFileSync(
    join(process.cwd(), path),
    "utf8",
  );
}

const serviceSource = source(
  "src/lib/admin/settings/admin-settings-service.ts",
);

const validationSource = source(
  "src/lib/admin/settings/admin-settings-validation.ts",
);

const actionSource = source(
  "src/app/admin/settings/actions.ts",
);

const clientSource = source(
  "src/components/admin/settings/admin-settings-client.tsx",
);

describe(
  "Admin platform settings service contract",
  () => {
    it(
      "captures input values before deferred state updaters",
      () => {
        const synchronousValueCaptures =
          clientSource.match(
            /const value\s*=\s*event\.currentTarget\.value;/gu,
          ) ?? [];

        expect(
          synchronousValueCaptures,
        ).toHaveLength(5);

        expect(clientSource).not.toMatch(
          /(?:platformName|operatingCity|supportEmail|serviceAreaDescription):\s*event\.currentTarget\.value/u,
        );

        expect(clientSource).not.toMatch(
          /setInternalReason\(\s*event\.currentTarget\.value/u,
        );
      },
    );

    it(
      "requires administrator authorization",
      () => {
        expect(serviceSource).toContain(
          "await requireAdmin();",
        );

        expect(serviceSource).toContain(
          "const administrator = await requireAdmin();",
        );

        expect(actionSource).toContain(
          "await requireAdmin();",
        );
      },
    );

    it(
      "uses the dedicated platform settings document",
      () => {
        expect(serviceSource).toContain(
          'PLATFORM_SETTINGS_DOCUMENT = "platform"',
        );

        expect(serviceSource).toContain(
          "FIRESTORE_COLLECTIONS.appSettings",
        );

        expect(serviceSource).not.toContain(
          '.doc("adminDashboard")',
        );
      },
    );

    it(
      "writes settings and audit evidence atomically",
      () => {
        expect(serviceSource).toContain(
          "adminDb.runTransaction(",
        );

        expect(serviceSource).toContain(
          "ADMIN_LOGS_COLLECTION",
        );

        expect(serviceSource).toContain(
          "transaction.create(",
        );

        expect(serviceSource).toContain(
          "before:",
        );

        expect(serviceSource).toContain(
          "after:",
        );
      },
    );

    it(
      "keeps canonical fields server controlled",
      () => {
        expect(serviceSource).toContain(
          'timezone: "Asia/Manila"',
        );

        expect(serviceSource).toContain(
          'currencyCode: "PHP"',
        );

        expect(serviceSource).toContain(
          "schemaVersion: 1",
        );

        expect(serviceSource).toContain(
          "isPublic: true",
        );
      },
    );

    it(
      "keeps the internal reason in the audit record",
      () => {
        expect(serviceSource).toContain(
          "reason: update.internalReason",
        );

        expect(serviceSource).not.toContain(
          "internalReason: update.internalReason",
        );
      },
    );

    it(
      "rejects unknown fields and exposes no deletion",
      () => {
        expect(validationSource).toContain(
          "allowedInputKeys",
        );

        expect(validationSource).toContain(
          "cannot be modified",
        );

        expect(serviceSource).not.toMatch(
          /\.delete\s*\(/u,
        );

        expect(actionSource).not.toMatch(
          /deleteAdminPlatform/u,
        );
      },
    );
  },
);
